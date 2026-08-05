import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(currentDir, "..");
const fixture = await readFile(path.join(extensionDir, "fixtures", "synthetic-grid.html"), "utf8");
const userDataDir = await mkdtemp(path.join(tmpdir(), "ecn-extension-e2e-"));
const requests = [];
const profileHeaders = ["ECN Number", "Status", "Requested By", "Change Type"];
const profileFingerprint = createHash("sha256")
  .update(profileHeaders.map((header, index) => `${index + 1}:${header.toLowerCase()}`).join("\n"), "utf8")
  .digest("hex");

const profile = {
  version: "e2e-confirmed-1",
  headerFingerprint: profileFingerprint,
  expectedHeaders: [...profileHeaders],
  headerOrder: [...profileHeaders],
  bindings: {
    ecnNumber: "ECN Number#1",
    status: "Status#2",
    requestedBy: "Requested By#3",
    changeTypes: "Change Type#4",
  },
  aliases: {},
  primaryKeys: ["ecnNumber"],
  statusAliases: {},
  locale: "ru",
  confirmed: true,
  mappingState: "ready",
};

const analysisResponse = {
  analysisId: "e2e-analysis-1",
  ruleSetVersion: "e2e-rules-1",
  capture: { state: "complete", missingColumns: [] },
  classification: {
    selectedTypes: ["qa_block"],
    alternatives: [],
    confidence: 1,
    requiresConfirmation: false,
  },
  gates: [
    { stage: "MDC Validation", status: "pass", label: "Base request information" },
  ],
  routing: {
    preApprovers: [{ department: "Supply Chain", reasons: [{ typeLabel: "QA Block" }] }],
    reviewers: [{ department: "Supply Chain", reasons: [{ typeLabel: "QA Block" }] }],
    recipients: [{ department: "Production", reasons: [{ typeLabel: "QA Block" }] }],
  },
  tasks: [{ id: "qa", label: "Verify QA authorization", severity: "info", status: "pending" }],
  nextAction: { status: "ready", label: "Ready for Pre-Approval" },
  drafts: {
    status: "available",
    missingInformation: "Please provide the missing information.",
    approvalComment: "Approval draft from E2E.",
    implementationHandoff: "Implementation handoff from E2E.",
    reviewerRequest: "Reviewer request from E2E.",
    closureSummary: "Closure summary from E2E.",
  },
  citations: [{
    source: "DWKID-7206",
    revision: "e2e",
    section: "Matrix row: QA Block",
    cellRange: "Sheet1!A39:AJ39",
    evidenceLevel: "controlled",
  }],
};

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  const body = rawBody ? JSON.parse(rawBody) : null;
  requests.push({ method: request.method, url: request.url, body });
  response.setHeader("Content-Type", "application/json");
  if (request.method === "GET" && request.url === "/api/ecn/ext/bootstrap") {
    response.end(JSON.stringify({
      profile,
      ruleSetVersion: "e2e-rules-1",
      language: "ru",
      capabilities: { captureModes: ["dom", "paste"], analyze: true, smartsheetWrite: false },
      changeTypes: [{ id: "qa_block", label: "QA Block", aliases: [] }],
    }));
    return;
  }
  if (request.method === "POST" && request.url === "/api/ecn/ext/analyze") {
    response.end(JSON.stringify(analysisResponse));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: "Not found" }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

let context;
try {
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.ECN_E2E_HEADLESS === "1",
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
  const extensionId = new URL(worker.url()).host;

  await context.route("https://app.smartsheet.com/sheets/ecn-e2e", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: fixture,
  }));

  const panel = await context.newPage();
  await panel.setViewportSize({ width: 420, height: 900 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);
  await panel.evaluate(async ({ apiBase }) => {
    await chrome.storage.local.set({
      ecnExtensionToken: { token: "e2e-token", expiresAt: Date.now() + 3_600_000 },
      ecnAuthUser: { email: "ecn-e2e@example.test", roles: ["ecn_user"] },
      ecnLanguage: "ru",
      ecnApiBaseUrl: apiBase,
    });
  }, { apiBase: `http://127.0.0.1:${port}/api/ecn/ext` });
  await panel.reload();
  await panel.locator("#workspace").waitFor({ state: "visible" });

  assert.equal(await panel.locator("html").getAttribute("lang"), "ru");
  await panel.evaluate(() => document.getElementById("langEn").click());
  await panel.waitForFunction(() => document.documentElement.lang === "en");

  const grid = await context.newPage();
  await grid.goto("https://app.smartsheet.com/sheets/ecn-e2e");
  await grid.bringToFront();
  const toolbarSetup = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://app.smartsheet.com/sheets/ecn-e2e" });
    if (!tab?.id) return null;
    return {
      behavior: await chrome.sidePanel.getPanelBehavior(),
      options: await chrome.sidePanel.getOptions({ tabId: tab.id }),
    };
  });
  assert.equal(toolbarSetup?.behavior?.openPanelOnActionClick, true);
  assert.equal(toolbarSetup?.options?.enabled, true);
  assert.equal(toolbarSetup?.options?.path, "sidepanel/index.html");
  const profileBridge = await panel.evaluate((activeProfile) => chrome.runtime.sendMessage({
    type: "ECN_SET_ACTIVE_PROFILE",
    profile: activeProfile,
  }), profile);
  assert.equal(profileBridge.ok, true);
  await grid.locator('#row-3 [aria-colindex="1"]').click();
  const beforeCapture = await grid.locator("#fixture-root").evaluate((node) => node.outerHTML);

  // Execute panel UI actions without activating its tab; the active page remains Smartsheet.
  await grid.bringToFront();
  await panel.evaluate(() => document.getElementById("captureButton").click());
  try {
    await panel.waitForFunction(() => document.getElementById("captureState")?.textContent === "Complete");
  } catch (error) {
    const panelState = await panel.evaluate(() => ({
      captureState: document.getElementById("captureState")?.textContent,
      notice: document.getElementById("notice")?.textContent,
      snapshot: document.getElementById("snapshotSummary")?.textContent,
      busy: !document.getElementById("busy")?.classList.contains("hidden"),
    }));
    console.error("Capture did not become complete", { panelState, requests });
    throw error;
  }
  const afterCapture = await grid.locator("#fixture-root").evaluate((node) => node.outerHTML);
  assert.equal(afterCapture, beforeCapture, "content script must not mutate the grid DOM");

  await grid.bringToFront();
  await panel.evaluate(() => document.getElementById("analyzeButton").click());
  await panel.locator("#analysisView").waitFor({ state: "visible" });
  assert.match(await panel.locator("#routingGroups").innerText(), /Supply Chain/);
  assert.match(await panel.locator("#tasksList").innerText(), /Verify QA authorization/);
  assert.match(await panel.locator("#citationsList").innerText(), /DWKID-7206/);

  await panel.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { globalThis.__copiedDraft = text; } },
    });
    document.querySelector(".copy-button:not(:disabled)").click();
  });
  assert.equal(await panel.evaluate(() => globalThis.__copiedDraft), "Please provide the missing information.");

  // Verify the strict TSV fallback against the same confirmed header order.
  await grid.bringToFront();
  await panel.evaluate(() => {
    document.getElementById("pasteMode").click();
    const input = document.getElementById("pasteInput");
    input.value = "ECN-2000\tSubmitted\trequestor@example.test\tQA Block";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("validatePasteButton").click();
  });
  await panel.waitForFunction(() => document.getElementById("captureState")?.textContent === "Complete");
  await grid.bringToFront();
  await panel.evaluate(() => document.getElementById("analyzeButton").click());
  await panel.waitForFunction(() => document.getElementById("notice")?.textContent === "Analysis complete.");

  const analyzeRequests = requests.filter((entry) => entry.method === "POST" && entry.url === "/api/ecn/ext/analyze");
  assert.equal(analyzeRequests.length, 2);
  assert.equal(analyzeRequests[0].body.snapshot.captureMode, "dom");
  assert.equal(analyzeRequests[1].body.snapshot.captureMode, "paste");
  assert.equal(analyzeRequests[1].body.snapshot.fields.length, 4);
  assert.deepEqual(analyzeRequests[1].body.snapshot.fields.map((field) => field.ordinal), [1, 2, 3, 4]);
  if (process.env.ECN_E2E_SCREENSHOT_PATH) {
    await panel.bringToFront();
    await panel.screenshot({ path: path.resolve(process.env.ECN_E2E_SCREENSHOT_PATH), fullPage: true });
  }
  console.log("ECN extension E2E passed");
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(userDataDir, { recursive: true, force: true });
}
