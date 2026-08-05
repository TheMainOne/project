import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import {
  PasteRowSheetContextAdapter,
  enforceReadinessGuard,
  formatStatusAliasLines,
  parseSingleTsvRow,
  parseStatusAliasLines,
  profileCanonicalFields,
  suggestProfileBindings,
} from "../extensions/clients/chrome-smartsheet-ecn/src/sheet-context-adapter.js";

await import("../extensions/clients/chrome-smartsheet-ecn/src/capture-core.js");

const fixturePath = new URL(
  "../extensions/clients/chrome-smartsheet-ecn/fixtures/synthetic-grid.html",
  import.meta.url,
);
const fixture = await readFile(fixturePath, "utf8");

function confirmedProfile(headers = ["ECN Number", "Status", "Requested By", "Change Type"]) {
  return {
    version: "test-1",
    headerOrder: headers,
    expectedHeaders: headers,
    bindings: {
      ecnNumber: "ECN Number#1",
      status: "Status#2",
    },
    primaryKeys: ["ecnNumber"],
    confirmed: true,
    mappingState: "ready",
  };
}

test("TSV parser supports quoted tabs and rejects multiple rows", () => {
  assert.deepEqual(parseSingleTsvRow('ECN-1\t"A\tB"\tSubmitted'), ["ECN-1", "A\tB", "Submitted"]);
  assert.throws(() => parseSingleTsvRow("a\tb\nc\td"), /TSV_MULTIPLE_ROWS/);
  assert.throws(() => parseSingleTsvRow('a\t"b'), /TSV_UNCLOSED_QUOTE/);
});

test("profile helpers auto-map unique aliases and preserve explicit Status values", () => {
  const profile = {
    bindings: { ecnNumber: "ECN Number#1" },
    aliases: {
      ecnNumber: ["ECN #"],
      status: ["Workflow Status"],
      reason: ["Reason / Justification"],
    },
  };
  const headers = ["ECN #", "Workflow Status", "Reason / Justification"];
  assert.deepEqual(profileCanonicalFields(profile), ["ecnNumber", "status", "reason"]);
  assert.deepEqual(suggestProfileBindings(profile, headers), {
    ecnNumber: 1,
    status: 2,
    reason: 3,
  });

  const aliases = parseStatusAliasLines(
    "Waiting for approval = Pre-Approval\nInformation requested\tNeeds Info",
  );
  assert.deepEqual(aliases, {
    "Waiting for approval": "Pre-Approval",
    "Information requested": "Needs Info",
  });
  assert.equal(parseStatusAliasLines(formatStatusAliasLines(aliases))["Waiting for approval"], "Pre-Approval");
  assert.throws(() => parseStatusAliasLines("Waiting = Not a lifecycle stage"), /STATUS_ALIAS_VALUE/);
});

test("paste adapter maps exact one-based profile order and resolves canonical primary key", async () => {
  const profile = confirmedProfile();
  const snapshot = await new PasteRowSheetContextAdapter({
    profile,
    input: "ECN-4001\tSubmitted\tuser@example.test\tQA Block",
    pageUrl: "https://app.smartsheet.com/sheets/test",
  }).capture();

  assert.equal(snapshot.captureState, "complete");
  assert.equal(snapshot.rowHint.primaryValue, "ECN-4001");
  assert.equal(snapshot.rowHint.ecnNumber, "ECN-4001");
  assert.deepEqual(snapshot.fields.map((field) => field.ordinal), [1, 2, 3, 4]);
});

test("paste adapter blocks a column-count mismatch and unconfirmed profile is ambiguous", async () => {
  const profile = confirmedProfile();
  await assert.rejects(
    () => new PasteRowSheetContextAdapter({
      profile,
      input: "ECN-1\tSubmitted",
      pageUrl: "https://app.smartsheet.com.au/sheets/test",
    }).capture(),
    (error) => error.code === "TSV_COLUMN_COUNT" && error.actual === 2 && error.expected === 4,
  );

  const snapshot = await new PasteRowSheetContextAdapter({
    profile: { ...profile, confirmed: false, mappingState: "needs_remap" },
    input: "ECN-1\tSubmitted\tuser@example.test\tQA Block",
    pageUrl: "https://app.smartsheet.eu/sheets/test",
  }).capture();
  assert.equal(snapshot.captureState, "ambiguous");
});

test("paste adapter requires an exact allowlisted Smartsheet page context", async () => {
  await assert.rejects(
    () => new PasteRowSheetContextAdapter({
      profile: confirmedProfile(),
      input: "ECN-1\tSubmitted\tuser@example.test\tQA Block",
      pageUrl: "https://example.com/sheets/test",
    }).capture(),
    (error) => error.code === "SMARTSHEET_CONTEXT_REQUIRED",
  );
});

test("DOM adapter accumulates manually virtualized columns and resets on row change without mutations", () => {
  const dom = new JSDOM(fixture, { url: "https://app.smartsheet.com/sheets/test" });
  const { document } = dom.window;
  const before = document.documentElement.outerHTML;
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(document, {
    window: dom.window,
    profile: confirmedProfile(),
  });

  adapter.selectCell(document.querySelector('#row-2 [aria-colindex="1"]'));
  let snapshot = adapter.snapshot();
  assert.equal(snapshot.captureState, "partial");
  assert.deepEqual(snapshot.fields.map((field) => field.ordinal), [1, 2]);

  const row = document.getElementById("row-2");
  row.replaceChildren();
  for (const [ordinal, headerId, value] of [
    [3, "h3", "user@example.test"],
    [4, "h4", "QA Block"],
  ]) {
    const cell = document.createElement("div");
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-rowindex", "2");
    cell.setAttribute("aria-colindex", String(ordinal));
    cell.setAttribute("aria-labelledby", headerId);
    cell.textContent = value;
    row.append(cell);
  }
  snapshot = adapter.captureVisibleRow();
  assert.equal(snapshot.captureState, "complete");
  assert.deepEqual(snapshot.fields.map((field) => field.ordinal), [1, 2, 3, 4]);

  adapter.selectCell(document.querySelector('#row-3 [aria-colindex="1"]'));
  snapshot = adapter.snapshot();
  assert.equal(snapshot.rowHint.rowIndex, 3);
  assert.equal(snapshot.rowHint.ecnNumber, "ECN-1002");
  assert.equal(snapshot.fields.length, 4);

  // Only the fixture itself was changed above; capture calls do not mutate it.
  const afterCapture = document.documentElement.outerHTML;
  adapter.captureVisibleRow();
  assert.equal(document.documentElement.outerHTML, afterCapture);
  assert.notEqual(before, afterCapture);
});

test("DOM adapter resolves grid focus through aria-activedescendant", () => {
  const dom = new JSDOM(fixture, { url: "https://app.smartsheet.com/sheets/test" });
  const { document } = dom.window;
  const grid = document.querySelector('[role="grid"]');
  const cell = document.querySelector('#row-2 [aria-colindex="1"]');
  grid.tabIndex = 0;
  cell.id = "active-grid-cell";
  grid.setAttribute("aria-activedescendant", cell.id);
  grid.focus();
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(document, {
    window: dom.window,
    profile: confirmedProfile(),
  });
  assert.equal(adapter.discoverSelection(), true);
  assert.equal(adapter.snapshot().rowHint.rowIndex, 2);
});

test("duplicate headers stay distinct by ordinal; hidden expected column remains partial", () => {
  const html = `<!doctype html><div role="grid">
    <div role="row" aria-rowindex="1">
      <div id="d1" role="columnheader" aria-colindex="1">ECN Number</div>
      <div id="d2" role="columnheader" aria-colindex="2">Status</div>
      <div id="d3" role="columnheader" aria-colindex="3">Status</div>
      <div id="d4" role="columnheader" aria-colindex="4" hidden>Hidden</div>
    </div>
    <div role="row" aria-rowindex="2">
      <div role="gridcell" aria-rowindex="2" aria-colindex="1" aria-labelledby="d1">ECN-9</div>
      <div role="gridcell" aria-rowindex="2" aria-colindex="2" aria-labelledby="d2">Submitted</div>
      <div role="gridcell" aria-rowindex="2" aria-colindex="3" aria-labelledby="d3">Open</div>
    </div>
  </div>`;
  const dom = new JSDOM(html, { url: "https://app.smartsheet.eu/sheets/test" });
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(dom.window.document, {
    window: dom.window,
    profile: confirmedProfile(["ECN Number", "Status", "Status", "Hidden"]),
  });
  adapter.selectCell(dom.window.document.querySelector('[role="gridcell"]'));
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.captureState, "partial");
  assert.deepEqual(snapshot.fields.map((field) => `${field.header}#${field.ordinal}`), [
    "ECN Number#1",
    "Status#2",
    "Status#3",
  ]);
  assert.deepEqual(snapshot.captureMeta.missingColumns, ["Hidden"]);
});

test("unknown header makes capture ambiguous and diagnostics contain no cell values", () => {
  const dom = new JSDOM(fixture, { url: "https://app.smartsheetgov.com/sheets/test" });
  const { document } = dom.window;
  const unknown = document.createElement("div");
  unknown.setAttribute("role", "gridcell");
  unknown.setAttribute("aria-rowindex", "2");
  unknown.setAttribute("aria-colindex", "5");
  unknown.textContent = "SECRET-VALUE";
  document.getElementById("row-2").append(unknown);
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(document, {
    window: dom.window,
    profile: confirmedProfile(),
  });
  adapter.selectCell(document.querySelector('#row-2 [aria-colindex="1"]'));
  assert.equal(adapter.snapshot().captureState, "ambiguous");
  const serialized = JSON.stringify(adapter.diagnostics());
  assert.equal(serialized.includes("SECRET-VALUE"), false);
  assert.equal(adapter.diagnostics().containsCellValues, false);
});

test("client readiness guard downgrades final pass gates and overrides closure action", () => {
  const guarded = enforceReadinessGuard({
    gates: [
      { stage: "Pre-Approval readiness", status: "pass" },
      { stage: "MDC Validation", status: "pass" },
      { stage: "Closed", status: "pass" },
    ],
    drafts: {
      missingInformation: "Safe request for missing data",
      approvalComment: "Must be withheld",
      closureSummary: "Must be withheld",
    },
    nextAction: { status: "closed", label: "Ready to close" },
  }, { captureState: "partial" });

  assert.equal(guarded.clientGuard.finalReadinessAllowed, false);
  assert.deepEqual(guarded.gates.map((gate) => gate.status), ["unknown", "pass", "unknown"]);
  assert.equal(guarded.nextAction.kind, "complete_capture");
  assert.equal(guarded.drafts.missingInformation, "Safe request for missing data");
  assert.equal(guarded.drafts.approvalComment, null);
  assert.equal(guarded.drafts.closureSummary, null);

  const remapGuarded = enforceReadinessGuard({
    capture: { profileState: "needs_remap", readinessAllowed: false },
    gates: [{ stage: "Closed", status: "pass" }],
    nextAction: { status: "closed" },
  }, { captureState: "complete" });
  assert.equal(remapGuarded.clientGuard.reason, "profile_needs_remap");
  assert.equal(remapGuarded.gates[0].status, "unknown");
});
