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
