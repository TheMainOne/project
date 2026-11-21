import test from "node:test";
import assert from "node:assert/strict";
import { createNumberingApi } from "../src/numbering-api.js";
import { FIELDS } from "../src/smartsheet.js";
import { isNumberingCandidate } from "../src/numbering-rules.js";

const sheetId = "5485143814104964";
const columns = [{ id: Number(FIELDS.ecnNumber), type: "TEXT_NUMBER", locked: true }, { id: Number(FIELDS.status), type: "PICKLIST" }];
const rawRow = (id = 1000) => ({ id, rowNumber: id - 999, createdAt: "2026-11-20T13:00:00Z", cells: [{ columnId: Number(FIELDS.ecnNumber) }, { columnId: Number(FIELDS.status), value: "Initial Review" }] });
const rawSheet = (rows = [rawRow()]) => ({ id: Number(sheetId), version: 42, totalRowCount: rows.length, accessLevel: "ADMIN", columns, rows });
const apiWith = fetchImpl => createNumberingApi({ sheetId, token: "test-secret", fetchImpl });

test("numbering scans every working page and verifies the sheet version", async () => {
  const calls = [];
  const api = apiWith(async (url, options) => {
    assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
    assert.equal(url.searchParams.get("columnIds"), FIELDS.ecnNumber + "," + FIELDS.status);
    const page = Number(url.searchParams.get("page")); calls.push(page);
    const rows = page === 1 ? Array.from({ length: 500 }, (_, i) => rawRow(1000 + i)) : [rawRow(1500)];
    return Response.json({ ...rawSheet(rows), totalRowCount: 501 });
  });
  const result = await api.readSheet();
  assert.deepEqual(calls, [1, 2, 1]);
  assert.equal(result.rows.length, 501);
  assert.equal(result.rows[0].numberWritable, true);
  assert.equal(isNumberingCandidate(result.rows[0]), true);
});

test("archive uses its own number column and rejects partial or changing inventories", async () => {
  const archiveId = "1234", columnId = "5678";
  const value = { id: 1234, version: 2, totalRowCount: 1, columns: [{ id: 5678, type: "TEXT_NUMBER" }], rows: [{ id: 7777, cells: [{ columnId: 5678, value: "20261120-23" }] }] };
  const api = apiWith(async url => { assert.equal(url.pathname, "/2.0/sheets/1234"); assert.equal(url.searchParams.get("columnIds"), columnId); return Response.json(value); });
  assert.deepEqual((await api.readInventory(archiveId, columnId)).rows, [{ id: "7777", ecnNumber: "20261120-23" }]);
  for (const bad of [{ ...value, totalRowCount: 2 }, { ...value, rows: [...value.rows, ...value.rows], totalRowCount: 2 }, { ...value, columns: [] }]) {
    await assert.rejects(apiWith(async () => Response.json(bad)).readInventory(archiveId, columnId));
  }
  let count = 0;
  await assert.rejects(apiWith(async () => Response.json({ ...value, version: ++count })).readInventory(archiveId, columnId), { code: "numbering_changed" });
});

test("fresh row distinguishes blank cells from formulas and checks locked-column permissions", async () => {
  const raw = { ...rawRow(), sheetId: Number(sheetId), version: 42, accessLevel: "ADMIN", columns };
  const read = value => apiWith(async url => { assert.match(url.searchParams.get("include"), /columns/); return Response.json(value); }).readRow("1000");
  assert.equal((await read(raw)).numberWritable, true);
  // Smartsheet may omit empty cells; the column metadata still establishes the blank cell.
  assert.equal(isNumberingCandidate(await read({ ...raw, cells: raw.cells.slice(1) })), true);
  assert.equal((await read({ ...raw, accessLevel: "EDITOR" })).numberWritable, false);
  assert.equal((await read({ ...raw, accessLevel: "VIEWER" })).numberWritable, false);
  assert.equal((await read({ ...raw, lockedForUser: true })).numberWritable, false);
  for (const extra of [{ formula: '=IF(1, "", "")' }, { linkInFromCell: { rowId: 9 } }, { value: " " }, { value: 0 }, { value: false }, { value: "20261120-01" }]) {
    const row = await read({ ...raw, cells: [{ ...raw.cells[0], ...extra }, raw.cells[1]] });
    assert.equal(row.numberOccupied, true);
    assert.equal(isNumberingCandidate(row), false);
  }
  await assert.rejects(read({ ...raw, sheetId: 9999 }));
  await assert.rejects(read({ ...raw, columns: [] }));
});

test("the only mutation is one strict ECN Number cell update to the working sheet", async () => {
  let calls = 0;
  const api = apiWith(async (url, options) => {
    calls++;
    assert.equal(url.href, "https://api.smartsheet.com/2.0/sheets/" + sheetId + "/rows");
    assert.equal(options.method, "PUT"); assert.equal(options.redirect, "error");
    const body = JSON.parse(options.body);
    assert.deepEqual(body, [{ id: 1000, cells: [{ columnId: Number(FIELDS.ecnNumber), value: "20261120-02", strict: true }] }]);
    return Response.json({ resultCode: 0, result: body });
  });
  assert.deepEqual(await api.assignNumber("1000", "20261120-02"), { rowId: "1000", number: "20261120-02" });
  assert.equal(calls, 1);
});

test("write failures are never retried and ambiguous responses remain uncertain without secret leaks", async () => {
  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    let calls = 0;
    const api = apiWith(async () => { calls++; return new Response("test-secret", { status }); });
    await assert.rejects(api.assignNumber("1000", "20261120-01"), error => error.code === (status < 500 ? "write_failed" : "write_uncertain") && !error.message.includes("test-secret"));
    assert.equal(calls, 1);
  }
  for (const handler of [async () => { throw new Error("test-secret"); }, async () => Response.json({ resultCode: 0, result: [] }), async () => new Response("test-secret")]) {
    await assert.rejects(apiWith(handler).assignNumber("1000", "20261120-01"), error => error.code === "write_uncertain" && !error.message.includes("test-secret"));
  }
});

test("bad IDs, numbers and missing token cannot send a mutation", async () => {
  let calls = 0; const fetchImpl = async () => { calls++; throw new Error(); };
  const api = apiWith(fetchImpl);
  for (const id of ["../rows", "9007199254740992", "0"]) await assert.rejects(api.assignNumber(id, "20261120-01"));
  for (const number of ["20260230-01", "20261120-0", "arbitrary"]) await assert.rejects(api.assignNumber("1000", number));
  const noToken = createNumberingApi({ sheetId, token: "", fetchImpl });
  await assert.rejects(noToken.assignNumber("1000", "20261120-01"));
  await assert.rejects(noToken.readSheet());
  assert.equal(calls, 0);
});
