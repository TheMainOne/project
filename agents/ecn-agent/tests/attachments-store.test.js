import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createMonitor } from "../src/monitor.js";
import { SmartsheetError } from "../src/smartsheet.js";
import { openStore } from "../src/store.js";
import { SHEET_ID, normalizedSheet } from "./fixtures.js";

function attachment(id = "8000", overrides = {}) {
  return {
    id, parentId: "1000", parentType: "ROW", attachmentType: "FILE",
    attachmentSubType: "", mimeType: "application/pdf", name: "Drawing.pdf", sizeInKb: 24,
    createdAt: "2026-11-17T15:00:00Z", author: { name: "Test Engineer", email: "engineer@example.test" },
    ...overrides,
  };
}

function sheetWithAttachments(attachments = [attachment()]) {
  const sheet = normalizedSheet();
  sheet.attachmentsLoaded = true;
  sheet.rows[0].attachments = attachments;
  return sheet;
}

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "ecn-attachments-store-"));
  const path = join(directory, "state.sqlite");
  const fixture = { path, store: openStore(path, SHEET_ID) };
  t.after(() => {
    fixture.store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return fixture;
}

function attachmentEvents(store) {
  return store.state().events.filter(event => event.kind.startsWith("attachment_"));
}

test("attachments establish a quiet baseline, expose summaries and survive restart", t => {
  const fixtureState = fixture(t);
  let { store } = fixtureState;
  const sheet = sheetWithAttachments([
    attachment(),
    attachment("8001", { parentType: "COMMENT", parentId: "7000", name: "Comment drawing.pdf" }),
  ]);
  const summary = store.saveSheet(sheet, store.beginRun());
  assert.deepEqual(summary.attachments, { added: 0, edited: 0, removed: 0 });
  assert.deepEqual(attachmentEvents(store), []);
  const state = store.state();
  assert.equal(state.attachmentsLoaded, true);
  assert.ok(state.attachmentsSyncAt);
  assert.equal(state.counts.attachments, 2);
  assert.equal(state.rows[0].attachmentCount, 2);
  assert.equal(Object.hasOwn(state.rows[0], "attachments"), false);
  assert.equal(store.row("1000").attachmentsLoaded, true);
  assert.deepEqual(store.row("1000").attachments, sheet.rows[0].attachments);

  store.close();
  fixtureState.store = store = openStore(fixtureState.path, SHEET_ID);
  assert.deepEqual(store.row("1000").attachments, sheet.rows[0].attachments);
  assert.equal(store.state().attachmentsSyncAt, state.attachmentsSyncAt);
  store.saveSheet(sheet, store.beginRun());
  assert.equal(store.state().events.filter(event => event.kind === "attachments_baseline").length, 1);
  assert.deepEqual(attachmentEvents(store), []);
});

test("attachment additions, edits and removals are recorded once without row-change events", t => {
  const { store } = fixture(t);
  const sheet = sheetWithAttachments();
  store.saveSheet(sheet, store.beginRun());
  sheet.rows[0].attachments.push(attachment("8001", { name: "Specification.pdf" }));
  assert.deepEqual(store.saveSheet(sheet, store.beginRun()).attachments, { added: 1, edited: 0, removed: 0 });
  store.saveSheet(sheet, store.beginRun());
  sheet.rows[0].attachments[0].name = "Revised drawing.pdf";
  assert.deepEqual(store.saveSheet(sheet, store.beginRun()).attachments, { added: 0, edited: 1, removed: 0 });
  store.saveSheet(sheet, store.beginRun());
  sheet.rows[0].attachments.splice(1, 1);
  assert.deepEqual(store.saveSheet(sheet, store.beginRun()).attachments, { added: 0, edited: 0, removed: 1 });
  store.saveSheet(sheet, store.beginRun());

  const events = attachmentEvents(store);
  assert.deepEqual(events.map(event => event.kind).sort(), ["attachment_added", "attachment_edited", "attachment_removed"]);
  assert.ok(events.every(event => event.rowId === "1000"));
  assert.equal(store.state().events.filter(event => event.kind === "row_changed").length, 0);
  assert.equal(store.state().counts.attachments, 1);
  assert.equal(store.row("1000").attachments[0].name, "Revised drawing.pdf");
});

test("a v0.2 database gains attachment metadata without reporting existing files as new", t => {
  const fixtureState = fixture(t);
  fixtureState.store.close();
  const oldSheet = normalizedSheet();
  const oldRow = oldSheet.rows[0];
  delete oldRow.attachments;
  const { rowNumber, modifiedAt, discussions, ...oldContent } = oldRow;
  const oldHash = createHash("sha256").update(JSON.stringify(oldContent)).digest("hex");
  const db = new DatabaseSync(fixtureState.path);
  db.prepare("INSERT INTO rows (id, hash, snapshot) VALUES (?, ?, ?)").run(oldRow.id, oldHash, JSON.stringify(oldRow));
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run("lastSyncAt", JSON.stringify("2026-11-17T15:00:00Z"));
  db.close();
  const store = fixtureState.store = openStore(fixtureState.path, SHEET_ID);
  assert.equal(store.state().attachmentsLoaded, false);
  assert.equal(store.row("1000").attachmentCount, 0);
  const sheet = sheetWithAttachments();
  const summary = store.saveSheet(sheet, store.beginRun());
  assert.equal(summary.changed, 0);
  assert.deepEqual(summary.attachments, { added: 0, edited: 0, removed: 0 });
  assert.deepEqual(attachmentEvents(store), []);
  assert.equal(store.state().events.filter(event => event.kind === "row_changed").length, 0);
  assert.equal(store.state().counts.attachments, 1);
  sheet.rows[0].attachments.push(attachment("8001"));
  assert.equal(store.saveSheet(sheet, store.beginRun()).attachments.added, 1);
});

test("a failed attachment read preserves the last complete snapshot and attachment sync timestamp", async t => {
  const { store } = fixture(t);
  let fail = false;
  const monitor = createMonitor({
    reader: { read: async () => {
      if (fail) throw new SmartsheetError("http_503", "Attachment service unavailable");
      return sheetWithAttachments();
    } },
    store, pollSeconds: 120, tokenConfigured: true,
  });
  try {
    assert.equal((await monitor.sync()).ok, true);
    const before = store.state();
    const rowBefore = store.row("1000");
    fail = true;
    assert.equal((await monitor.sync()).ok, false);
    assert.deepEqual(store.row("1000"), rowBefore);
    assert.equal(store.state().lastSyncAt, before.lastSyncAt);
    assert.equal(store.state().attachmentsSyncAt, before.attachmentsSyncAt);
    assert.equal(store.state().lastRun.status, "error");
    assert.deepEqual(attachmentEvents(store), []);
  } finally {
    await monitor.stop();
  }
});

test("snapshot failure rolls back attachment changes and their events", t => {
  const { store } = fixture(t);
  const sheet = sheetWithAttachments();
  store.saveSheet(sheet, store.beginRun());
  const before = store.state();
  const modified = structuredClone(sheet);
  modified.rows[0].attachments = [attachment("8001")];
  const invalid = { id: "1001" };
  invalid.circular = invalid;
  modified.rows.push(invalid);
  assert.throws(() => store.saveSheet(modified, store.beginRun()));
  assert.deepEqual(store.row("1000").attachments, sheet.rows[0].attachments);
  assert.equal(store.state().attachmentsSyncAt, before.attachmentsSyncAt);
  assert.deepEqual(attachmentEvents(store), []);
});
