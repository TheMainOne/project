import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMonitor } from "../src/monitor.js";
import { openStore } from "../src/store.js";
import { normalizedSheet, SHEET_ID } from "./fixtures.js";

test("overlapping sync calls share one read and pause persists", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ecn-monitor-"));
  const store = openStore(join(directory, "state.sqlite"), SHEET_ID);
  let release;
  let reads = 0;
  const reader = { read: () => {
    reads += 1;
    return new Promise(resolve => { release = () => resolve(normalizedSheet()); });
  } };
  const monitor = createMonitor({ reader, store, pollSeconds: 120, tokenConfigured: true });
  try {
    const first = monitor.sync();
    const second = monitor.sync();
    assert.equal(first, second);
    assert.equal(reads, 1);
    monitor.setPaused(true);
    release();
    await first;
    assert.equal(monitor.status().nextCheckAt, null);
    assert.equal(monitor.status().state, "paused");
    assert.equal(store.state().counts.initialReview, 1);
  } finally {
    await monitor.stop();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("post-write refresh reads again after an in-flight snapshot and preserves pause", async () => {
  const store = openStore(":memory:", SHEET_ID);
  store.setPaused(true);
  const stale = normalizedSheet();
  stale.commentsLoaded = true;
  stale.rows[0].discussions = [];
  const fresh = structuredClone(stale);
  fresh.rows[0].discussions.push({
    id: "2000", parentId: "1000", parentType: "ROW", title: "", comments: [{
      id: "3000", discussionId: "2000", text: "Just submitted", createdAt: "2026-11-22T17:00:00Z",
      modifiedAt: "2026-11-22T17:00:00Z", author: { name: "Test user", email: "" },
    }],
  });
  const firstRead = Promise.withResolvers();
  const secondRead = Promise.withResolvers();
  let reads = 0;
  let activeReads = 0;
  let maxActiveReads = 0;
  const reader = { async read() {
    reads += 1;
    activeReads += 1;
    maxActiveReads = Math.max(maxActiveReads, activeReads);
    try { return await (reads === 1 ? firstRead.promise : secondRead.promise); }
    finally { activeReads -= 1; }
  } };
  const monitor = createMonitor({ reader, store, pollSeconds: 120, tokenConfigured: true });
  try {
    const existingSync = monitor.sync();
    const afterWrite = monitor.refreshAfterWrite();
    assert.equal(reads, 1);
    firstRead.resolve(stale);
    await existingSync;
    assert.equal(reads, 2, "the post-write refresh must not reuse the stale in-flight snapshot");
    assert.equal(store.row("1000").commentCount, 0);
    secondRead.resolve(fresh);
    await afterWrite;
    assert.equal(store.row("1000").commentCount, 1);
    assert.equal(store.row("1000").discussions[0].comments[0].text, "Just submitted");
    assert.equal(maxActiveReads, 1);
    assert.equal(monitor.status().state, "paused");
    assert.equal(monitor.status().nextCheckAt, null);
  } finally {
    firstRead.resolve(stale);
    secondRead.resolve(fresh);
    await monitor.stop();
    store.close();
  }
});
