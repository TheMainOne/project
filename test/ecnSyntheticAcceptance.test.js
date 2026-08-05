import assert from "node:assert/strict";
import test from "node:test";

import { analyzeEcnSnapshot } from "../extensions/ecn/services/ruleEngine.js";

const captureAssessment = Object.freeze({
  state: "complete",
  profileState: "ready",
  fingerprintMatched: true,
  readinessAllowed: true,
  missingColumns: [],
});

const baseFields = Object.freeze({
  requestedBy: "requestor@example.test",
  actionType: "Change",
  priority: "Standard",
  effectTiming: "After depletion of stock",
  itemNumber: "SYNTHETIC-100",
  itemDescription: "Synthetic acceptance item",
  detailedDescription: "Synthetic controlled change",
  reason: "Acceptance coverage",
  affectedAreas: "Manufacturing",
  supportingDocuments: "None",
  riskReview: "Complete",
  materialOrigin: "Purchased",
});

function analyze(overrides, selectedTypes) {
  return analyzeEcnSnapshot({
    snapshot: {
      captureState: "complete",
      rowHint: { ecnNumber: "ECN-SYNTHETIC" },
    },
    canonicalFields: { ...baseFields, ...overrides },
    selectedTypes,
    captureAssessment,
    profile: { statusAliases: {} },
  });
}

const scenarios = [
  {
    name: "New Purchased",
    fields: { actionType: "New", materialOrigin: "Purchased" },
    selectedTypes: ["new_catalog_packager"],
    expectedGates: ["checklist_new_purchased", "incoming_inspection"],
    expectedTasks: ["purchasing_record.1"],
  },
  {
    name: "New Manufactured",
    fields: { actionType: "New", materialOrigin: "Manufactured" },
    selectedTypes: ["new_custom_packager"],
    expectedGates: ["checklist_new_manufactured", "bom_uom_conversion", "routing_base_quantity"],
    expectedTasks: ["bom.1", "routing.1"],
  },
  {
    name: "Form/Fit/Function",
    fields: {},
    selectedTypes: ["form_fit_function_catalog"],
    expectedGates: ["incoming_inspection"],
    expectedTasks: [],
  },
  {
    name: "Packaging and Label",
    fields: { packagingChange: true, artworkChange: true },
    selectedTypes: ["packaging_catalog", "branding_artwork"],
    expectedGates: [],
    expectedTasks: ["packaging.1", "labels.1"],
  },
  {
    name: "Cost",
    fields: { costChange: true, pricingChange: true },
    selectedTypes: ["cost_catalog"],
    expectedGates: [],
    expectedTasks: ["pricing.1", "costing.1", "costing.2"],
  },
  {
    name: "QA Block",
    fields: { qaBlockAction: "Remove block" },
    selectedTypes: ["qa_block"],
    expectedGates: ["qa_authorization"],
    expectedTasks: ["qa_block.1"],
  },
  {
    name: "Inspection Text",
    fields: {},
    selectedTypes: ["incoming_inspection_flag_text"],
    expectedGates: [],
    expectedTasks: [],
  },
  {
    name: "Hard Deletion",
    fields: {
      hardDeletion: true,
      remainingInventory: 2,
      openOrders: 0,
      openForecast: 0,
      whereUsed: "None",
    },
    selectedTypes: ["discontinuation_reactivation"],
    expectedGates: ["hard_deletion_gates"],
    expectedTasks: ["hard_deletion.1"],
  },
  {
    name: "Customer Notification",
    fields: { customerNotificationRequired: true },
    selectedTypes: ["packaging_custom"],
    expectedGates: [],
    expectedTasks: ["customer_notification.1", "customer_notification.2"],
  },
  {
    name: "System Change",
    fields: { actionType: "System Change", materialOrigin: "" },
    selectedTypes: [],
    expectedGates: ["checklist_system_change"],
    expectedTasks: [],
    provisionalOnly: true,
  },
];

test("ten synthetic ECNs exercise the pilot acceptance paths", async (t) => {
  assert.equal(scenarios.length, 10);
  for (const scenario of scenarios) {
    await t.test(scenario.name, () => {
      const result = analyze(scenario.fields, scenario.selectedTypes);
      assert.deepEqual(result.classification.selectedTypes, scenario.selectedTypes);
      const gateIds = new Set(result.gates.map((gate) => gate.id));
      const taskIds = new Set(result.tasks.map((task) => task.id));
      for (const id of scenario.expectedGates) assert.ok(gateIds.has(id), `${id} gate`);
      for (const id of scenario.expectedTasks) assert.ok(taskIds.has(id), `${id} task`);
      if (scenario.provisionalOnly) {
        const systemTasks = result.tasks.filter((task) => task.id.startsWith("checklist."));
        assert.ok(systemTasks.length > 0);
        assert.ok(systemTasks.every((task) => task.severity !== "blocker"));
      }
    });
  }
});
