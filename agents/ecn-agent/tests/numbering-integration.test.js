import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSmartsheetReader, FIELDS } from "../src/smartsheet.js";
import { createNumberingApi } from "../src/numbering-api.js";
import { openNumberingStore } from "../src/numbering-store.js";
import { createNumberer } from "../src/numbering.js";
import { createMonitor } from "../src/monitor.js";
import { openStore } from "../src/store.js";
import { SHEET_ID, rawSheet } from "./fixtures.js";

test("monitor numbers the eligible row and refreshes the complete panel snapshot without other writes", async t => {
  const directory = mkdtempSync(join(tmpdir(), "ecn-numbering-integration-"));
  const store = openStore(join(directory, "ecn.sqlite"), SHEET_ID);
  const ledger = openNumberingStore(join(directory, "numbering.sqlite"));
  const raw = rawSheet(); raw.accessLevel = "ADMIN";
  raw.rows[0].createdAt = "2026-11-21T01:00:00Z";
  const cell = raw.rows[0].cells.find(c => String(c.columnId) === FIELDS.ecnNumber); cell.value = "";
  const originalOtherCells = structuredClone(raw.rows[0].cells.filter(c => c !== cell));
  let writes = 0;
  const fetchImpl = async (url, options) => {
    if (options.method === "PUT") {
      writes++;
      const body = JSON.parse(options.body);
      assert.deepEqual(body, [{ id: raw.rows[0].id, cells: [{ columnId: Number(FIELDS.ecnNumber), value: "20261120-10", strict: true }] }]);
      cell.value = body[0].cells[0].value; raw.version++;
      return Response.json({ resultCode: 0, result: body });
    }
    assert.equal(options.method, "GET");
    if (url.pathname.endsWith("/discussions") || url.pathname.endsWith("/attachments")) return Response.json({ pageNumber: 1, totalPages: 0, totalCount: 0, data: [] });
    if (url.pathname === "/2.0/sheets/1234") return Response.json({ id: 1234, version: 1, totalRowCount: 1, columns: [{ id: 5678, type: "TEXT_NUMBER" }], rows: [{ id: 9000, cells: [{ columnId: 5678, value: "20261120-09" }] }] });
    if (url.pathname.endsWith("/rows/1000")) return Response.json({ ...raw.rows[0], sheetId: Number(SHEET_ID), version: raw.version, columns: raw.columns, accessLevel: raw.accessLevel });
    assert.equal(url.pathname, "/2.0/sheets/" + SHEET_ID);
    return Response.json(raw);
  };
  const reader = createSmartsheetReader({ sheetId: SHEET_ID, token: "fake", fetchImpl });
  const numberer = createNumberer({ api: createNumberingApi({ sheetId: SHEET_ID, token: "fake", fetchImpl }), ledger, addEvent: store.addEvent, enabled: true, archiveSheetId: "1234", archiveColumnId: "5678" });
  const monitor = createMonitor({ reader, store, pollSeconds: 120, tokenConfigured: true, numberer });
  t.after(async () => { await monitor.stop(); store.close(); ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  const result = await monitor.sync();
  assert.equal(result.ok, true); assert.equal(result.numbering.assigned, 1);
  assert.equal(writes, 1); assert.equal(store.row("1000").ecnNumber, "20261120-10");
  assert.deepEqual(raw.rows[0].cells.filter(c => c !== cell), originalOtherCells);
  assert.equal(store.row("1000").status, "Initial Review");
  assert.equal(store.state().counts.withoutNumber, 0);
  assert.equal(store.state().commentsLoaded, true); assert.equal(store.state().attachmentsLoaded, true);
  assert.equal(store.state().events.filter(event => event.kind === "numbering_assigned").length, 1);
  assert.equal(monitor.status().numbering.enabled, true);
  await monitor.sync(); assert.equal(writes, 1);
});
