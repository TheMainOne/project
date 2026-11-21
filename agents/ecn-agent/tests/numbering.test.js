import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNumberer } from "../src/numbering.js";
import { openNumberingStore } from "../src/numbering-store.js";
import { SmartsheetError } from "../src/smartsheet.js";
import { creationDay, isNumberingCandidate } from "../src/numbering-rules.js";

const row = (id, values = {}) => ({ id: String(id), rowNumber: Number(id), createdAt: "2026-11-20T13:00:00Z", status: "Initial Review", ecnNumber: "", numberOccupied: false, numberWritable: true, ...values });
function fixture(t, rows = [row(1000)], archive = []) {
  const directory = mkdtempSync(join(tmpdir(), "ecn-numbering-test-"));
  const path = join(directory, "numbering.sqlite");
  const ledger = openNumberingStore(path);
  t.after(() => { ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  const state = { rows, archive, version: 1, writes: [], events: [], archiveReads: 0 };
  const api = {
    async readSheet() { return structuredClone({ version: state.version, rows: state.rows }); },
    async readInventory() { state.archiveReads++; return { rows: structuredClone(state.archive) }; },
    async readRow(id) { const found = state.rows.find(item => item.id === id); if (!found) throw new Error("missing"); return { ...structuredClone(found), sheetVersion: state.version }; },
    async assignNumber(id, number) {
      state.writes.push({ id, number }); state.version++;
      Object.assign(state.rows.find(item => item.id === id), { ecnNumber: number, numberOccupied: true });
    },
  };
  const create = extra => createNumberer({ api, ledger, enabled: true, addEvent: (...event) => state.events.push(event), archiveSheetId: "9000", archiveColumnId: "9001", ...extra });
  return { state, ledger, api, create, numberer: create() };
}

test("eligibility is precisely empty number plus Initial Review; date uses creation in New York", () => {
  assert.equal(isNumberingCandidate(row(1)), true); // No Requested By, description or item is required.
  assert.equal(isNumberingCandidate(row(1, { status: " initial review " })), true);
  for (const status of ["", "Approved", "Sent for Approvals", "Complete and Closed"]) assert.equal(isNumberingCandidate(row(1, { status })), false);
  assert.equal(isNumberingCandidate(row(1, { ecnNumber: "existing" })), false);
  assert.equal(isNumberingCandidate(row(1, { numberOccupied: true })), false);
  assert.equal(creationDay("2026-11-21T02:00:00Z"), "20261120");
  assert.equal(creationDay("2026-07-01T04:00:00Z"), "20260701");
  assert.equal(creationDay("2026-03-08T07:00:00Z"), "20260308");
  assert.throws(() => creationDay(null)); assert.throws(() => creationDay("2026-11-20"));
});

test("assigns ordered daily numbers after both current and archive maxima, then does no work twice", async t => {
  const { state, numberer } = fixture(t, [row(1002), row(1001), row(1003, { createdAt: "2026-11-21T14:00:00Z" }), row(1004, { status: "" }), row(1005, { ecnNumber: "20261120-03", numberOccupied: true })], [row(999, { ecnNumber: "20261120-06" })]);
  assert.equal((await numberer.run()).error, null);
  assert.deepEqual(state.writes, [{ id: "1001", number: "20261120-07" }, { id: "1002", number: "20261120-08" }, { id: "1003", number: "20261121-01" }]);
  const reads = state.archiveReads;
  await numberer.run();
  assert.equal(state.writes.length, 3); assert.equal(state.archiveReads, reads);
  assert.equal(state.events.filter(([kind]) => kind === "numbering_assigned").length, 3);
});

test("changes to number or status just before a write are preserved", async t => {
  for (const change of [{ ecnNumber: "MANUAL-1", numberOccupied: true }, { status: "Approved" }]) {
    const { api, state, numberer } = fixture(t);
    const read = api.readRow;
    api.readRow = async id => { Object.assign(state.rows[0], change); return read(id); };
    assert.equal((await numberer.run()).writes, 0);
    assert.equal(state.writes.length, 0);
    for (const [key, value] of Object.entries(change)) assert.equal(state.rows[0][key], value);
  }
});

test("archive failures, changing snapshots, missing creation dates and insufficient permissions prevent writes", async t => {
  for (const setup of [
    f => { f.api.readInventory = async () => { throw new SmartsheetError("read_failed", "archive unavailable"); }; },
    f => { f.api.readInventory = async () => { f.state.version++; return { rows: [] }; }; },
    f => { f.state.rows[0].createdAt = null; },
    f => { f.state.rows[0].numberWritable = false; },
    f => { const read = f.api.readRow; f.api.readRow = async id => { f.state.version++; return read(id); }; },
  ]) {
    const f = fixture(t); setup(f);
    assert.ok((await f.numberer.run()).error);
    assert.equal(f.state.writes.length, 0);
  }
});

test("a reservation skipped after a status change can resume if the row returns to Initial Review", async t => {
  const { api, state, ledger, numberer } = fixture(t);
  const read = api.readRow;
  api.readRow = async id => { state.rows[0].status = "Approved"; return read(id); };
  await numberer.run();
  assert.equal(state.writes.length, 0); assert.equal(ledger.assignment("1000").state, "cancelled");
  state.rows[0].status = "Initial Review"; api.readRow = read;
  assert.equal((await numberer.run()).assigned, 1);
  assert.deepEqual(state.writes, [{ id: "1000", number: "20261120-01" }]);
});

test("lost write response is reconciled by readback without repeating the mutation", async t => {
  const { api, state, ledger, numberer } = fixture(t);
  const assign = api.assignNumber;
  api.assignNumber = async (...args) => { await assign(...args); throw new SmartsheetError("write_uncertain", "connection lost"); };
  assert.equal((await numberer.run()).assigned, 1);
  assert.equal(ledger.assignment("1000").state, "assigned");
  await numberer.run(); assert.equal(state.writes.length, 1);
});

test("unresolved writes survive a restarted worker without retry and recover when the number appears", async t => {
  const { api, state, ledger, create, numberer } = fixture(t);
  api.assignNumber = async (id, number) => { state.writes.push({ id, number }); throw new SmartsheetError("write_uncertain", "timeout"); };
  assert.ok((await numberer.run()).error);
  assert.equal(ledger.assignment("1000").state, "uncertain");
  const restarted = create();
  assert.ok((await restarted.run()).error); assert.equal(state.writes.length, 1);
  Object.assign(state.rows[0], { ecnNumber: "20261120-01", numberOccupied: true });
  assert.equal((await restarted.run()).assigned, 1);
  assert.equal(ledger.assignment("1000").state, "assigned");
  assert.equal(state.writes.length, 1);
});

test("a reserved number claimed by another row is never written to this row", async t => {
  const { state, ledger, numberer } = fixture(t);
  ledger.reserve("1000", "20261120");
  state.archive.push(row(2000, { ecnNumber: "20261120-01" }));
  assert.ok((await numberer.run()).error);
  assert.equal(ledger.assignment("1000").state, "conflict");
  assert.equal(state.writes.length, 0);
});

test("definitively rejected writes can reuse the reservation after a new eligibility check", async t => {
  const { api, state, ledger, numberer } = fixture(t);
  const assign = api.assignNumber;
  api.assignNumber = async () => { throw new SmartsheetError("write_failed", "rate limited"); };
  assert.ok((await numberer.run()).error);
  assert.equal(ledger.assignment("1000").state, "reserved");
  api.assignNumber = assign;
  assert.equal((await numberer.run()).assigned, 1);
  assert.deepEqual(state.writes, [{ id: "1000", number: "20261120-01" }]);
});

test("overlapping runs share work and disabling or stopping the worker prevents writes", async t => {
  const { api, state, create, numberer } = fixture(t);
  const read = api.readSheet; const gate = Promise.withResolvers();
  api.readSheet = async () => { await gate.promise; return read(); };
  const first = numberer.run(); const second = numberer.run();
  assert.equal(first, second); gate.resolve(); await first;
  assert.equal(state.writes.length, 1);
  state.rows.push(row(1001));
  await create({ enabled: false }).run();
  numberer.stop(); await numberer.run();
  assert.equal(state.writes.length, 1);
  assert.equal((await create({ maxPerCycle: 1 }).run()).assigned, 1);
});
