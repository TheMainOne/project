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
import {
  DWK_57172_BINDINGS,
  DWK_57172_HEADERS,
} from "../extensions/ecn/profiles/dwk57172.js";

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

test("DOM adapter captures native Table view cells and ignores leading utility columns", () => {
  const html = `<!doctype html><h1>ENGINEERING CHANGE FORM</h1><table>
    <thead><tr>
      <th></th><th></th><th>ECN Number</th><th>Status</th><th>Requested By</th><th>Change Type</th>
    </tr></thead>
    <tbody><tr>
      <td>row controls</td><td>attachments</td><td><span id="native-selected">ECN-2001</span></td>
      <td>Submitted</td><td>requestor@example.test</td><td>QA Block</td>
    </tr></tbody>
  </table>`;
  const dom = new JSDOM(html, { url: "https://app.smartsheet.com/sheets/native-table" });
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(dom.window.document, {
    window: dom.window,
    profile: confirmedProfile(),
  });

  assert.equal(adapter.selectCell(dom.window.document.getElementById("native-selected")), true);
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.captureState, "complete");
  assert.equal(snapshot.rowHint.rowIndex, 2);
  assert.equal(snapshot.rowHint.ecnNumber, "ECN-2001");
  assert.deepEqual(snapshot.fields.map((field) => field.ordinal), [1, 2, 3, 4]);
  assert.equal(snapshot.fields.some((field) => field.value === "row controls"), false);
  assert.equal(adapter.diagnostics().semantic.lastSelectionSource, "native-table");
});

test("native Table view capture joins frozen and scrolling panes inside one semantic grid", () => {
  const html = `<!doctype html><div role="grid" aria-label="ECN table">
    <table><thead><tr><th></th><th>ECN Number</th></tr></thead>
      <tbody><tr><td>2</td><td><span id="split-selected">ECN-9002</span></td></tr></tbody></table>
    <table><thead><tr><th>Status</th><th>ECN Type</th></tr></thead>
      <tbody><tr><td>Initial Review</td><td>Change</td></tr></tbody></table>
  </div>`;
  const dom = new JSDOM(html, { url: "https://app.smartsheet.com/sheets/native-split" });
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(dom.window.document, {
    window: dom.window,
    profile: confirmedProfile(["ECN Number", "Status", "ECN Type"]),
  });

  assert.equal(adapter.selectCell(dom.window.document.getElementById("split-selected")), true);
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.captureState, "complete");
  assert.deepEqual(snapshot.fields.map(({ header, ordinal, value }) => ({ header, ordinal, value })), [
    { header: "ECN Number", ordinal: 1, value: "ECN-9002" },
    { header: "Status", ordinal: 2, value: "Initial Review" },
    { header: "ECN Type", ordinal: 3, value: "Change" },
  ]);
});

test("native Table view keeps the selected row across horizontal row replacement", () => {
  const dom = new JSDOM(`<!doctype html><table>
    <thead><tr><th>ECN Number</th><th>Status</th></tr></thead>
    <tbody><tr><td id="replace-selected">ECN-RENDER</td><td>Initial Review</td></tr></tbody>
  </table>`, { url: "https://app.smartsheet.com/sheets/native-replace" });
  const { document } = dom.window;
  const table = document.querySelector("table");
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(document, {
    window: dom.window,
    profile: confirmedProfile(["ECN Number", "Status", "ECN Type"]),
  });

  assert.equal(adapter.selectCell(document.getElementById("replace-selected")), true);
  table.tHead.rows[0].cells[1].textContent = "ECN Type";
  table.tBodies[0].innerHTML = "<tr><td>ECN-RENDER</td><td>Change</td></tr>";
  const snapshot = adapter.captureVisibleRow();
  assert.equal(snapshot.captureState, "complete");
  assert.deepEqual(snapshot.fields.map((field) => field.value), ["ECN-RENDER", "Initial Review", "Change"]);
});

test("unrelated native tables cannot expose a row without the ECN primary anchor", () => {
  const dom = new JSDOM(`<!doctype html><table><thead><tr><th>Status</th></tr></thead>
    <tbody><tr><td id="aux-selected">PRIVATE-AUX</td></tr></tbody></table>`, {
    url: "https://app.smartsheet.com/sheets/auxiliary",
  });
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(dom.window.document, {
    window: dom.window,
    profile: {
      ...confirmedProfile(DWK_57172_HEADERS),
      bindings: { ...DWK_57172_BINDINGS },
      primaryKeys: ["ecnNumber"],
    },
  });

  assert.equal(adapter.selectCell(dom.window.document.getElementById("aux-selected")), false);
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.captureState, "ambiguous");
  assert.equal(snapshot.fields.length, 0);
  assert.deepEqual(snapshot.captureMeta.reasons, ["untrusted_semantic_root"]);
  assert.equal(JSON.stringify(snapshot).includes("PRIVATE-AUX"), false);
});

test("hidden cell ancestors and hidden editors never enter a captured snapshot", () => {
  const dom = new JSDOM(`<!doctype html><div role="grid">
    <div role="columnheader" aria-colindex="1">ECN Number</div>
    <div role="columnheader" aria-colindex="2">Status</div>
    <div role="columnheader" aria-colindex="3">Comment/Updates</div>
    <div role="columnheader" aria-colindex="4">ECN Type</div>
    <div role="row" aria-rowindex="2">
      <div id="visible-selected" role="gridcell" aria-rowindex="2" aria-colindex="1">ECN-VISIBLE</div>
      <div style="display:none"><div role="gridcell" aria-rowindex="2" aria-colindex="2">SECRET-HIDDEN-CELL</div></div>
      <div role="gridcell" aria-rowindex="2" aria-colindex="3">
        <input style="display:none" value="SECRET-HIDDEN-EDITOR"><span>Visible comment</span>
      </div>
      <div aria-hidden="true"><div role="gridcell" aria-rowindex="2" aria-colindex="4">SECRET-ARIA-CELL</div></div>
    </div>
  </div>`, { url: "https://app.smartsheet.com/sheets/visibility" });
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(dom.window.document, {
    window: dom.window,
    profile: confirmedProfile(["ECN Number", "Status", "Comment/Updates", "ECN Type"]),
  });

  assert.equal(adapter.selectCell(dom.window.document.getElementById("visible-selected")), true);
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.captureState, "partial");
  assert.deepEqual(snapshot.fields.map((field) => field.value), ["ECN-VISIBLE", "Visible comment"]);
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes("SECRET-HIDDEN-CELL"), false);
  assert.equal(serialized.includes("SECRET-HIDDEN-EDITOR"), false);
  assert.equal(serialized.includes("SECRET-ARIA-CELL"), false);
});

test("allowlisted dataset row and column identities capture opaque virtualized cells within one grid", () => {
  const dom = new JSDOM(`<!doctype html><div data-grid-id="main-ecn">
    <div role="columnheader" data-column-id="column-a">ECN Number</div>
    <div role="columnheader" data-column-id="column-b">Status</div>
    <div data-row-id="opaque-row-a" data-column-id="column-a" id="dataset-selected">
      <input value="ECN-DATASET" aria-label="ECN editor">
    </div>
    <div data-row-id="opaque-row-a" data-column-id="column-b" aria-label="Status editor">Initial Review</div>
    <div data-grid-id="other-grid">
      <div role="columnheader" data-column-id="column-a">ECN Number</div>
      <div role="columnheader" data-column-id="column-b">Status</div>
      <div data-row-id="opaque-row-a" data-column-id="column-a">PRIVATE-OTHER-GRID</div>
      <div data-row-id="opaque-row-a" data-column-id="column-b">Approved</div>
    </div>
  </div>`, { url: "https://app.smartsheet.com/sheets/dataset" });
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(dom.window.document, {
    window: dom.window,
    profile: confirmedProfile(["ECN Number", "Status"]),
  });

  assert.equal(adapter.selectCell(dom.window.document.getElementById("dataset-selected")), true);
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.captureState, "complete");
  assert.deepEqual(snapshot.fields.map((field) => field.value), ["ECN-DATASET", "Initial Review"]);
  assert.equal(JSON.stringify(snapshot).includes("PRIVATE-OTHER-GRID"), false);
  const diagnostics = JSON.stringify(adapter.diagnostics());
  assert.equal(diagnostics.includes("opaque-row-a"), false);
  assert.equal(diagnostics.includes("column-a"), false);
  assert.equal(diagnostics.includes("ECN-DATASET"), false);
});

test("selection overlay resolves the native cell underneath without coordinate-derived row guessing", () => {
  const html = `<!doctype html><table><thead><tr><th>ECN Number</th><th>Status</th></tr></thead>
    <tbody><tr><td><span id="underlay">ECN-OVERLAY</span></td><td>Submitted</td></tr></tbody></table>
    <div id="overlay"></div>`;
  const dom = new JSDOM(html, { url: "https://app.smartsheet.eu/sheets/overlay" });
  const { document } = dom.window;
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(document, {
    window: dom.window,
    profile: confirmedProfile(["ECN Number", "Status"]),
  });
  document.elementsFromPoint = () => [document.getElementById("overlay"), document.getElementById("underlay")];

  adapter.onSelectionEvent({
    type: "pointerdown",
    target: document.getElementById("overlay"),
    clientX: 10,
    clientY: 10,
    composedPath: () => [document.getElementById("overlay")],
  });
  assert.equal(adapter.snapshot().rowHint.ecnNumber, "ECN-OVERLAY");
  assert.equal(adapter.snapshot().captureState, "complete");
});

test("canvas under a selection overlay clears a previously captured row", () => {
  const html = `<!doctype html><table><thead><tr><th>ECN Number</th><th>Status</th></tr></thead>
    <tbody><tr><td id="canvas-prior">ECN-PRIOR</td><td>Initial Review</td></tr></tbody></table>
    <canvas id="sheet-canvas"></canvas><div id="canvas-overlay"></div>`;
  const dom = new JSDOM(html, { url: "https://app.smartsheet.com/sheets/canvas" });
  const { document } = dom.window;
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(document, {
    window: dom.window,
    profile: confirmedProfile(["ECN Number", "Status"]),
  });
  assert.equal(adapter.selectCell(document.getElementById("canvas-prior")), true);
  document.elementsFromPoint = () => [
    document.getElementById("canvas-overlay"),
    document.getElementById("sheet-canvas"),
  ];

  adapter.onSelectionEvent({
    type: "pointerdown",
    target: document.getElementById("canvas-overlay"),
    clientX: 20,
    clientY: 20,
    composedPath: () => [document.getElementById("canvas-overlay")],
  });
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.fields.length, 0);
  assert.deepEqual(snapshot.captureMeta.reasons, ["unsupported_canvas_grid"]);
  assert.equal(JSON.stringify(snapshot).includes("ECN-PRIOR"), false);
});

test("empty DOM capture reports no active row instead of a successful empty snapshot", () => {
  const dom = new JSDOM("<!doctype html><h1>ENGINEERING CHANGE FORM</h1>", {
    url: "https://app.smartsheet.com/sheets/empty",
  });
  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(dom.window.document, {
    window: dom.window,
    profile: confirmedProfile(),
  });
  const snapshot = adapter.captureVisibleRow();
  assert.equal(snapshot.captureState, "ambiguous");
  assert.equal(snapshot.fields.length, 0);
  assert.deepEqual(snapshot.captureMeta.reasons, ["no_active_row"]);
  assert.equal(adapter.diagnostics().selectedRowAvailable, false);
});

test("verified 67-column pasted row keeps similarly named comments columns distinct", async () => {
  const values = Array(DWK_57172_HEADERS.length).fill("");
  values[0] = "ECN-6701";
  values[1] = "Initial Review";
  values[2] = "Current workflow update";
  values[3] = "Change";
  values[60] = "Legacy project comment";
  const profile = {
    version: "dwkid-57172-rev-k",
    headerOrder: [...DWK_57172_HEADERS],
    expectedHeaders: [...DWK_57172_HEADERS],
    bindings: { ...DWK_57172_BINDINGS },
    primaryKeys: ["ecnNumber"],
    confirmed: true,
    mappingState: "ready",
  };
  const snapshot = await new PasteRowSheetContextAdapter({
    profile,
    input: values.join("\t"),
    pageUrl: "https://app.smartsheet.com/sheets/dwk57172",
  }).capture();

  assert.equal(snapshot.captureState, "complete");
  assert.equal(snapshot.fields.length, 67);
  assert.equal(snapshot.fields[2].header, "Comment/Updates");
  assert.equal(snapshot.fields[2].value, "Current workflow update");
  assert.equal(snapshot.fields[60].header, "Comments / Updates");
  assert.equal(snapshot.fields[60].value, "Legacy project comment");
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
