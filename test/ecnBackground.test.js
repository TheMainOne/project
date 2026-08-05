import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const backgroundPath = new URL(
  "../extensions/clients/chrome-smartsheet-ecn/src/background.js",
  import.meta.url,
);
const backgroundSource = await readFile(backgroundPath, "utf8");

function eventHook() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    },
  };
}

async function flushTasks() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("toolbar action preconfigures Smartsheet tabs and delegates opening to Chrome", async () => {
  const calls = {
    behavior: [],
    options: [],
    opens: [],
    queries: [],
    titles: [],
    badges: [],
    errors: [],
  };
  const allowedTab = { id: 17, url: "https://app.smartsheet.com/sheets/test" };
  const hooks = {
    installed: eventHook(),
    startup: eventHook(),
    clicked: eventHook(),
    updated: eventHook(),
    activated: eventHook(),
    message: eventHook(),
  };
  const chrome = {
    runtime: {
      id: "test-extension",
      onInstalled: hooks.installed,
      onStartup: hooks.startup,
      onMessage: hooks.message,
    },
    sidePanel: {
      async setPanelBehavior(value) { calls.behavior.push(value); },
      async setOptions(value) { calls.options.push(value); },
      async open(value) { calls.opens.push(value); },
    },
    action: {
      onClicked: hooks.clicked,
      async setTitle(value) { calls.titles.push(value); },
      async setBadgeText(value) { calls.badges.push(value); },
      async setBadgeBackgroundColor() {},
    },
    tabs: {
      onUpdated: hooks.updated,
      onActivated: hooks.activated,
      async query(value) {
        calls.queries.push(value);
        return [allowedTab];
      },
      async get(tabId) {
        return { ...allowedTab, id: tabId };
      },
      async sendMessage() {
        return { ok: true };
      },
    },
    storage: {
      local: {
        async get() { return {}; },
        async set() {},
        async remove() {},
      },
      session: {
        async get() { return {}; },
        async set() {},
        async remove() {},
      },
    },
  };

  runInNewContext(backgroundSource, {
    chrome,
    URL,
    AbortController,
    atob: globalThis.atob,
    fetch: globalThis.fetch,
    setTimeout: () => 1,
    clearTimeout: () => undefined,
    console: { error: (...args) => calls.errors.push(args) },
  }, { filename: "background.js" });
  await flushTasks();

  assert.ok(calls.behavior.some((value) => value.openPanelOnActionClick === true));
  assert.deepEqual(Array.from(calls.queries[0].url), [
    "https://app.smartsheet.com/*",
    "https://app.smartsheet.com.au/*",
    "https://app.smartsheet.eu/*",
    "https://app.smartsheetgov.com/*",
  ]);
  assert.ok(calls.options.some((value) => (
    value.tabId === allowedTab.id &&
    value.path === "sidepanel/index.html" &&
    value.enabled === true
  )));

  const actionResult = hooks.clicked.listeners[0](allowedTab);
  assert.equal(actionResult, undefined, "the toolbar callback must not await before Chrome opens the panel");
  await flushTasks();
  assert.equal(calls.opens.length, 0, "manual sidePanel.open must not race the built-in toolbar behavior");

  hooks.updated.listeners[0](
    18,
    { url: "https://example.com/not-smartsheet" },
    { id: 18, url: "https://example.com/not-smartsheet" },
  );
  hooks.updated.listeners[0](
    19,
    { url: "https://app.smartsheet.eu/sheets/example" },
    { id: 19, url: "https://app.smartsheet.eu/sheets/example" },
  );
  hooks.activated.listeners[0]({ tabId: allowedTab.id });
  await flushTasks();

  assert.ok(calls.options.some((value) => value.tabId === 18 && value.enabled === false));
  assert.ok(calls.options.some((value) => value.tabId === 19 && value.enabled === true));
  assert.equal(calls.errors.length, 0);
});
