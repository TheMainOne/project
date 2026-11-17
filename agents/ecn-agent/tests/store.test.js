import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../src/store.js";
import { SHEET_ID, normalizedSheet } from "./fixtures.js";

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "ecn-store-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "state.sqlite");
}

test("persists baseline, ignores repeated snapshots and keeps pauses across restart", t => {
  const path = fixture(t);
  let store = openStore(path, SHEET_ID);
  const sheet = normalizedSheet();
  store.saveSheet(sheet, store.beginRun());
  assert.equal(store.state().events.filter(event => event.kind === "row_added").length, 0);
  store.saveSheet(sheet, store.beginRun());
  assert.equal(store.state().events.filter(event => event.kind === "row_changed").length, 0);
  store.setPaused(true);
  store.close();
  store = openStore(path, SHEET_ID);
  assert.equal(store.state().paused, true);
  assert.equal(store.state().rows.length, 1);
  store.saveSheet(sheet, store.beginRun());
  assert.equal(store.state().events.filter(event => event.kind === "row_added").length, 0);
  store.close();
});

test("records one changed row, suppresses positional changes and excludes terminal rows from active totals", t => {
  const store = openStore(fixture(t), SHEET_ID);
  const sheet = normalizedSheet();
  store.saveSheet(sheet, store.beginRun());
  sheet.rows[0].rowNumber = 3;
  sheet.rows[0].modifiedAt = "2026-11-17T16:00:00Z";
  store.saveSheet(sheet, store.beginRun());
  assert.equal(store.state().events.filter(event => event.kind === "row_changed").length, 0);
  for (const status of ["Complete and Closed", "Deleted/Canceled", "Declined"]) {
    sheet.rows[0].status = status;
    store.saveSheet(sheet, store.beginRun());
    assert.equal(store.state().counts.active, 0);
  }
  assert.equal(store.state().events.filter(event => event.kind === "row_changed").length, 3);
  sheet.rows[0].status = "Declined - Awaiting Further Action";
  sheet.rows[0].ecnNumber = "";
  store.saveSheet(sheet, store.beginRun());
  assert.equal(store.state().counts.active, 1);
  assert.equal(store.state().counts.withoutNumber, 1);
  store.close();
});

test("recovery marks an unfinished run once and a failed read preserves existing rows", t => {
  const path = fixture(t);
  let store = openStore(path, SHEET_ID);
  store.saveSheet(normalizedSheet(), store.beginRun());
  store.beginRun();
  store.close();
  store = openStore(path, SHEET_ID);
  store.recover();
  store.recover();
  assert.equal(store.state().events.filter(event => event.kind === "recovered").length, 1);
  const lastSync = store.state().lastSyncAt;
  store.failRun(store.beginRun(), "Connection error");
  assert.equal(store.state().rows.length, 1);
  assert.equal(store.state().lastSyncAt, lastSync);
  assert.equal(store.state().lastRun.status, "error");
  store.close();
});

test("a failure during the snapshot transaction rolls back all rows and events", t => {
  const store = openStore(fixture(t), SHEET_ID);
  const sheet = normalizedSheet();
  store.saveSheet(sheet, store.beginRun());
  const modified = structuredClone(sheet);
  modified.rows[0].status = "Sent for Approvals";
  const circular = { id: "2000" };
  circular.loop = circular;
  modified.rows.push(circular);
  assert.throws(() => store.saveSheet(modified, store.beginRun()));
  assert.equal(store.row("1000").status, "Initial Review");
  assert.equal(store.state().events.filter(event => event.kind === "row_changed").length, 0);
  store.close();
});
