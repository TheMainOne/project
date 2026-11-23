import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createCommentService, createWriteQueue } from "../src/comment-service.js";
import { createPanelServer } from "../src/http.js";
import { createMonitor } from "../src/monitor.js";
import { createSmartsheetReader, FIELDS } from "../src/smartsheet.js";
import { createSmartsheetWriter } from "../src/smartsheet-write.js";
import { openStore } from "../src/store.js";
import { rawSheet, SHEET_ID } from "./fixtures.js";

test("on pause, posting a comment and checking its delayed file refresh the card without numbering another ECN", async t => {
  const sheet = rawSheet({ count: 2 });
  sheet.rows[1].cells.find(cell => String(cell.columnId) === FIELDS.ecnNumber).value = "";
  const comment = { id: 3000, discussionId: 2000, text: "Review this drawing." };
  const thread = { id: 2000, parentType: "ROW", parentId: 1000, comments: [comment] };
  const file = { id: 4000, parentType: "COMMENT", parentId: 3000, attachmentType: "FILE", name: "drawing.pdf" };
  const page = data => Response.json({ pageNumber: 1, totalPages: data.length ? 1 : 0, totalCount: data.length, data });
  const remoteMethods = [];
  let posted = false, fileVisible = false, numberingRuns = 0;
  const fetchImpl = async (url, options) => {
    remoteMethods.push(options.method);
    const path = url.pathname;
    if (options.method === "POST" && path.endsWith("/rows/1000/discussions")) {
      posted = true;
      return Response.json({ message: "SUCCESS", resultCode: 0, result: thread });
    }
    assert.equal(options.method, "GET");
    if (path.endsWith("/discussions")) return page(posted ? [thread] : []);
    if (path.endsWith("/attachments")) return page(fileVisible ? [file] : []);
    if (path.endsWith("/discussions/2000")) return Response.json(thread);
    if (path.endsWith("/comments/3000")) return fileVisible ? Response.json({ ...comment, attachments: [file] }) : new Response("", { status: 503 });
    assert.equal(path, "/2.0/sheets/" + SHEET_ID);
    return Response.json(sheet);
  };
  const config = { sheetId: SHEET_ID, token: "TEST", publicDirectory: fileURLToPath(new URL("../public/", import.meta.url)) };
  const reader = createSmartsheetReader({ ...config, fetchImpl });
  const store = openStore(":memory:", SHEET_ID);
  store.setPaused(true);
  store.saveSheet(await reader.read(), store.beginRun());
  const queue = createWriteQueue();
  const monitor = createMonitor({ store, reader, pollSeconds: 120, tokenConfigured: true, numberer: {
    run: () => queue(() => { numberingRuns++; return { writes: 0, assigned: 0 }; }),
    status: () => ({ enabled: true }), stop() {},
  } });
  let refreshed;
  const comments = createCommentService({ filename: ":memory:", sheetId: SHEET_ID, store, runExclusive: queue,
    writer: createSmartsheetWriter({ ...config, fetchImpl }), refresh: () => (refreshed = monitor.refreshAfterWrite()) });
  const server = createPanelServer({ config, reader, store, monitor, comments });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await Promise.all([monitor.stop(), comments.close()]);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    store.close();
  });
  const origin = "http://127.0.0.1:" + server.address().port;
  const headers = { Origin: origin, "X-ECN-UI": "1" };
  const id = randomUUID();
  const body = new FormData();
  body.set("operationId", id);
  body.set("text", comment.text);
  body.set("file", new Blob(["fixture"], { type: "application/pdf" }), file.name);
  const rowUrl = origin + "/api/rows/1000";
  const sent = await fetch(rowUrl + "/comments", { method: "POST", headers, body });
  const first = (await sent.json()).operation;
  assert.equal(first.status, "uncertain");
  assert.equal(first.discussionId, "2000");
  assert.equal(first.commentId, "3000");
  await refreshed;
  assert.equal(store.row("1000").commentCount, 1);
  fileVisible = true;
  const verifyUrl = rowUrl + "/comment-operations/" + id + "/verify";
  const checked = await fetch(verifyUrl, { method: "POST", headers });
  const verified = (await checked.json()).operation;
  assert.equal(verified.status, "sent");
  assert.deepEqual(verified.attachmentIds, ["4000"]);
  await refreshed;
  assert.equal(store.row("1000").attachmentCount, 1);
  assert.equal(store.row("1001").ecnNumber, "");
  assert.equal(monitor.status().state, "paused");
  assert.equal(monitor.status().nextCheckAt, null);
  assert.equal(numberingRuns, 0);
  assert.deepEqual(remoteMethods.filter(method => method !== "GET"), ["POST"]);
});
