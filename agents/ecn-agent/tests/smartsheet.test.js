import test from "node:test";
import assert from "node:assert/strict";
import { createSmartsheetReader, normalizeSheet, FIELDS, APPROVALS } from "../src/smartsheet.js";
import { rawSheet, SHEET_ID } from "./fixtures.js";

test("reads every page with GET, checks version and normalizes by Column ID", async () => {
  const requests = [];
  const reader = createSmartsheetReader({
    sheetId: SHEET_ID,
    token: "fake-secret",
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (/\/(discussions|attachments)$/.test(url.pathname)) return Response.json({pageNumber:1,totalPages:0,totalCount:0,data:[]});
      const page = Number(url.searchParams.get("page"));
      const sheet = rawSheet({ count: 501, offset: page === 1 ? 0 : 500, length: page === 1 ? 500 : 1 });
      sheet.columns.reverse();
      return Response.json(sheet);
    },
  });
  const result = await reader.read();
  assert.equal(result.rows.length, 501);
  assert.equal(result.rows[0].site, "0071 CleanPack");
  assert.equal(result.rows[500].id, "1500");
  assert.equal(requests.length, 5);
  assert.ok(requests.every(request => request.options.method === "GET"));
  assert.ok(requests.every(request => request.options.redirect === "error"));
  assert.ok(requests.every(request => request.url.startsWith("https://api.smartsheet.com/2.0/sheets/" + SHEET_ID)));
  assert.ok(requests.filter(request => !request.url.includes("/attachments")).every(request => request.url.includes("/discussions") ? request.url.includes("include=comments") : request.url.includes("include=objectValue")));
});

test("rejects changed versions across pages", async () => {
  const reader = createSmartsheetReader({
    sheetId: SHEET_ID, token: "fake",
    fetchImpl: async url => {
      const second = url.searchParams.get("page") === "2";
      return Response.json(rawSheet({ count: 501, offset: second ? 500 : 0, length: second ? 1 : 500, version: second ? 5 : 4 }));
    },
  });
  await assert.rejects(reader.read, { code: "sheet_changed" });
});

test("rejects a short sheet or duplicate rows instead of replacing the full snapshot", async () => {
  const sheet = rawSheet({ count: 2 });
  sheet.rows[1].id = sheet.rows[0].id;
  const reader = createSmartsheetReader({ sheetId: SHEET_ID, token: "fake", fetchImpl: async () => Response.json(sheet) });
  await assert.rejects(reader.read, { code: "incomplete_read" });
});

test("keeps contact emails and names distinct from response status", () => {
  const sheet = rawSheet();
  const [, contactId, statusId] = APPROVALS[1];
  sheet.rows[0].cells.push(
    { columnId: Number(contactId), objectValue: { objectType: "MULTI_CONTACT", contacts: [{ name: "Engineer", email: "engineer@example.test" }, { name: "Delegate", email: "delegate@example.test" }] } },
    { columnId: Number(statusId), value: "Submitted" },
  );
  const approval = normalizeSheet(sheet).rows[0].approvals[1];
  assert.equal(approval.status, "Submitted");
  assert.equal(approval.contacts.length, 2);
  assert.equal(approval.contacts[0].email, "engineer@example.test");
});

test("reports missing configured columns and flags an unavailable approval column", () => {
  const sheet = rawSheet();
  sheet.columns = sheet.columns.filter(column => String(column.id) !== APPROVALS[2][2]);
  assert.deepEqual(normalizeSheet(sheet).unavailableApprovals, ["Quality"]);
  sheet.columns = sheet.columns.filter(column => String(column.id) !== FIELDS.status);
  assert.throws(() => normalizeSheet(sheet), { code: "schema_changed" });
});

test("retries a rate-limited read and never includes a response body or token in errors", async () => {
  let count = 0;
  const sleeps = [];
  const reader = createSmartsheetReader({
    sheetId: SHEET_ID, token: "fake-secret",
    wait: async ms => { sleeps.push(ms); },
    fetchImpl: async () => {
      count += 1;
      return count === 1
        ? new Response("fake-secret", { status: 429, headers: { "Retry-After": "2" } })
        : new Response("fake-secret", { status: 401 });
    },
  });
  await assert.rejects(reader.read, error => error.code === "http_401" && !error.message.includes("fake-secret"));
  assert.deepEqual(sleeps, [2000]);
});

test("never starts a request without a token", async () => {
  let called = false;
  const reader = createSmartsheetReader({ sheetId: SHEET_ID, token: "", fetchImpl: async () => { called = true; } });
  await assert.rejects(reader.read, { code: "missing_token" });
  assert.equal(called, false);
});
