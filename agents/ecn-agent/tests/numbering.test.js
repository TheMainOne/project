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
  const create = extra => createNumberer({ api, ledger, enabled: true, wait: async () => {}, addEvent: (...event) => state.events.push(event), archiveSheetId: "9000", archiveColumnId: "9001", ...extra });
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

test("archive failures, changing snapshots and insufficient sheet permissions stop numbering", async t => {
  for (const setup of [
    f => { f.api.readInventory = async () => { throw new SmartsheetError("read_failed", "archive unavailable"); }; },
    f => { f.api.readInventory = async () => { f.state.version++; return { rows: [] }; }; },
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

test("a transient version change after the first write still allows three rows in one cycle", async t => {
  const { state, api, create } = fixture(t, [row(104), row(105), row(106)]);
  const delays = [];
  const read = api.readInventory;
  api.readInventory = async (...args) => {
    if (state.archiveReads === 1) state.version++;
    return read(...args);
  };
  const worker = create({ wait: async ms => { delays.push(ms); } });
  const result = await worker.run();
  assert.equal(result.error, null);
  assert.equal(result.candidates, 3);
  assert.equal(result.checked, 3);
  assert.equal(result.assigned, 3);
  assert.equal(result.writes, 3);
  assert.equal(result.deferred, 0);
  assert.deepEqual(state.writes, [
    { id: "104", number: "20261120-01" },
    { id: "105", number: "20261120-02" },
    { id: "106", number: "20261120-03" },
  ]);
  assert.deepEqual(delays, [500]);
});

test("continuous changes exhaust three retries before any PUT", async t => {
  const { state, api, create } = fixture(t);
  const delays = [];
  const read = api.readInventory;
  api.readInventory = async (...args) => { state.version++; return read(...args); };
  const worker = create({ wait: async ms => { delays.push(ms); } });
  assert.ok((await worker.run()).error);
  assert.deepEqual(delays, [500, 1000, 2000]);
  assert.equal(state.archiveReads, 4);
  assert.deepEqual(state.writes, []);
});

test("a version mismatch on the fresh row rechecks archive conflicts against the reservation", async t => {
  const { state, api, ledger, create } = fixture(t);
  const read = api.readRow;
  api.readRow = async id => { state.version++; return read(id); };
  const worker = create({ wait: async () => { state.archive.push(row(999, { ecnNumber: "20261120-01" })); } });
  assert.ok((await worker.run()).error);
  assert.equal(ledger.assignment("1000").state, "conflict");
  assert.deepEqual(state.writes, []);
});

test("changes to a candidate during backoff are respected", async t => {
  for (const change of [{ status: "Approved" }, { ecnNumber: "MANUAL", numberOccupied: true }]) {
    const { api, state, create } = fixture(t);
    const read = api.readInventory;
    let first = true;
    api.readInventory = async (...args) => {
      if (first) {
        first = false;
        throw new SmartsheetError("numbering_changed", "pagination changed");
      }
      return read(...args);
    };
    const worker = create({ wait: async () => { Object.assign(state.rows[0], change); } });
    assert.equal((await worker.run()).error, null);
    assert.deepEqual(state.writes, []);
  }
});

test("stopping during a retry delay prevents subsequent reads and writes", async t => {
  const { api, state, create } = fixture(t);
  const read = api.readInventory;
  api.readInventory = async (...args) => { state.version++; return read(...args); };
  const worker = create({ wait: async () => { worker.stop(); } });
  assert.equal((await worker.run()).writes, 0);
  assert.equal(state.archiveReads, 1);
  assert.deepEqual(state.writes, []);
});

test("row locks and missing creation dates defer only those candidates and appear in the journal", async t => {
  const { state, numberer } = fixture(t, [
    row(104, { createdAt: null }), row(105, { numberWritable: false, numberBlockScope: "row", numberBlockedReason: "Строка заблокирована." }), row(106),
  ]);
  const result = await numberer.run();
  assert.equal(result.error, null);
  assert.equal(result.candidates, 3);
  assert.equal(result.blocked, 2);
  assert.equal(result.deferred, 2);
  assert.deepEqual(state.writes, [{ id: "106", number: "20261120-01" }]);
  const skipped = state.events.filter(([kind]) => kind === "numbering_deferred");
  assert.deepEqual(skipped.map(([, , id]) => id).sort(), ["104", "105"]);
  assert.match(skipped.find(([, , id]) => id === "104")[1], /даты создания/);
  const [kind, message] = state.events.at(-1);
  assert.equal(kind, "numbering_summary");
  assert.match(message, /Кандидатов 3, присвоено 1, отложено 2/);
  Object.assign(state.rows[0], { createdAt: row(104).createdAt });
  Object.assign(state.rows[1], { numberWritable: true, numberBlockScope: null });
  assert.equal((await numberer.run()).assigned, 2);
  assert.equal(new Set(state.writes.map(entry => entry.number)).size, 3);
});

test("five newly locked rows cannot starve a writable sixth row in later cycles", async t => {
  const { api, state, numberer } = fixture(t, Array.from({ length: 6 }, (_, i) => row(104 + i)));
  const read = api.readRow;
  api.readRow = async id => {
    const current = await read(id);
    return id === "109" ? current : { ...current, numberWritable: false, numberBlockScope: "row" };
  };
  const first = await numberer.run();
  assert.equal(first.checked, 5);
  assert.equal(first.blocked, 5);
  assert.equal(first.deferred, 6);
  const second = await numberer.run();
  assert.equal(second.checked, 5);
  assert.equal(second.assigned, 1);
  assert.equal(second.deferred, 5);
  assert.deepEqual(state.writes.map(entry => entry.id), ["109"]);
});

test("a global failure after one write identifies the next row and the remaining workload", async t => {
  const { api, state, numberer } = fixture(t, [row(104), row(105), row(106)]);
  const read = api.readInventory;
  api.readInventory = async (...args) => {
    if (state.writes.length) throw new SmartsheetError("numbering_read_403", "Архив недоступен.");
    return read(...args);
  };
  const result = await numberer.run();
  assert.equal(result.candidates, 3);
  assert.equal(result.assigned, 1);
  assert.equal(result.deferred, 2);
  assert.match(result.error, /Строка 105.*Архив недоступен/);
  assert.deepEqual(state.writes, [{ id: "104", number: "20261120-01" }]);
  assert.equal(state.events.at(-1)[2], "105");
  assert.match(state.events.at(-1)[1], /Кандидатов 3, присвоено 1, отложено 2/);
});

test("recorded conflicts and uncertain writes take precedence even if a different reservation is older", async t => {
  for (const stateName of ["conflict", "uncertain", "attempted"]) {
    const { state, create, ledger } = fixture(t, [row(104), row(105), row(106)]);
    ledger.reserve("104", "20261120");
    const job = ledger.reserve("106", "20261120");
    if (stateName === "conflict") {
      ledger.markConflict("106", "Нужна сверка.");
      state.rows[2].ecnNumber = "MANUAL";
    } else {
      ledger.markAttempted("106");
      if (stateName === "uncertain") ledger.markUncertain("106", "Проверка записи.");
    }
    const worker = create();
    const blocked = await worker.run();
    assert.ok(blocked.error);
    assert.equal(blocked.writes, 0);
    assert.equal((await create().run()).writes, 0);
    Object.assign(state.rows[2], { ecnNumber: job.number, numberOccupied: true });
    const resolved = await worker.run();
    assert.equal(resolved.error, null);
    assert.equal(resolved.recovered, 1);
    assert.equal(resolved.deferred, 0);
    assert.deepEqual(state.writes.map(entry => entry.id), ["104", "105"]);
  }
});

test("a duplicate already in the sheet and archive is counted in the daily maximum", async t => {
  const existing = row(80, { ecnNumber: "20261120-07", numberOccupied: true });
  const archived = row(81, { ecnNumber: existing.ecnNumber });
  const { state, numberer } = fixture(t, [existing, row(104)], [archived]);
  const before = structuredClone([existing, archived]);
  assert.equal((await numberer.run()).error, null);
  assert.deepEqual(state.writes, [{ id: "104", number: "20261120-08" }]);
  assert.deepEqual([existing, archived], before);
});

test("historical duplicates allow both new November 23 ECNs in one cycle and generate a separate notice", async t => {
  const duplicate = "20230414-02";
  const today = { createdAt: "2026-11-23T18:52:00Z" };
  const { state, numberer } = fixture(t, [
    row(96, { ecnNumber: "20261123-01" }), row(97, { ecnNumber: "20261123-02" }), row(98, { ecnNumber: "20261123-03" }),
    row(99, today), row(100, today),
  ], [row(800, { ecnNumber: duplicate }), row(801, { ecnNumber: duplicate })]);
  const archiveBefore = structuredClone(state.archive);
  const result = await numberer.run();
  assert.equal(result.error, null);
  assert.deepEqual([result.candidates, result.assigned, result.deferred], [2, 2, 0]);
  assert.deepEqual(state.writes, [{ id: "99", number: "20261123-04" }, { id: "100", number: "20261123-05" }]);
  assert.deepEqual(state.archive, archiveBefore);
  assert.deepEqual(state.rows.slice(0, 3).map(item => item.ecnNumber), ["20261123-01", "20261123-02", "20261123-03"]);
  state.rows.push(row(101, today));
  assert.equal((await numberer.run()).assigned, 1);
  const notices = state.events.filter(([kind]) => kind === "numbering_duplicate");
  assert.equal(notices.length, 1);
  assert.match(notices[0][1], /20230414-02/);
  assert.match(notices[0][1], /800/);
  assert.match(notices[0][1], /801/);
});

test("matching the reserved row must never conceal a second owner of the same number", async t => {
  for (const otherFirst of [true, false]) {
    const { state, ledger, numberer } = fixture(t, [row(104), row(105)]);
    const job = ledger.reserve("104", "20261120");
    ledger.markAttempted("104");
    ledger.markUncertain("104", "awaiting readback");
    state.rows[0].ecnNumber = job.number;
    const other = row(321, { ecnNumber: job.number });
    if (otherFirst) state.rows.unshift(other);
    else state.archive.push(other);
    const result = await numberer.run();
    assert.ok(result.error);
    assert.equal(ledger.assignment("104").state, "conflict");
    assert.equal(result.recovered, 0);
    assert.deepEqual(state.writes, []);
  }
});

test("seeing one owner in both inventories is not a duplicate", async t => {
  const existing = row(88, { ecnNumber: "20261120-09" });
  const { numberer, state } = fixture(t, [existing, row(99)], [structuredClone(existing)]);
  assert.equal((await numberer.run()).error, null);
  assert.deepEqual(state.writes, [{ id: "99", number: "20261120-10" }]);
  assert.equal(state.events.some(([kind]) => kind === "numbering_duplicate"), false);
});

test("summary distinguishes loss of eligibility, an empty queue and a failed initial read", async t => {
  const { api, numberer, state } = fixture(t);
  const read = api.readRow;
  api.readRow = async id => { state.rows[0].status = "Approved"; return read(id); };
  const changed = await numberer.run();
  assert.equal(changed.ineligible, 1);
  assert.equal(changed.deferred, 0);
  assert.match(state.events.at(-1)[1], /выбыли из очереди 1/);
  const empty = await numberer.run();
  assert.equal(empty.candidates, 0);
  assert.equal(empty.deferred, 0);
  api.readSheet = async () => { throw new SmartsheetError("connection", "Нет снимка."); };
  const failed = await numberer.run();
  assert.equal(failed.candidates, null);
  assert.equal(failed.deferred, null);
  assert.match(state.events.at(-1)[1], /Нумерация не началась.*Нет снимка/);
});

test("a collision with a deferred row's reservation stops a different writable row before any PUT", async t => {
  const { state, ledger, numberer } = fixture(t, [row(104, { numberWritable: false, numberBlockScope: "row" }), row(105)]);
  const job = ledger.reserve("104", "20261120");
  state.archive.push(row(777, { ecnNumber: job.number }));
  const result = await numberer.run();
  assert.match(result.error, /Строка 104/);
  assert.equal(result.writes, 0);
  assert.equal(result.deferred, 2);
  assert.equal(state.events.at(-1)[2], "104");
  assert.equal(ledger.assignment("104").state, "conflict");
});

test("reactivating a cancelled reservation must catch a number held by another row, including extra zero padding", async t => {
  const { numberer, ledger, state } = fixture(t, [row(104), row(105)]);
  const job = ledger.reserve("104", "20261120");
  ledger.cancel("104", "No longer eligible.");
  state.archive.push(row(888, { ecnNumber: "20261120-001" }));
  const result = await numberer.run();
  assert.ok(result.error);
  assert.equal(job.number, "20261120-01");
  assert.equal(ledger.assignment("104").state, "conflict");
  assert.deepEqual(state.writes, []);
});
