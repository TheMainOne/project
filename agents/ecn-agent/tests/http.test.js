import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import { createPanelServer } from "../src/http.js";

test("serves the panel locally, hides secrets and rejects cross-origin control and sheet writes", async () => {
  let controls = 0;
  const store = {
    state: () => ({ rows: [], events: [], counts: {}, paused: false }),
    row: () => null,
  };
  const monitor = {
    sync: async () => { controls += 1; },
    setPaused: () => { controls += 1; },
    status: () => ({ state: "watching" }),
  };
  const server = createPanelServer({
    config: { token: "SECRET-ONLY-SERVER", sheetId: "5485143814104964", pollSeconds: 120, publicDirectory: fileURLToPath(new URL("../public/", import.meta.url)) },
    store, monitor,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const state = await fetch(base + "/api/state");
    assert.equal(state.status, 200);
    assert.equal((await state.text()).includes("SECRET-ONLY-SERVER"), false);
    const page = await fetch(base);
    assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal((await fetch(base + "/.env")).status, 404);
    assert.equal((await fetch(base + "/api/sync", { method: "POST" })).status, 403);
    assert.equal((await fetch(base + "/api/sync", { method: "POST", headers: { Origin: "https://example.test", "X-ECN-UI": "1" } })).status, 403);
    const spoofedHost = await new Promise((resolve, reject) => {
      const request = httpRequest(base + "/api/state", { headers: { Host: "example.test" } }, response => {
        response.resume();
        resolve(response.statusCode);
      });
      request.on("error", reject);
      request.end();
    });
    assert.equal(spoofedHost, 403);
    assert.equal((await fetch(base + "/api/send-for-approvals", { method: "POST" })).status, 404);
    assert.equal((await fetch(base + "/api/sync", { method: "POST", headers: { Origin: base, "X-ECN-UI": "1" } })).status, 202);
    assert.equal(controls, 1);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});

test("read markers require a local origin and exact snapshot revision", async () => {
  let calls = [];
  const store = {
    state: () => ({ rows: [], events: [], counts: {}, paused: false }),
    row: () => null,
    markCommentsSeen: (id, revision) => { calls.push([id, revision]); return id === "1001" ? "stale" : id === "1002" ? "missing" : "ok"; },
  };
  const server = createPanelServer({
    config: { token: "fake", sheetId: "5485143814104964", pollSeconds: 120, publicDirectory: fileURLToPath(new URL("../public/", import.meta.url)) },
    store, monitor: { status: () => ({state: "watching"}) },
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  const revision = "a".repeat(64);
  const options = { method: "POST", headers: { Origin: base, "X-ECN-UI": "1", "Content-Type": "application/json" }, body: JSON.stringify({revision}) };
  const path = "/api/rows/1000/comments/seen";
  try {
    assert.equal((await fetch(base+path,{...options,headers:{...options.headers,Origin:"https://example.test"}})).status,403);
    assert.equal((await fetch(base+path,{...options,body:'{"revision":"wrong"}'})).status,400);
    assert.equal((await fetch(base+path,{...options,body:'invalid'})).status,400);
    assert.equal((await fetch(base+path,{...options,body:'x'.repeat(1200)})).status,413);
    assert.equal(calls.length,0);
    assert.equal((await fetch(base+path,options)).status,200);
    assert.deepEqual(calls[0],["1000",revision]);
    assert.equal((await fetch(base+"/api/rows/1001/comments/seen",options)).status,409);
    assert.equal((await fetch(base+"/api/rows/1002/comments/seen",options)).status,404);
    assert.equal((await fetch(base+"/api/rows/1000/comments",{...options,body:'{"text":"send"}'})).status,404);
  } finally {
    server.closeAllConnections(); server.close(); await once(server,"close");
  }
});
