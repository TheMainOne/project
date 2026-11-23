import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createCommentService, createWriteQueue } from "../src/comment-service.js";
import { SmartsheetError } from "../src/smartsheet.js";

function setup(t, postComment = async () => ({ discussionId: "20", commentId: "30", attachmentIds: [] })) {
  const dir = mkdtempSync(join(tmpdir(), "ecn-comments-"));
  const filename = join(dir, "test.sqlite");
  let calls = 0, refreshes = 0;
  const rows = new Map([["1000", { id: "1000", discussions: [{ id: "20" }] }]]);
  const options = { filename, sheetId: "5000", store: { row: id => rows.get(id), addEvent() {} },
    writer: { postComment: async input => { calls++; return postComment(input); } }, refresh: () => { refreshes++; } };
  let service = createCommentService(options);
  t.after(async () => { await service.close(); rmSync(dir, { recursive: true, force: true }); });
  return { rows, get service() { return service; }, get calls() { return calls; }, get refreshes() { return refreshes; },
    async restart() { await service.close(); service = createCommentService(options); }, filename };
}
const input = (extra = {}) => ({ operationId: randomUUID(), rowId: "1000", text: "A real user draft", ...extra });

test("comment operations are durable and deduplicate text plus file after restart", async t => {
  const f = setup(t, async value => { assert.equal(value.file.bytes.toString(), "attachment bytes"); return { discussionId: "20", commentId: "30", attachmentIds: ["40"] }; });
  const draft = input({ file: { name: "drawing.pdf", mimeType: "application/pdf", bytes: Buffer.from("attachment bytes") } });
  const first = await f.service.submit(draft);
  assert.equal(first.status, "sent");
  assert.deepEqual(first.attachmentIds, ["40"]);
  assert.equal((await f.service.submit(draft)).commentId, "30");
  await f.restart();
  assert.equal((await f.service.submit(draft)).status, "sent");
  assert.equal(f.calls, 1);
  assert.equal(f.refreshes, 1);
  assert.equal(f.service.get("9999", draft.operationId), null);
  await assert.rejects(f.service.submit({ ...draft, text: "edited" }), { status: 409 });
  await assert.rejects(f.service.submit({ ...draft, file: { ...draft.file, bytes: Buffer.from("different") } }), { status: 409 });
});

test("overlapping submits share one intent and expose pending without duplicate remote writes", async t => {
  let finish;
  const f = setup(t, () => new Promise(resolve => { finish = resolve; }));
  const draft = input();
  const sending = f.service.submit(draft);
  assert.equal((await f.service.submit(draft)).status, "pending");
  assert.equal(f.service.get("1000", draft.operationId).status, "pending");
  finish({ discussionId: "20", commentId: "30", attachmentIds: [] });
  assert.equal((await sending).status, "sent");
  assert.equal(f.calls, 1);
});

test("ambiguous writes and interrupted persisted intents are never replayed", async t => {
  const f = setup(t, async () => { throw new SmartsheetError("write_uncertain", "Check discussion first."); });
  const draft = input();
  assert.equal((await f.service.submit(draft)).status, "uncertain");
  await f.restart();
  assert.equal((await f.service.submit(draft)).status, "uncertain");
  assert.equal(f.calls, 1);
  const db = new DatabaseSync(f.filename);
  const op = { id: draft.operationId, rowId: "1000", status: "pending" };
  db.prepare("UPDATE comment_operations SET result = ?").run(JSON.stringify(op)); db.close();
  assert.equal(f.service.get("1000", draft.operationId).status, "uncertain");
  assert.equal((await f.service.submit(draft)).status, "uncertain");
  assert.equal(f.calls, 1);
});

test("row membership, discussion ownership and malformed inputs prevent remote posts", async t => {
  const f = setup(t);
  for (const [extra, status] of [
    [{ rowId: "9999" }, 404], [{ discussionId: "21" }, 409], [{ operationId: "nope" }, 400],
    [{ text: " " }, 400], [{ text: "a".repeat(10001) }, 400],
    [{ file: { name: "../secret", mimeType: "text/plain", bytes: Buffer.from("x") } }, 400],
    [{ file: { name: "a", mimeType: "text/plain", bytes: Buffer.alloc(30000001) } }, 413],
  ]) await assert.rejects(f.service.submit(input(extra)), { status });
  assert.equal(f.calls, 0);
});

test("definitive rejection requires a new explicit operation, and shutdown drains writes", async t => {
  const f = setup(t, async () => { throw new SmartsheetError("http_403", "No permission."); });
  const draft = input();
  assert.equal((await f.service.submit(draft)).status, "rejected");
  assert.equal((await f.service.submit(draft)).status, "rejected");
  assert.equal(f.calls, 1);
  assert.equal(f.refreshes, 0);
  assert.equal((await f.service.submit(input())).status, "rejected");
  assert.equal(f.calls, 2);
});

test("write queue serializes numbering and comments and continues after rejection", async () => {
  const queue = createWriteQueue();
  const seen = [];
  let release;
  const first = queue(async () => { seen.push("number-start"); await new Promise(resolve => { release = resolve; }); seen.push("number-end"); throw new Error("stop"); });
  const second = queue(async () => { seen.push("comment"); });
  await Promise.resolve();
  assert.deepEqual(seen, ["number-start"]);
  release(); await assert.rejects(first); await second;
  assert.deepEqual(seen, ["number-start", "number-end", "comment"]);
});
