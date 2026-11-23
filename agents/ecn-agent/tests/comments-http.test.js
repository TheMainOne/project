import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createPanelServer } from "../src/http.js";
import { CommentRequestError } from "../src/comment-service.js";

async function setup(t) {
  const calls = [];
  const operations = new Map();
  const server = createPanelServer({ config: { token: "PRIVATE", sheetId: "5000", publicDirectory: fileURLToPath(new URL("../public/", import.meta.url)) },
    monitor: { status: () => ({ state: "watching" }) }, store: { state: () => ({}), row: () => ({ id: "1000" }) },
    comments: {
      get: (rowId, id) => operations.get(id)?.rowId === rowId ? operations.get(id) : null,
      submit: async value => { calls.push(value); if (value.text === "bad") throw new CommentRequestError(400, "Bad text");
        const operation = { id: value.operationId, rowId: value.rowId, status: value.text === "unknown" ? "uncertain" : "sent", commentId: "30", discussionId: "20", attachmentIds: value.file ? ["40"] : [] };
        operations.set(operation.id, operation); return operation; },
    } });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); server.close(); await once(server, "close"); });
  const base = "http://127.0.0.1:" + server.address().port;
  const send = (body, headers = {}) => fetch(base + "/api/rows/1000/comments", { method: "POST", headers: { Origin: base, "X-ECN-UI": "1", ...headers }, body });
  return { calls, base, send };
}
function form(text = "Hello", file = null) {
  const body = new FormData(); body.set("text", text); body.set("operationId", randomUUID());
  if (file) body.set("file", new Blob(["test bytes"], { type: "application/pdf" }), file);
  return body;
}

test("local multipart comment and file preserve bytes, reply target and queryable receipt", async t => {
  const f = await setup(t);
  const body = form("Hello <script>", "Чертёж.pdf"); body.set("discussionId", "20");
  const response = await f.send(body);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.operation.status, "sent"); assert.equal(result.refreshPending, true);
  assert.equal(f.calls[0].text, "Hello <script>"); assert.equal(f.calls[0].file.name, "Чертёж.pdf");
  assert.equal(f.calls[0].file.bytes.toString(), "test bytes"); assert.equal(f.calls[0].discussionId, "20");
  const receipt = await fetch(f.base + "/api/rows/1000/comment-operations/" + body.get("operationId"));
  assert.equal((await receipt.json()).operation.commentId, "30");
  assert.equal((await fetch(f.base + "/api/rows/1001/comment-operations/" + body.get("operationId"))).status, 404);
  assert.equal((await fetch(f.base + "/api/state")).status, 200);
});

test("comment routes reject foreign origins, malformed forms and duplicate or unknown fields before mutation", async t => {
  const f = await setup(t);
  assert.equal((await f.send(form(), { Origin: "https://example.test" })).status, 403);
  assert.equal((await f.send(form(), { "X-ECN-UI": "0" })).status, 403);
  assert.equal((await f.send("{}", { "Content-Type": "application/json" })).status, 415);
  const duplicate = form(); duplicate.append("text", "second");
  assert.equal((await f.send(duplicate)).status, 400);
  const extra = form(); extra.append("sheetId", "elsewhere");
  assert.equal((await f.send(extra)).status, 400);
  const badFile = form(); badFile.append("file", "not a file");
  assert.equal((await f.send(badFile)).status, 400);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.send(form("bad"))).status, 400);
  const uncertain = await f.send(form("unknown"));
  assert.equal(uncertain.status, 409); assert.equal((await uncertain.json()).operation.status, "uncertain");
});
