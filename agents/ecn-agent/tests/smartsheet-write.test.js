import test from "node:test";
import assert from "node:assert/strict";
import { commentVerification, createSmartsheetWriter, validateCommentInput, MAX_ATTACHMENT_BYTES, MAX_COMMENT_LENGTH } from "../src/smartsheet-write.js";

const rowId = "1000";
const discussionId = "5001";
const commentId = "9001";
const attachment = { id: 7001, parentType: "COMMENT", parentId: 9001 };
const comment = (changes = {}) => ({ id: 9001, discussionId: 5001, text: "Please review", ...changes });
const discussion = (changes = {}) => ({ id: 5001, parentType: "ROW", parentId: 1000, comments: [comment()], ...changes });
const success = result => Response.json({ message: "SUCCESS", resultCode: 0, result });
const writer = fetchImpl => createSmartsheetWriter({ sheetId: "12345678", token: "private-synthetic-token", fetchImpl });

test("creates an actual row discussion with JSON and returns safe string IDs", async () => {
  let calls = 0;
  const result = await writer(async (url, options) => {
    calls++;
    assert.equal(url.href, "https://api.smartsheet.com/2.0/sheets/12345678/rows/1000/discussions");
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer private-synthetic-token");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.equal(options.headers["Content-Length"], String(options.body.byteLength));
    assert.deepEqual(JSON.parse(options.body), { comment: { text: "Please review" } });
    return success(discussion());
  }).postComment({ rowId, text: "Please review" });
  assert.equal(calls, 1);
  assert.deepEqual(result, { discussionId, commentId, attachmentIds: [] });
});

test("submits text and binary file together as one multipart POST", async () => {
  const bytes = Buffer.from([0, 255, 13, 10, 65, 66, 128]);
  const file = { name: "drawing.pdf", mimeType: "application/pdf", bytes };
  let posts = 0;
  const result = await writer(async (url, options) => {
    assert.equal(options.method, "POST");
    posts++;
    assert.equal(options.headers["Content-Length"], String(options.body.byteLength));
    const form = await new Response(options.body, { headers: { "Content-Type": options.headers["Content-Type"] } }).formData();
    assert.deepEqual(JSON.parse(form.get("discussion")), { comment: { text: "Please review" } });
    assert.equal(form.get("file").name, "drawing.pdf");
    assert.equal(form.get("file").type, "application/pdf");
    assert.deepEqual(Buffer.from(await form.get("file").arrayBuffer()), bytes);
    assert.equal(form.getAll("file").length, 1);
    return success(discussion({ comments: [comment({ attachments: [attachment] })] }));
  }).postComment({ rowId, text: "Please review", file });
  assert.equal(posts, 1);
  assert.deepEqual(result, { discussionId, commentId, attachmentIds: ["7001"] });
});

test("replies only after checking the discussion still belongs to the selected row", async () => {
  const calls = [];
  const result = await writer(async (url, options) => {
    calls.push([options.method, url.pathname]);
    if (options.method === "GET") return Response.json(discussion());
    const form = await new Response(options.body, { headers: { "Content-Type": options.headers["Content-Type"] } }).formData();
    assert.deepEqual(JSON.parse(form.get("comment")), { text: "Please review" });
    assert.equal(form.has("discussion"), false);
    return success(comment({ attachments: [attachment] }));
  }).postComment({ rowId, discussionId, text: "Please review", file: { name: "file.txt", bytes: Buffer.from("hello") } });
  assert.deepEqual(calls, [["GET", "/2.0/sheets/12345678/discussions/5001"], ["POST", "/2.0/sheets/12345678/discussions/5001/comments"]]);
  assert.equal(result.commentId, commentId);
});

test("does not post replies to moved, sheet-level, or read-only discussions", async () => {
  for (const changes of [{ parentId: 1001 }, { parentType: "SHEET" }, { id: 5002 }, { readOnly: true }, { accessLevel: "VIEWER" }]) {
    let posts = 0;
    await assert.rejects(writer(async (url, options) => {
      if (options.method === "POST") posts++;
      return Response.json(discussion(changes));
    }).postComment({ rowId, discussionId, text: "Please review" }), error => ["discussion_changed", "http_403"].includes(error.code));
    assert.equal(posts, 0);
  }
});

test("reads exact new discussion and comment when creation omits comment or file metadata", async () => {
  const calls = [];
  const result = await writer(async (url, options) => {
    calls.push([options.method, url.pathname, url.search]);
    if (options.method === "POST") return success({ id: 5001 });
    if (url.pathname.endsWith("/comments/9001")) return Response.json(comment({ attachments: [attachment] }));
    return Response.json(discussion());
  }).postComment({ rowId, text: "Please review", file: { name: "file.txt", bytes: Buffer.from("hello") } });
  assert.deepEqual(result.attachmentIds, ["7001"]);
  assert.deepEqual(calls, [
    ["POST", "/2.0/sheets/12345678/rows/1000/discussions", ""],
    ["GET", "/2.0/sheets/12345678/discussions/5001", "?include=comments,attachments"],
    ["GET", "/2.0/sheets/12345678/comments/9001", ""],
  ]);
});

test("accepts discussion-level commentAttachments without persisting temporary URLs", async () => {
  const result = await writer(async () => success(discussion({
    commentAttachments: [{ ...attachment, url: "https://files.example.invalid/?temporary-token=secret" }],
  }))).postComment({ rowId, text: "Please review", file: { name: "file.txt", bytes: Buffer.from("hello") } });
  assert.deepEqual(result.attachmentIds, ["7001"]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("never retries a possibly committed POST and never exposes response errors or token", async () => {
  const responses = [
    () => { throw new Error("private-synthetic-token transport internals"); },
    () => new Response("private-synthetic-token", { status: 500 }),
    () => new Response("timeout", { status: 408 }),
    () => new Response("gateway cancelled", { status: 499 }),
    () => new Response("not JSON"),
    () => success({ id: Number.MAX_SAFE_INTEGER + 1 }),
    () => Response.json({ message: "PARTIAL_SUCCESS", resultCode: 3, result: discussion() }),
  ];
  for (const respond of responses) {
    let calls = 0;
    await assert.rejects(writer(async () => { calls++; return respond(); }).postComment({ rowId, text: "Please review" }), error => {
      assert.equal(error.code, "write_uncertain");
      assert.equal(error.uncertain, true);
      assert.equal(error.message.includes("private-synthetic-token"), false);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("reports definitive 4xx failures without retrying or echoing upstream error content", async () => {
  for (const status of [400, 401, 403, 404, 409, 413, 429]) {
    let calls = 0;
    await assert.rejects(writer(async () => {
      calls++;
      return Response.json({ message: "private-synthetic-token internal details" }, { status });
    }).postComment({ rowId, text: "Please review" }), error => {
      assert.equal(error.code, "http_" + status);
      assert.equal(error.uncertain, undefined);
      assert.equal(error.message.includes("private-synthetic-token"), false);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("failed verification after accepted POST retains receipt and blocks blind retry", async () => {
  let calls = 0;
  await assert.rejects(writer(async (url, options) => {
    calls++;
    if (options.method === "POST") return success({ id: 5001 });
    return new Response("unavailable", { status: 503 });
  }).postComment({ rowId, text: "Please review" }), error => {
    assert.equal(error.code, "write_uncertain");
    assert.deepEqual(error.receipt, { discussionId });
    return true;
  });
  assert.equal(calls, 2);
});

test("rejects malformed input, oversized file and header/path injection before any request", async () => {
  const invalid = [
    { text: " " }, { text: "a".repeat(MAX_COMMENT_LENGTH + 1) }, { text: "bad\0text" },
    { rowId: "1000/discussions" }, { discussionId: "1?inject=true" },
    { file: { name: "../a.pdf", bytes: Buffer.from("x") } },
    { file: { name: "a\r\nHeader.pdf", bytes: Buffer.from("x") } },
    { file: { name: "a.pdf", mimeType: "application/pdf\r\nInjected: true", bytes: Buffer.from("x") } },
    { file: { name: "a.pdf", bytes: "not bytes" } },
    { file: { name: "a.pdf", bytes: new Uint8Array(MAX_ATTACHMENT_BYTES + 1) } },
  ];
  let calls = 0;
  const api = writer(async () => { calls++; return success(discussion()); });
  for (const changes of invalid) await assert.rejects(api.postComment({ rowId, text: "Please review", ...changes }));
  assert.equal(calls, 0);
  const valid = validateCommentInput({ rowId, text: "Согласовано\n✓", file: { name: "чертёж.pdf", bytes: new Uint8Array([1, 2]) } });
  assert.equal(valid.file.mimeType, "application/octet-stream");
  assert.equal(valid.text, "Согласовано\n✓");
});

test("rejects mismatched attachment ownership after POST without reporting success", async () => {
  await assert.rejects(writer(async () => success(discussion({
    comments: [comment({ attachments: [{ ...attachment, parentId: 9002 }] })],
  }))).postComment({ rowId, text: "Please review", file: { name: "file.txt", bytes: Buffer.from("hello") } }), error => {
    assert.equal(error.code, "write_uncertain");
    assert.deepEqual(error.receipt, { discussionId, commentId });
    return true;
  });
});

test("already aborted request and missing token do not attempt remote write", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return success(discussion()); };
  await assert.rejects(writer(fetchImpl).postComment({ rowId, text: "Please review", signal: AbortSignal.abort() }), { code: "request_aborted" });
  await assert.rejects(createSmartsheetWriter({ sheetId: "12345678", token: "", fetchImpl }).postComment({ rowId, text: "Please review" }), { code: "http_401" });
  assert.equal(calls, 0);
});

test("multipart preserves Unicode filenames, comment text and arbitrary bytes", async () => {
  const text = "Проверь чертёж ✓\n第二行";
  const bytes = Buffer.from([0, 200, 255, 13, 10]);
  const filename = "Чертёж №2 – 修正.pdf";
  await writer(async (url, options) => {
    const form = await new Request(url, { method: "POST", headers: options.headers, body: options.body }).formData();
    assert.equal(form.get("file").name, filename);
    assert.deepEqual(JSON.parse(form.get("discussion")), { comment: { text } });
    assert.deepEqual(Buffer.from(await form.get("file").arrayBuffer()), bytes);
    return success(discussion({ comments: [comment({ text, attachments: [attachment] })] }));
  }).postComment({ rowId, text, file: { name: filename, bytes } });
});

test("rejects a create result that reports a different row or parent type", async () => {
  for (const changes of [{ parentId: 1001 }, { parentType: "SHEET" }]) {
    await assert.rejects(writer(async () => success(discussion(changes))).postComment({ rowId, text: "Please review" }), { code: "write_uncertain" });
  }
});

test("rejects a reply result whose text does not match the submitted comment", async () => {
  let posts = 0;
  await assert.rejects(writer(async (url, options) => {
    if (options.method === "GET") return Response.json(discussion());
    posts++;
    return success(comment({ text: "Some different comment" }));
  }).postComment({ rowId, discussionId, text: "Please review" }), error => {
    assert.equal(error.code, "write_uncertain");
    assert.deepEqual(error.receipt, { discussionId, commentId });
    return true;
  });
  assert.equal(posts, 1);
});

const fileProof = commentVerification({ text: "Please review", file: { name: "drawing.pdf" }, discussionId });
const namedAttachment = { ...attachment, name: "drawing.pdf" };

test("receipt verification uses only the saved discussion and comment IDs, even in a now read-only discussion", async () => {
  const calls = [];
  const api = writer(async (url, options) => {
    calls.push([options.method, url.pathname]);
    if (url.pathname.endsWith("/5001")) return Response.json(discussion({ readOnly: true }));
    return Response.json(comment({ attachments: [namedAttachment] }));
  });
  assert.deepEqual(await api.verifyComment({ rowId, discussionId, commentId, expected: fileProof }),
    { discussionId, commentId, attachmentIds: ["7001"] });
  assert.deepEqual(calls, [
    ["GET", "/2.0/sheets/12345678/discussions/5001"],
    ["GET", "/2.0/sheets/12345678/comments/9001"],
  ]);
});

test("rechecking a receipt rejects a different row, comment, text, or attachment", async () => {
  for (const [threadChange, commentChange] of [
    [{ parentId: 1002 }, {}], [{ parentType: "SHEET" }, {}], [{ id: 5002 }, {}],
    [{}, { id: 9002 }], [{}, { discussionId: 5002 }], [{}, { text: "Changed" }],
    [{}, { attachments: [] }], [{}, { attachments: [{ ...namedAttachment, name: "other.pdf" }] }],
    [{}, { attachments: [{ ...namedAttachment, parentId: 9002 }] }],
    [{}, { attachments: [namedAttachment, { ...namedAttachment, id: 7002 }] }],
  ]) {
    const api = writer(async (url, options) => {
      assert.equal(options.method, "GET");
      return Response.json(url.pathname.endsWith("/5001") ? discussion(threadChange) : comment({ attachments: [namedAttachment], ...commentChange }));
    });
    await assert.rejects(api.verifyComment({ rowId, discussionId, commentId, expected: fileProof }));
  }
});

test("thread-only receipts identify only the single original comment of a newly created thread", async () => {
  const createdAt = "2026-11-23T15:00:00Z";
  let thread = discussion({ createdAt, commentCount: 1, comments: [comment({ createdAt })] });
  const expected = commentVerification({ text: "Please review", file: null, discussionId: null });
  const api = writer(async (url, options) => {
    assert.equal(options.method, "GET");
    return Response.json(url.pathname.endsWith("/5001") ? thread : comment());
  });
  assert.equal((await api.verifyComment({ rowId, discussionId, expected })).commentId, commentId);
  await assert.rejects(api.verifyComment({ rowId, discussionId, expected: { ...expected, newDiscussion: false } }));
  for (const changed of [
    { comments: [comment({ createdAt }), comment({ id: 9002, createdAt })] },
    { commentCount: 2 }, { createdAt: null }, { comments: [comment({ createdAt: "later" })] },
  ]) {
    thread = discussion({ createdAt, comments: [comment({ createdAt })], ...changed });
    await assert.rejects(api.verifyComment({ rowId, discussionId, expected }));
  }
});
