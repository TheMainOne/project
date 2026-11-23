import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSheet, FIELDS } from "../src/smartsheet.js";
import { openStore } from "../src/store.js";
import { rawSheet, SHEET_ID } from "./fixtures.js";

function cardSheet() {
  const sheet = rawSheet();
  sheet.columns.find(column => String(column.id) === FIELDS.status).options = ["In Preparation", "Initial Review", "Approved"];
  sheet.columns.push(
    { id: 6001, index: 40, title: " ECN TYPE ", type: "PICKLIST", options: ["New", "Change"] },
    { id: 6002, index: 41, title: "Priority", type: "PICKLIST", locked: true },
    { id: 6003, index: 42, title: "Effective When", type: "PICKLIST" },
    { id: 6004, index: 43, title: "Customer", type: "TEXT_NUMBER" },
    { id: 6005, index: 44, title: "Checked", type: "CHECKBOX" },
    { id: 6006, index: 45, title: "Contact", type: "CONTACT_LIST" },
  );
  sheet.rows[0].cells.push(
    { columnId: 6001, value: "Change" },
    { columnId: 6002, value: "Urgent" },
    { columnId: 6003, value: "Immediately" },
    { columnId: 6004, value: null },
    { columnId: 6005, value: false },
    { columnId: 6006, objectValue: { objectType: "CONTACT", name: "Synthetic User", email: "synthetic@example.com" } },
  );
  return sheet;
}

test("card data keeps every field in column order with safe display values and optional summaries", () => {
  const raw = cardSheet();
  raw.columns.reverse();
  const sheet = normalizeSheet(raw);
  const row = sheet.rows[0];
  assert.equal(row.fields.length, raw.columns.length);
  assert.deepEqual(row.fields.map(field => field.columnId), sheet.columns.map(column => column.columnId));
  assert.equal(row.fields[0].columnId, FIELDS.ecnNumber);
  assert.equal(row.ecnType, "Change");
  assert.equal(row.priority, "Urgent");
  assert.equal(row.implementation, "Immediately");
  assert.equal(row.fields.find(field => field.columnId === "6002").locked, true);
  assert.equal(row.fields.find(field => field.columnId === "6004").value, "");
  assert.equal(row.fields.find(field => field.columnId === "6005").value, "false");
  assert.equal(row.fields.find(field => field.columnId === "6006").value, "Synthetic User");
  assert.equal(JSON.stringify(row.fields).includes("synthetic@example.com"), false);
  assert.deepEqual(sheet.columns.find(column => column.columnId === FIELDS.status).options, ["In Preparation", "Initial Review", "Approved"]);
  const optionalAbsent = normalizeSheet(rawSheet()).rows[0];
  assert.equal(optionalAbsent.ecnType, "");
  assert.equal(optionalAbsent.priority, "");
  assert.equal(optionalAbsent.implementation, "");
});

test("state includes card summaries and status options while full fields stay in detail", t => {
  const store = openStore(":memory:", SHEET_ID);
  t.after(() => store.close());
  const sheet = normalizeSheet(cardSheet());
  store.saveSheet(sheet, store.beginRun());
  const state = store.state();
  assert.equal(state.rows[0].description, "Test-only description.");
  assert.equal(state.rows[0].ecnType, "Change");
  assert.equal(state.rows[0].implementation, "Immediately");
  assert.equal(Object.hasOwn(state.rows[0], "fields"), false);
  assert.deepEqual(state.sheet.columns, sheet.columns);
  assert.deepEqual(store.row("1000").fields, sheet.rows[0].fields);
});

test("all-fields upgrade and schema-only edits do not flood events but field edits are tracked", t => {
  const store = openStore(":memory:", SHEET_ID);
  t.after(() => store.close());
  const sheet = normalizeSheet(cardSheet());
  const legacy = structuredClone(sheet);
  delete legacy.columns;
  for (const row of legacy.rows) {
    delete row.fields;
    delete row.ecnType;
    delete row.priority;
    delete row.implementation;
  }
  store.saveSheet(legacy, store.beginRun());
  store.saveSheet(sheet, store.beginRun());
  assert.equal(store.state().events.filter(event => event.kind === "row_changed").length, 0);
  sheet.rows[0].fields.reverse();
  sheet.rows[0].fields[0].title = "Renamed column";
  sheet.rows[0].fields[0].locked = true;
  sheet.rows[0].fields.push({ columnId: "6007", title: "Added column", type: "TEXT_NUMBER", locked: false, value: "Initial value" });
  store.saveSheet(sheet, store.beginRun());
  assert.equal(store.state().events.filter(event => event.kind === "row_changed").length, 0);
  sheet.rows[0].fields.find(field => field.columnId === "6004").value = "New customer";
  store.saveSheet(sheet, store.beginRun());
  assert.equal(store.state().events.filter(event => event.kind === "row_changed").length, 1);
  assert.equal(store.row("1000").fields.find(field => field.columnId === "6004").value, "New customer");
});
