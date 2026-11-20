import test from "node:test";
import assert from "node:assert/strict";
import { createSmartsheetReader, normalizeAttachment } from "../src/smartsheet.js";
import { rawSheet, SHEET_ID } from "./fixtures.js";

const attachment = (id = 7001, changes = {}) => ({
  id, parentId: 1000, parentType: "ROW", attachmentType: "FILE", mimeType: "application/pdf",
  name: "drawing.pdf", sizeInKb: 42, createdAt: "2026-11-20T10:00:00Z",
  createdBy: { name: "Test Engineer", email: "engineer@example.invalid" },
  url: "https://files.example.invalid/drawing.pdf?signature=temporary", urlExpiresInMillis: 120000,
  ...changes,
});
const page = (data = [], changes = {}) => ({ pageNumber: 1, totalPages: data.length ? 1 : 0, totalCount: data.length, data, ...changes });
const discussion = (id = 5001, parentId = 1000, parentType = "ROW", commentId = 9001) => ({
  id, parentId, parentType, commentCount: 1,
  comments: [{ id: commentId, discussionId: id, text: "See attached drawing" }],
});
function reader({ attachments = () => Response.json(page()), discussions = [], detail, sheet, wait } = {}) {
  return createSmartsheetReader({
    sheetId: SHEET_ID, token: "synthetic-secret", wait,
    fetchImpl: async (url, options) => {
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.equal(url.origin, "https://api.smartsheet.com");
      assert.equal(options.headers.Authorization, "Bearer synthetic-secret");
      if (url.pathname.endsWith("/discussions")) return Response.json(page(discussions));
      if (url.pathname.endsWith("/attachments")) {
        assert.equal(url.searchParams.get("pageSize"), "100");
        return attachments(url, options);
      }
      if (url.pathname.includes("/attachments/")) return detail(url, options);
      return Response.json(sheet ? sheet(url) : rawSheet({ count: 2 }));
    },
  });
}

test("maps row and comment attachments to their ECN and strips temporary URLs", async () => {
  const result = await reader({
    attachments: () => Response.json(page([
      attachment(7003, { parentType: "COMMENT", parentId: 9001 }),
      attachment(7001), attachment(7002, { parentId: 1001, attachmentType: "LINK", sizeInKb: undefined }),
    ])),
    discussions: [discussion()],
  }).read();
  assert.equal(result.attachmentsLoaded, true);
  assert.deepEqual(result.rows[0].attachments.map(item => item.id), ["7001", "7003"]);
  assert.equal(result.rows[1].attachments[0].id, "7002");
  assert.equal(result.rows[0].attachments[1].parentType, "COMMENT");
  assert.deepEqual(result.rows[0].attachments[0], {
    id: "7001", parentId: "1000", parentType: "ROW", attachmentType: "FILE", attachmentSubType: "",
    mimeType: "application/pdf", name: "drawing.pdf", sizeInKb: 42, createdAt: "2026-11-20T10:00:00Z",
    author: { name: "Test Engineer", email: "engineer@example.invalid" },
  });
  assert.equal(result.rows[1].attachments[0].sizeInKb, null);
  assert.equal(JSON.stringify(result).includes("temporary"), false);
  assert.equal(JSON.stringify(result).includes("urlExpires"), false);
});

test("separates sheet, sheet-comment and proof attachments without guessing proof row IDs", async () => {
  const result = await reader({
    attachments: () => Response.json(page([
      attachment(7001, { parentType: "SHEET", parentId: SHEET_ID }),
      attachment(7002, { parentType: "COMMENT", parentId: 9001 }),
      attachment(7003, { parentType: "PROOF", parentId: 1000 }),
    ])),
    discussions: [discussion(5001, SHEET_ID, "SHEET")],
  }).read();
  assert.equal(result.sheetAttachmentCount, 2);
  assert.equal(result.proofAttachmentCount, 1);
  assert.deepEqual(result.rows.map(row => row.attachments), [[], []]);
});

test("polls attachments despite unchanged sheet versions and timestamps", async () => {
  let calls = 0;
  const source = reader({ attachments: () => Response.json(page(++calls === 1 ? [] : [attachment()])) });
  const first = await source.read();
  const next = await source.read();
  assert.equal(first.version, next.version);
  assert.equal(first.rows[0].modifiedAt, next.rows[0].modifiedAt);
  assert.equal(first.rows[0].attachments.length, 0);
  assert.equal(next.rows[0].attachments.length, 1);
  assert.equal(calls, 2);
});

test("reads every attachment page and verifies metadata without treating rotated URLs as changes", async () => {
  const calls = [];
  const result = await reader({ attachments: url => {
    const number = Number(url.searchParams.get("page"));
    calls.push(number);
    return Response.json(page([attachment(7000 + number, { url: "https://files.example.invalid/?signature=" + calls.length })], {
      pageNumber: number, totalPages: 2, totalCount: 2,
    }));
  } }).read();
  assert.deepEqual(calls, [1, 2, 1]);
  assert.deepEqual(result.rows[0].attachments.map(item => item.id), ["7001", "7002"]);
});

test("rejects incomplete pages, wrong pagination and duplicate attachment IDs", async () => {
  const responses = [
    null, {}, page([attachment()], { totalCount: 2 }), page([attachment(), attachment()]),
    page([], { totalCount: 1, totalPages: 1 }), page([attachment()], { totalPages: 0 }),
    page([attachment()], { pageNumber: 2 }), page([], { totalPages: 1001 }),
  ];
  for (const data of responses) {
    await assert.rejects(reader({ attachments: () => Response.json(data) }).read(), { code: "incomplete_attachments" });
  }
  await assert.rejects(reader({ attachments: url => Response.json(page([attachment()], {
    pageNumber: Number(url.searchParams.get("page")), totalPages: 2, totalCount: 2,
  })) }).read(), { code: "incomplete_attachments" });
});

test("rejects changed totals or changed first-page metadata during pagination", async () => {
  await assert.rejects(reader({ attachments: url => {
    const number = Number(url.searchParams.get("page"));
    return Response.json(page([attachment(7000 + number)], { pageNumber: number, totalPages: 2, totalCount: number === 1 ? 2 : 3 }));
  } }).read(), { code: "attachments_changed" });
  let calls = 0;
  await assert.rejects(reader({ attachments: url => {
    const number = Number(url.searchParams.get("page"));
    return Response.json(page([attachment(7000 + number, { name: ++calls === 3 ? "Changed.pdf" : "Original.pdf" })], {
      pageNumber: number, totalPages: 2, totalCount: 2,
    }));
  } }).read(), { code: "attachments_changed" });
});

test("fails the snapshot for an unknown row, comment, sheet or discussion parent", async () => {
  for (const parentType of ["ROW", "COMMENT", "SHEET"]) {
    await assert.rejects(reader({ attachments: () => Response.json(page([attachment(7001, { parentType, parentId: 99999 })])) }).read(), { code: "attachments_changed" });
  }
  await assert.rejects(reader({ discussions: [discussion(5001, 99999, "SHEET")] }).read(), { code: "sheet_changed" });
});

test("rejects a sheet version change during attachment loading", async () => {
  let reads = 0;
  await assert.rejects(reader({ sheet: () => rawSheet({ version: ++reads === 1 ? 4 : 5 }) }).read(), { code: "sheet_changed" });
});

test("rejects malformed attachment parents, unsafe IDs and invalid sizes", () => {
  assert.throws(() => normalizeAttachment(attachment(7001, { parentType: "DISCUSSION" })), { code: "incomplete_attachments" });
  assert.throws(() => normalizeAttachment(attachment(7001, { parentId: Number.MAX_SAFE_INTEGER + 1 })), { code: "unsafe_id" });
  for (const sizeInKb of [-1, "42", NaN, Infinity]) {
    assert.throws(() => normalizeAttachment(attachment(7001, { sizeInKb })), { code: "incomplete_attachments" });
  }
});

test("attachment endpoint failures preserve safe errors instead of yielding an empty list", async () => {
  for (const status of [401, 403, 404]) {
    await assert.rejects(reader({ attachments: () => new Response("synthetic-secret", { status }) }).read(),
      error => error.code === "http_" + status && !error.message.includes("synthetic-secret"));
  }
  await assert.rejects(reader({ attachments: () => { throw new Error("synthetic-secret"); } }).read(),
    error => error.code === "connection_failed" && !error.message.includes("synthetic-secret"));
});

test("gets a fresh URL for each open and only calls authenticated Smartsheet endpoints", async () => {
  let calls = 0;
  const source = reader({ detail: url => {
    assert.equal(url.pathname, "/2.0/sheets/" + SHEET_ID + "/attachments/7001");
    return Response.json(attachment(7001, { url: "https://files.example.invalid/drawing.pdf?signature=" + ++calls }));
  } });
  const first = await source.getAttachment("7001");
  const next = await source.getAttachment("7001");
  assert.equal(first.id, "7001");
  assert.equal(first.name, "drawing.pdf");
  assert.equal(first.parentId, "1000");
  assert.equal(first.url, "https://files.example.invalid/drawing.pdf?signature=1");
  assert.notEqual(first.url, next.url);
  assert.equal(Object.hasOwn(first, "urlExpiresInMillis"), false);
  assert.equal(calls, 2);
});

test("allows http(s) linked resources but requires HTTPS for files and no URL credentials", async () => {
  const source = reader({ detail: () => Response.json(attachment(7001, { attachmentType: "LINK", url: "http://example.invalid/resource" })) });
  assert.equal((await source.getAttachment("7001")).url, "http://example.invalid/resource");
  for (const url of [undefined, "", "not a URL", "http://example.invalid/file", "javascript:alert(1)", "data:text/plain,secret", "file:///tmp/file", "https://user:secret@example.invalid/file"]) {
    await assert.rejects(reader({ detail: () => Response.json(attachment(7001, { url })) }).getAttachment("7001"),
      error => error.code === "invalid_attachment_url" && !error.message.includes("secret"));
  }
});

test("getAttachment rejects mismatched IDs and unsafe request IDs before fetching", async () => {
  await assert.rejects(reader({ detail: () => Response.json(attachment(7002)) }).getAttachment("7001"), { code: "attachment_changed" });
  let called = false;
  const source = reader({ detail: () => { called = true; } });
  await assert.rejects(source.getAttachment("7001/../../other"), { code: "invalid_id" });
  assert.equal(called, false);
});

test("getAttachment shares bounded retry behavior and safe errors", async () => {
  let calls = 0;
  const sleeps = [];
  const source = reader({ wait: async ms => { sleeps.push(ms); }, detail: () => {
    calls += 1;
    return calls === 1 ? new Response("synthetic-secret", { status: 429, headers: { "Retry-After": "2" } })
      : new Response("synthetic-secret", { status: 404 });
  } });
  await assert.rejects(source.getAttachment("7001"), error => error.code === "http_404" && !error.message.includes("synthetic-secret"));
  assert.deepEqual(sleeps, [2000]);
  await assert.rejects(reader({ detail: () => { throw new Error("synthetic-secret"); } }).getAttachment("7001"),
    error => error.code === "connection_failed" && !error.message.includes("synthetic-secret"));
});

test("getAttachment never requests a URL without a configured token", async () => {
  let called = false;
  const source = createSmartsheetReader({ sheetId: SHEET_ID, token: "", fetchImpl: () => { called = true; } });
  await assert.rejects(source.getAttachment("7001"), { code: "missing_token" });
  assert.equal(called, false);
});
