import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { openNumberingStore, NumberingStoreError } from "../src/numbering-store.js";

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "ecn-numbering-store-"));
  const filename = join(directory, "numbering.sqlite");
  const stores = [];
  t.after(() => {
    for (const store of stores) store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    filename,
    open(options) {
      const store = openNumberingStore(filename, options);
      stores.push(store);
      return store;
    },
  };
}

test("working and archive numbers establish daily high-water marks without reusing gaps", t => {
  const { open } = fixture(t);
  const store = open();
  store.observeNumbers(["20261120-02", "20261120-09", "20261120-03", "20261121-99", "20261119-007"]);
  assert.equal(store.reserve("1000", "20261120").number, "20261120-10");
  assert.equal(store.reserve("1001", "20261121").number, "20261121-100");
  assert.equal(store.reserve("1002", "20261119").number, "20261119-08");
  store.observeNumbers(["20261120-01"]);
  assert.equal(store.reserve("1003", "20261120").number, "20261120-11");
  store.observeNumbers(["20261120-20"]);
  assert.equal(store.reserve("1004", "20261120").number, "20261120-21");
  assert.equal(store.reserve("1005", "20261122").number, "20261122-01");
});

test("malformed external numbers cannot poison the counter and invalid reservations roll back", t => {
  const { open } = fixture(t);
  const store = open();
  store.observeNumbers([null, undefined, 20261120, "", "other", "20261120-1", "20260230-99", "20261120-9007199254740992"]);
  assert.equal(store.reserve("1000", "20261120").number, "20261120-01");
  assert.throws(() => store.reserve("1001", "20260230"), NumberingStoreError);
  assert.equal(store.assignment("1001"), null);
  assert.throws(() => store.reserve("bad/id", "20261120"), NumberingStoreError);
  assert.equal(store.reserve("1001", "20261120").number, "20261120-02");
});

test("row bindings remain unchanged after restart, date changes and terminal states", t => {
  const fixtureState = fixture(t);
  let store = fixtureState.open();
  const reserved = store.reserve("1000", "20261120");
  assert.equal(reserved.state, "reserved");
  assert.equal(reserved.error, null);
  assert.equal(reserved.attemptedAt, null);
  assert.ok(!Number.isNaN(Date.parse(reserved.updatedAt)));
  assert.deepEqual(store.reserve("1000", "20261121"), reserved);
  store.markAssigned("1000");
  store.reserve("1001", "20261120");
  store.markConflict("1001", "Number was changed externally");
  store.reserve("1002", "20261120");
  store.cancel("1002", "Row no longer eligible");
  const before = store.assignments();
  store.close();
  store = fixtureState.open();
  assert.deepEqual(store.assignments(), before);
  for (const entry of before) assert.deepEqual(store.reserve(entry.rowId, "20261121"), entry);
  assert.equal(store.reserve("1003", "20261120").number, "20261120-04");
  assert.equal(store.assignments().length, 4);
});

test("ambiguous attempts retain their exact number and durable attempt timestamp for reconciliation", t => {
  const fixtureState = fixture(t);
  let store = fixtureState.open();
  const reserved = store.reserve("1000", "20261120");
  const attempted = store.markAttempted("1000");
  assert.equal(attempted.state, "attempted");
  assert.ok(!Number.isNaN(Date.parse(attempted.attemptedAt)));
  store.close();
  store = fixtureState.open();
  assert.deepEqual(store.assignment("1000"), attempted);
  const uncertain = store.markUncertain("1000", "Request outcome unknown");
  assert.equal(uncertain.attemptedAt, attempted.attemptedAt);
  assert.equal(uncertain.number, reserved.number);
  assert.equal(uncertain.state, "uncertain");
  store.close();
  store = fixtureState.open();
  assert.deepEqual(store.reserve("1000", "20261120"), uncertain);
  assert.deepEqual(store.markAttempted("1000"), uncertain);
  assert.deepEqual(store.markRejected("1000", "Cannot safely retry"), uncertain);
  assert.equal(store.reserve("1001", "20261120").number, "20261120-02");
  const assigned = store.markAssigned("1000");
  assert.equal(assigned.number, reserved.number);
  assert.equal(assigned.attemptedAt, attempted.attemptedAt);
  assert.equal(assigned.error, null);
  assert.equal(store.markAssigned("9999"), null);
});

test("only a definitively rejected attempt can be retried with its original reservation", t => {
  const { open } = fixture(t);
  const store = open();
  const reserved = store.reserve("1000", "20261120");
  const firstAttempt = store.markAttempted("1000");
  assert.deepEqual(store.markAttempted("1000"), firstAttempt);
  const rejected = store.markRejected("1000", "Smartsheet rejected the update");
  assert.equal(rejected.state, "reserved");
  assert.equal(rejected.number, reserved.number);
  assert.equal(rejected.attemptedAt, firstAttempt.attemptedAt);
  assert.equal(rejected.error, "Smartsheet rejected the update");
  const retried = store.markAttempted("1000");
  assert.equal(retried.state, "attempted");
  assert.equal(retried.number, reserved.number);
  assert.equal(retried.error, null);
  for (const finish of [store.markAssigned, rowId => store.markConflict(rowId, "Conflict"), rowId => store.cancel(rowId, "Cancelled")]) {
    const terminal = finish("1000");
    assert.deepEqual(store.markAttempted("1000"), terminal);
    assert.deepEqual(store.markRejected("1000", "Do not reopen"), terminal);
  }
});

test("ledger initialization preserves pre-existing SQLite data and is repeatable", t => {
  const fixtureState = fixture(t);
  const db = new DatabaseSync(fixtureState.filename);
  db.exec("CREATE TABLE legacy_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.prepare("INSERT INTO legacy_meta VALUES (?, ?)").run("existing", "preserved");
  db.close();
  let store = fixtureState.open();
  store.observeNumbers(["20261120-08"]);
  store.close();
  store = fixtureState.open();
  assert.equal(store.reserve("1000", "20261120").number, "20261120-09");
  store.close();
  const check = new DatabaseSync(fixtureState.filename);
  assert.equal(check.prepare("SELECT value FROM legacy_meta WHERE key = ?").get("existing").value, "preserved");
  check.close();
});

test("two ledger connections cannot allocate a number twice or rebind the same row", t => {
  const fixtureState = fixture(t);
  const first = fixtureState.open({ acquireLock: false });
  const second = fixtureState.open({ acquireLock: false });
  first.observeNumbers(["20261120-10"]);
  const firstRow = first.reserve("1000", "20261120");
  assert.deepEqual(second.reserve("1000", "20261121"), firstRow);
  assert.equal(second.reserve("1001", "20261120").number, "20261120-12");
  assert.equal(first.reserve("1002", "20261120").number, "20261120-13");
  const entries = first.assignments();
  assert.equal(new Set(entries.map(entry => entry.rowId)).size, 3);
  assert.equal(new Set(entries.map(entry => entry.number)).size, 3);
});

test("the process lock rejects a second worker and is released on close", t => {
  const fixtureState = fixture(t);
  const first = fixtureState.open();
  assert.throws(() => fixtureState.open(), error => error instanceof NumberingStoreError && error.code === "already_running");
  // The lock uses a separate SQLite file and does not hold a ledger write transaction.
  const observer = fixtureState.open({ acquireLock: false });
  assert.equal(observer.assignments().length, 0);
  observer.close();
  first.close();
  const replacement = fixtureState.open();
  assert.equal(replacement.reserve("1000", "20261120").number, "20261120-01");
});

test("an abrupt process exit releases the lock while retaining its attempted reservation", { timeout: 15_000 }, async t => {
  const fixtureState = fixture(t);
  const moduleUrl = new URL("../src/numbering-store.js", import.meta.url).href;
  const script = `
    import { openNumberingStore } from ${JSON.stringify(moduleUrl)};
    const store = openNumberingStore(process.argv[1]);
    store.reserve("1000", "20261120");
    store.markAttempted("1000");
    process.stdout.write("ready");
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script, fixtureState.filename], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  try {
    await Promise.race([
      once(child.stdout, "data"),
      exited.then(([code]) => { throw new Error("Lock fixture process exited early: " + code); }),
    ]);
    assert.throws(() => fixtureState.open(), error => error instanceof NumberingStoreError && error.code === "already_running");
  } finally {
    child.kill("SIGKILL");
    await exited;
  }
  const restarted = fixtureState.open();
  assert.equal(restarted.assignment("1000").state, "attempted");
  assert.equal(restarted.assignment("1000").number, "20261120-01");
  assert.ok(restarted.assignment("1000").attemptedAt);
  assert.equal(restarted.reserve("1001", "20261120").number, "20261120-02");
});
