import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPanelServer } from "../src/http.js";
import { SmartsheetError } from "../src/smartsheet.js";
import { openStore } from "../src/store.js";
import { SHEET_ID, normalizedSheet } from "./fixtures.js";

const SECRET = "FAKE-SERVER-ONLY-TOKEN";
const OPEN_PATH = "/api/rows/1000/attachments/8000/open";

async function fixture(t, getAttachment, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "ecn-attachments-http-"));
  const store = openStore(join(directory, "state.sqlite"), SHEET_ID);
  const sheet = normalizedSheet();
  sheet.attachmentsLoaded = true;
  const attachment = {
    id: "8000", parentId: "1000", parentType: "ROW", attachmentType: "FILE",
    attachmentSubType: "", mimeType: "application/pdf", name: "Drawing.pdf", sizeInKb: 24,
    createdAt: "2026-11-17T15:00:00Z", author: { name: "Test Engineer", email: "engineer@example.test" },
    ...overrides,
  };
  sheet.rows[0].attachments = [attachment];
  store.saveSheet(sheet, store.beginRun());
  const calls = [];
  const server = createPanelServer({
    config: {
      token: SECRET, sheetId: SHEET_ID, pollSeconds: 120,
      publicDirectory: fileURLToPath(new URL("../public/", import.meta.url)),
    },
    store, monitor: { status: () => ({ state: "watching" }) },
    reader: { getAttachment: async id => {
      calls.push(id);
      return getAttachment(attachment, calls.length);
    } },
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  return { base, store, sheet, attachment, calls, open: options => fetch(base + OPEN_PATH, { redirect: "manual", ...options }) };
}

test("opening a stored attachment requests a fresh signed URL each time without persisting it", async t => {
  const { open, base, calls } = await fixture(t, (attachment, call) => ({
    ...attachment, url: "https://files.example.test/drawing.pdf?signature=SIGNED-" + call,
  }));
  for (let call = 1; call <= 2; call++) {
    const response = await open();
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://files.example.test/drawing.pdf?signature=SIGNED-" + call);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(await response.text(), "");
  }
  assert.deepEqual(calls, ["8000", "8000"]);
  for (const path of ["/api/state", "/api/rows/1000"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text.includes(SECRET), false);
    assert.equal(text.includes("SIGNED-"), false);
    assert.equal(text.includes("files.example.test"), false);
    const body = JSON.parse(text);
    if (path === "/api/state") {
      assert.equal(body.rows[0].attachmentCount, 1);
      assert.equal(Object.hasOwn(body.rows[0], "attachments"), false);
    } else {
      assert.equal(body.attachments[0].name, "Drawing.pdf");
      assert.equal(Object.hasOwn(body.attachments[0], "url"), false);
    }
  }
});

test("external HTTP links attached to comments open through the same membership check", async t => {
  const { open } = await fixture(t, attachment => ({ ...attachment, url: "http://docs.example.test/specification" }), {
    attachmentType: "LINK", parentType: "COMMENT", parentId: "7000", mimeType: "", sizeInKb: null,
  });
  const response = await open();
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "http://docs.example.test/specification");
});

test("missing attachments and cross-origin requests never reach the reader", async t => {
  const { base, open, calls } = await fixture(t, () => { throw new Error("Should not be requested"); });
  for (const path of ["/api/rows/1000/attachments/9999/open", "/api/rows/9999/attachments/8000/open"]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    await response.text();
  }
  for (const headers of [{ Origin: "https://other.example.test" }, { "Sec-Fetch-Site": "cross-site" }]) {
    const response = await open({ headers });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("location"), null);
    await response.text();
  }
  assert.deepEqual(calls, []);
});

test("unsafe or invalid attachment URLs are rejected without redirects", async t => {
  let target;
  const { open } = await fixture(t, attachment => ({ ...attachment, url: target }));
  for (target of [
    "javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///C:/private.txt",
    "ftp://files.example.test/drawing.pdf", "http://files.example.test/drawing.pdf",
    "https://user:password@files.example.test/drawing.pdf", "not a URL",
  ]) {
    const response = await open();
    assert.equal(response.status, 502, target);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.text();
    assert.equal(body.includes(target), false);
    assert.equal(body.includes(SECRET), false);
  }
});

test("attachment errors preserve expected statuses, escape HTML and hide unexpected diagnostics", async t => {
  let failure;
  const { open } = await fixture(t, () => { throw failure; });
  for (const status of [401, 403, 404, 429]) {
    failure = new SmartsheetError("http_" + status, '<script>alert("untrusted")</script> & unavailable');
    const response = await open();
    assert.equal(response.status, status);
    assert.equal(response.headers.get("location"), null);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    const body = await response.text();
    assert.equal(body.includes("<script>"), false);
    assert.ok(body.includes("&lt;script&gt;alert(&quot;untrusted&quot;)&lt;/script&gt; &amp; unavailable"));
    assert.equal(body.includes(SECRET), false);
  }
  failure = new Error("Private network failure with token=" + SECRET);
  const response = await open();
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.equal(body.includes(SECRET), false);
  assert.equal(body.includes("Private network failure"), false);
});

test("attachment ID and parent mismatches cannot redirect to a different ECN's file", async t => {
  let overrides;
  const { open } = await fixture(t, attachment => ({ ...attachment, ...overrides, url: "https://files.example.test/drawing.pdf" }));
  for (overrides of [{ id: "9999" }, { parentId: "1001" }, { parentType: "SHEET" }]) {
    const response = await open();
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("location"), null);
    await response.text();
  }
});

test("removing an attachment while its URL request is pending prevents the redirect", async t => {
  const started = Promise.withResolvers();
  const resolved = Promise.withResolvers();
  const { open, store, sheet, attachment } = await fixture(t, () => {
    started.resolve();
    return resolved.promise;
  });
  const pending = open();
  await started.promise;
  sheet.rows[0].attachments = [];
  store.saveSheet(sheet, store.beginRun());
  resolved.resolve({ ...attachment, url: "https://files.example.test/drawing.pdf" });
  const response = await pending;
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("location"), null);
  await response.text();
});
