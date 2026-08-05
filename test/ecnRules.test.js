import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANGE_TYPE_IDS,
  analyzeEcnSnapshot,
} from "../extensions/ecn/services/ruleEngine.js";
import {
  CHANGE_TYPE_ROUTES,
  CHECKLIST_PROFILES,
  DEFAULT_ECN_RULESET,
  DEPARTMENTS,
} from "../extensions/ecn/rules/defaultRuleset.js";

const D = DEPARTMENTS;

const expectedRoutes = [
  ["form_fit_function_catalog", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.CUSTOMER_SERVICE], [D.ENGINEERING, D.SUPPLY_CHAIN, D.PRODUCTION, D.CUSTOMER_SERVICE], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.PRICING, D.CUSTOMER_SERVICE]],
  ["form_fit_function_custom", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.CUSTOMER_SERVICE], [D.ENGINEERING, D.SUPPLY_CHAIN, D.PRODUCTION, D.CUSTOMER_SERVICE], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PROJECT_MANAGEMENT, D.PRODUCTION, D.PRICING, D.CUSTOMER_SERVICE]],
  ["source_catalog", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.CUSTOMER_SERVICE], [D.ENGINEERING, D.SUPPLY_CHAIN, D.CUSTOMER_SERVICE], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.PRICING, D.CUSTOMER_SERVICE]],
  ["source_custom", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.CUSTOMER_SERVICE], [D.ENGINEERING, D.SUPPLY_CHAIN, D.CUSTOMER_SERVICE], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PROJECT_MANAGEMENT, D.PRODUCTION, D.PRICING, D.CUSTOMER_SERVICE]],
  ["secondary_process_catalog", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT], [D.SUPPLY_CHAIN], [D.ENGINEERING, D.PRODUCT_MANAGEMENT]],
  ["secondary_process_custom", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PROJECT_MANAGEMENT], [D.SUPPLY_CHAIN], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PROJECT_MANAGEMENT]],
  ["quality_improvement", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION], [], [D.QUALITY, D.PRODUCT_MANAGEMENT, D.PRODUCTION]],
  ["manufacturing_process_change", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION], [D.SUPPLY_CHAIN], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PRODUCTION]],
  ["new_custom_packager", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PROJECT_MANAGEMENT, D.PRODUCTION, D.PRICING], [D.ENGINEERING, D.SUPPLY_CHAIN, D.PRODUCTION], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PROJECT_MANAGEMENT, D.PRODUCTION, D.PRICING]],
  ["new_catalog_packager", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.PRICING, D.CUSTOMER_SERVICE], [D.ENGINEERING, D.SUPPLY_CHAIN, D.PRODUCTION, D.CUSTOMER_SERVICE], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.PRICING, D.CUSTOMER_SERVICE]],
  ["discontinuation_reactivation", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.CUSTOMER_SERVICE], [D.SUPPLY_CHAIN, D.CUSTOMER_SERVICE], [D.PRODUCT_MANAGEMENT, D.PROJECT_MANAGEMENT, D.PRODUCTION, D.PRICING, D.CUSTOMER_SERVICE]],
  ["branding_artwork", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION], [D.ENGINEERING, D.SUPPLY_CHAIN, D.PRODUCTION], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PRODUCTION]],
  ["packaging_catalog", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION], [D.ENGINEERING, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PRODUCTION]],
  ["packaging_custom", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION], [D.ENGINEERING, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PROJECT_MANAGEMENT, D.PRODUCTION]],
  ["cost_catalog", [D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.FINANCE, D.PRICING], [D.SUPPLY_CHAIN], [D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.FINANCE, D.PRICING]],
  ["cost_custom", [D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.FINANCE, D.PRICING], [D.SUPPLY_CHAIN], [D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.FINANCE, D.PRICING]],
  ["engineering_minor_document", [D.ENGINEERING, D.QUALITY, D.PRODUCT_MANAGEMENT, D.PRODUCTION], [D.ENGINEERING, D.PRODUCTION], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PRODUCTION]],
  ["routing_change", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION], [D.SUPPLY_CHAIN], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PRODUCTION]],
  ["custom_routing", [D.ENGINEERING, D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION], [D.SUPPLY_CHAIN], [D.ENGINEERING, D.PRODUCT_MANAGEMENT, D.PROJECT_MANAGEMENT, D.PRODUCTION]],
  ["catalog_routing_rate", [D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.FINANCE], [D.SUPPLY_CHAIN], [D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.FINANCE]],
  ["custom_routing_rate", [D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.FINANCE], [D.SUPPLY_CHAIN], [D.PRODUCT_MANAGEMENT, D.PRODUCTION, D.FINANCE]],
  ["qa_block", [D.SUPPLY_CHAIN, D.PRODUCTION], [D.SUPPLY_CHAIN], [D.PRODUCTION]],
  ["incoming_inspection_flag_text", [D.SUPPLY_CHAIN, D.PRODUCTION], [D.SUPPLY_CHAIN], [D.PRODUCTION]],
  ["po_text_quality", [D.QUALITY, D.SUPPLY_CHAIN], [D.SUPPLY_CHAIN], [D.QUALITY]],
  ["po_text_vendor_information", [D.QUALITY, D.SUPPLY_CHAIN, D.PRODUCT_MANAGEMENT], [D.SUPPLY_CHAIN], [D.QUALITY, D.PRODUCT_MANAGEMENT]],
];

function fullCapture() {
  return {
    state: "complete",
    profileState: "ready",
    fingerprintMatched: true,
    readinessAllowed: true,
    missingColumns: [],
  };
}

function snapshot(state = "complete") {
  return { captureState: state, rowHint: { ecnNumber: "ECN-TEST" } };
}

function baseFields(overrides = {}) {
  return {
    requestedBy: "requestor@example.test",
    actionType: "Change",
    priority: "Standard",
    effectTiming: "After depletion of stock",
    itemNumber: "100000",
    itemDescription: "Synthetic item",
    detailedDescription: "Synthetic controlled change",
    reason: "Synthetic test",
    affectedAreas: "Manufacturing",
    supportingDocuments: "None",
    riskReview: "Complete",
    materialOrigin: "Purchased",
    ...overrides,
  };
}

function analyze(fields, selectedTypes = []) {
  return analyzeEcnSnapshot({
    snapshot: snapshot(),
    canonicalFields: fields,
    selectedTypes,
    captureAssessment: fullCapture(),
    profile: { statusAliases: {} },
  });
}

test("the built-in matrix exposes every exact 25-type route", () => {
  assert.equal(CHANGE_TYPE_IDS.length, 25);
  assert.deepEqual(CHANGE_TYPE_IDS, expectedRoutes.map(([id]) => id));
  const actual = new Map(CHANGE_TYPE_ROUTES.map((route) => [route.id, route]));
  for (const [id, preApprovers, reviewers, recipients] of expectedRoutes) {
    assert.deepEqual(actual.get(id).preApprovers, preApprovers, `${id} pre-approvers`);
    assert.deepEqual(actual.get(id).reviewers, reviewers, `${id} reviewers`);
    assert.deepEqual(actual.get(id).recipients, recipients, `${id} recipients`);
    assert.match(actual.get(id).cellRange, /^Sheet1!A\d+:AJ\d+$/);
  }
});

test("all six checklist profiles retain source coordinates and requirements", () => {
  assert.deepEqual(Object.keys(CHECKLIST_PROFILES), [
    "new_purchased",
    "new_manufactured",
    "changed_purchased",
    "changed_manufactured",
    "obsolescence",
    "system_change",
  ]);
  for (const profile of Object.values(CHECKLIST_PROFILES)) {
    assert.ok(profile.requirements.length >= 5, profile.id);
    assert.match(profile.sourceCellRange, /^Sheet1!E\d+:E\d+$/);
    for (const requirement of profile.requirements) {
      assert.equal(typeof requirement.source, "string");
      assert.equal(typeof requirement.revision, "string");
      assert.equal(typeof requirement.section, "string");
      assert.ok(requirement.cellRange, `${profile.id}.${requirement.id} cell range`);
    }
  }
});

test("multiple change types union participants and preserve every reason", () => {
  const result = analyze(
    baseFields({ productManager: "Live Product Manager" }),
    ["form_fit_function_catalog", "cost_catalog"],
  );
  const supplyChain = result.routing.preApprovers.find(
    (participant) => participant.department === D.SUPPLY_CHAIN,
  );
  assert.deepEqual(
    supplyChain.reasons.map((reason) => reason.typeId),
    ["form_fit_function_catalog", "cost_catalog"],
  );
  assert.equal(
    result.routing.preApprovers.filter((participant) => participant.department === D.SUPPLY_CHAIN).length,
    1,
  );
  const pm = result.routing.preApprovers.find(
    (participant) => participant.department === D.PRODUCT_MANAGEMENT,
  );
  assert.equal(pm.assignees[0].source, "live_classification");
});

test("a private editable roster supplies fallback assignees without hard-coded names", () => {
  const ruleset = {
    ...DEFAULT_ECN_RULESET,
    participantRoster: { [D.SUPPLY_CHAIN]: ["Configured approver", "Configured delegate"] },
  };
  const result = analyzeEcnSnapshot({
    snapshot: snapshot(),
    canonicalFields: baseFields(),
    selectedTypes: ["cost_catalog"],
    captureAssessment: fullCapture(),
    profile: { statusAliases: {} },
    ruleset,
  });
  const supplyChain = result.routing.preApprovers.find(
    (participant) => participant.department === D.SUPPLY_CHAIN,
  );
  assert.deepEqual(supplyChain.assignees, [
    { name: "Configured approver", source: "fallback_roster" },
    { name: "Configured delegate", source: "fallback_roster" },
  ]);
  assert.deepEqual(DEFAULT_ECN_RULESET.participantRoster, {});
});

test("provisional System Change requirements never become blockers", () => {
  const result = analyze(baseFields({ actionType: "System", materialOrigin: "" }), []);
  const systemTasks = result.tasks.filter((task) => task.id.startsWith("checklist."));
  assert.ok(systemTasks.length >= 2);
  assert.ok(systemTasks.every((task) => task.status === "needs_confirmation"));
  assert.ok(systemTasks.every((task) => task.severity !== "blocker"));
  assert.equal(
    result.gates.find((gate) => gate.id === "checklist_system_change").status,
    "warning",
  );
});

test("accepted importer conflicts remain visible as Needs confirmation, never blockers", () => {
  const conflict = {
    id: "terminology.example",
    source: "Private imported source",
    revision: "review-copy",
    section: "Terminology check",
    cellRange: "Sheet1!E10",
    condition: "Two source values disagree",
    severity: "warning",
    expectedValue: "one confirmed value",
    nextAction: "Confirm with the controlled-source owner.",
    evidenceLevel: "conflict",
  };
  const ruleset = {
    ...DEFAULT_ECN_RULESET,
    import: { findings: [conflict] },
  };
  const result = analyzeEcnSnapshot({
    snapshot: snapshot(),
    canonicalFields: baseFields(),
    selectedTypes: ["cost_catalog"],
    captureAssessment: fullCapture(),
    profile: { statusAliases: {} },
    ruleset,
  });
  const task = result.tasks.find((item) => item.id === "ruleset.conflict.terminology.example");
  assert.equal(task.status, "needs_confirmation");
  assert.equal(task.severity, "warning");
  assert.equal(result.gates.find((gate) => gate.id === "ruleset_import_conflicts").status, "warning");
  assert.ok(result.citations.some((citation) => citation.evidenceLevel === "conflict"));
});

test("New and Form/Fit/Function require incoming inspection and Inspection Text", () => {
  const result = analyze(
    baseFields({ actionType: "New", materialOrigin: "Purchased" }),
    ["form_fit_function_catalog"],
  );
  const gate = result.gates.find((item) => item.id === "incoming_inspection");
  assert.equal(gate.status, "block");
  assert.deepEqual(gate.missingFields, ["incomingInspection", "inspectionText"]);
});

test("customer approval cannot be combined with Immediately", () => {
  const result = analyze(
    baseFields({
      customerApprovalRequired: true,
      customerApprovalEvidence: "Approved",
      effectTiming: "Immediately",
    }),
    ["packaging_catalog"],
  );
  const gate = result.gates.find((item) => item.id === "customer_approval_timing");
  assert.equal(gate.status, "block");
  assert.deepEqual(gate.missingFields, ["effectTiming"]);
});

test("Tier-1 vial changes require the Quality Equivalency Memo", () => {
  const result = analyze(
    baseFields({ tier1VialSourceChange: true }),
    ["source_catalog"],
  );
  const gate = result.gates.find((item) => item.id === "tier1_vial_memo");
  assert.equal(gate.status, "block");
  assert.deepEqual(gate.missingFields, ["tier1VialMemo"]);
});

test("a controlled drawing or an explicit drawing disposition satisfies the drawing gate", () => {
  const result = analyze(
    baseFields({ drawingRequired: true, drawingDisposition: "No drawing required; documented rationale" }),
    ["engineering_minor_document"],
  );
  assert.equal(
    result.gates.find((item) => item.id === "conditional_drawing").status,
    "pass",
  );
});

test("conditional validation, BOM UOM, and routing base quantity stay deterministic", () => {
  const result = analyze(
    baseFields({
      validationRequired: true,
      bomChange: true,
      bom: "Controlled BOM",
      componentUomDiffers: true,
      routingChange: true,
    }),
    ["routing_change"],
  );
  assert.deepEqual(
    result.gates.find((item) => item.id === "conditional_validation").missingFields,
    ["validationEvidence"],
  );
  assert.deepEqual(
    result.gates.find((item) => item.id === "bom_uom_conversion").missingFields,
    ["uomConversion"],
  );
  assert.deepEqual(
    result.gates.find((item) => item.id === "routing_base_quantity").missingFields,
    ["routingBaseQuantity"],
  );
});

test("QA unblock requires QA authorization", () => {
  const result = analyze(
    baseFields({ qaBlockAction: "Remove block" }),
    ["qa_block"],
  );
  assert.equal(
    result.gates.find((item) => item.id === "qa_authorization").status,
    "block",
  );
});

test("hard deletion remains blocked while inventory or demand exists", () => {
  const result = analyze(
    baseFields({
      hardDeletion: true,
      remainingInventory: 12,
      openOrders: 0,
      openForecast: 0,
      whereUsed: "None",
    }),
    ["discontinuation_reactivation"],
  );
  const gate = result.gates.find((item) => item.id === "hard_deletion_gates");
  assert.equal(gate.status, "block");
  assert.deepEqual(gate.missingFields, ["remainingInventory"]);
});

test("Closed requires reviewer and notification completion", () => {
  const result = analyze(
    baseFields({
      status: "Closed",
      reviewerCompletion: true,
      notificationCompletion: false,
    }),
    ["cost_catalog"],
  );
  const gate = result.gates.find((item) => item.id === "closure_completion");
  assert.equal(gate.status, "block");
  assert.deepEqual(gate.missingFields, ["notificationCompletion"]);
});

test("Rework returns to Pre-Approval after blockers are resolved", () => {
  const ruleset = {
    ...DEFAULT_ECN_RULESET,
    playbooks: DEFAULT_ECN_RULESET.playbooks.map((playbook) => ({
      ...playbook,
      evidenceLevel: "controlled",
    })),
  };
  const result = analyzeEcnSnapshot({
    snapshot: snapshot(),
    canonicalFields: baseFields({
      status: "Rework",
      whereUsed: "Complete",
      catalogCustom: "Catalog",
      effectiveDate: "2026-09-01",
      remainingInventory: "None",
    }),
    selectedTypes: ["cost_catalog"],
    captureAssessment: fullCapture(),
    profile: { statusAliases: {} },
    ruleset,
  });
  assert.equal(result.nextAction.code, "advance_lifecycle");
  assert.equal(result.nextAction.stage, "Pre-Approval");
});

test("partial captures yield unknowns and can never be declared ready", () => {
  const result = analyzeEcnSnapshot({
    snapshot: snapshot("partial"),
    canonicalFields: {},
    selectedTypes: ["cost_catalog"],
    captureAssessment: {
      state: "partial",
      profileState: "ready",
      readinessAllowed: false,
      missingColumns: ["Reason"],
    },
    profile: { statusAliases: {} },
  });
  assert.equal(result.gates[0].status, "unknown");
  assert.equal(result.nextAction.code, "complete_row_capture");
  assert.ok(result.tasks.every((task) => task.severity !== "blocker"));
});
