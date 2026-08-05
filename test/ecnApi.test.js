import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createEcnExtRouter } from "../extensions/api/ecnExt.js";
import { runEcnAnalysis } from "../extensions/ecn/services/analysisService.js";
import {
  createHeaderFingerprint,
  makeColumnBinding,
  resetEcnProfileMemoryForTests,
} from "../extensions/ecn/services/profileService.js";
import {
  getEcnMemoryAuditsForTests,
  resetEcnAuditMemoryForTests,
} from "../extensions/ecn/services/auditService.js";

function testAuth(req, _res, next) {
  req.user = {
    id: "api-test-user",
    email: "mdc@example.test",
    roles: req.headers["x-test-role"] === "ecn_user" ? ["ecn_user"] : ["user"],
    isActive: req.headers["x-test-active"] !== "false",
    scopes: String(req.headers["x-test-scope"] || "").split(/\s+/).filter(Boolean),
    locale: "en",
  };
  next();
}

async function withApi(router, callback) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/ecn/ext", router);
  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: "Internal server error", name: error?.name || "Error" });
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}/api/ecn/ext`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function profileBody() {
  const headers = ["ECN Number", "Description"];
  return {
    profile: {
      version: "anonymized-profile-1",
      headerFingerprint: createHeaderFingerprint(headers),
      expectedHeaders: headers,
      headerOrder: headers,
      bindings: {
        ecnNumber: makeColumnBinding("ECN Number", 1),
        itemDescription: makeColumnBinding("Description", 2),
      },
      aliases: {},
      primaryKeys: ["ecnNumber"],
      statusAliases: { Submitted: "Submitted" },
      locale: "en",
    },
    confirmed: true,
  };
}

function analyzeBody(overrides = {}) {
  return {
    snapshot: {
      pageUrl: "https://app.smartsheet.com/sheets/anonymized",
      sheetTitle: "Anonymized ECN",
      rowHint: { rowIndex: 7, ecnNumber: "VERY-PRIVATE-ECN" },
      captureMode: "dom",
      captureState: "complete",
      observedHeaders: ["ECN Number", "Description"],
      fields: [
        { header: "ECN Number", ordinal: 1, value: "VERY-PRIVATE-ECN" },
        { header: "Description", ordinal: 2, value: "VERY PRIVATE CELL VALUE" },
      ],
      capturedAt: "2026-08-05T12:00:00.000Z",
    },
    selectedTypes: ["qa_block"],
    language: "en",
    ...overrides,
  };
}

test("ECN endpoints enforce role/scopes and return the documented analysis surface", async () => {
  resetEcnProfileMemoryForTests();
  resetEcnAuditMemoryForTests();
  const noAiAnalyze = (input) => runEcnAnalysis({
    ...input,
    aiAnalyzer: async () => ({ status: "unavailable", reason: "test_disabled", model: null }),
  });
  const router = createEcnExtRouter({
    authMiddleware: testAuth,
    analyze: noAiAnalyze,
    idFactory: () => "analysis-fixed-id",
  });

  await withApi(router, async (baseUrl) => {
    const noRole = await fetch(`${baseUrl}/bootstrap`, {
      headers: { "x-test-scope": "ecn:read" },
    });
    assert.equal(noRole.status, 403);

    const noScope = await fetch(`${baseUrl}/bootstrap`, {
      headers: { "x-test-role": "ecn_user" },
    });
    assert.equal(noScope.status, 403);

    const inactive = await fetch(`${baseUrl}/bootstrap`, {
      headers: {
        "x-test-role": "ecn_user",
        "x-test-active": "false",
        "x-test-scope": "ecn:read",
      },
    });
    assert.equal(inactive.status, 403);

    const profileResponse = await fetch(`${baseUrl}/sheet-profile`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-role": "ecn_user",
        "x-test-scope": "ecn:analyze",
      },
      body: JSON.stringify(profileBody()),
    });
    assert.equal(profileResponse.status, 200);
    const saved = await profileResponse.json();
    assert.equal(saved.profile.mappingState, "ready");
    assert.equal(saved.profile.confirmed, true);

    const bootstrapResponse = await fetch(`${baseUrl}/bootstrap`, {
      headers: {
        "x-test-role": "ecn_user",
        "x-test-scope": "ecn:read",
      },
    });
    assert.equal(bootstrapResponse.status, 200);
    const bootstrap = await bootstrapResponse.json();
    assert.equal(bootstrap.profile.mappingState, "ready");
    assert.equal(bootstrap.changeTypes.length, 25);
    assert.match(bootstrap.ruleSetState, /^(?:active|baseline_no_active|baseline_invalid_active)$/);
    assert.equal(bootstrap.capabilities.smartsheetWrite, false);
    assert.equal(bootstrap.capabilities.sapWrite, false);
    assert.equal(bootstrap.capabilities.notificationSend, false);

    const invalidResponse = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-role": "ecn_user",
        "x-test-scope": "ecn:analyze",
      },
      body: JSON.stringify({ ...analyzeBody(), unexpected: "not allowed" }),
    });
    assert.equal(invalidResponse.status, 400);
    const invalid = await invalidResponse.json();
    assert.equal(invalid.error, "ValidationError");
    assert.ok(invalid.details.some((detail) => /unexpected is not allowed/.test(detail)));

    const analyzeResponse = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-role": "ecn_user",
        "x-test-scope": "ecn:analyze",
      },
      body: JSON.stringify(analyzeBody()),
    });
    assert.equal(analyzeResponse.status, 200);
    assert.equal(analyzeResponse.headers.get("cache-control"), "no-store");
    const analysis = await analyzeResponse.json();
    assert.deepEqual(Object.keys(analysis).sort(), [
      "analysisId",
      "capture",
      "citations",
      "classification",
      "drafts",
      "gates",
      "nextAction",
      "routing",
      "ruleSetVersion",
      "tasks",
    ].sort());
    assert.equal(analysis.analysisId, "analysis-fixed-id");
    assert.equal(analysis.capture.state, "complete");
    assert.equal(analysis.capture.profileState, "ready");
    assert.deepEqual(analysis.classification.selectedTypes, ["qa_block"]);
    assert.equal(analysis.drafts.status, "unavailable");
    assert.equal(Object.hasOwn(analysis, "model"), false);
    assert.equal(Object.hasOwn(analysis, "readiness"), false);
  });

  const audits = getEcnMemoryAuditsForTests();
  const analysisAudit = audits.find((entry) => entry.action === "row.analyze" && entry.outcome === "success");
  assert.match(analysisAudit.rowHash, /^[a-f\d]{64}$/);
  assert.equal(analysisAudit.model, null);
  const serializedAudits = JSON.stringify(audits);
  assert.equal(serializedAudits.includes("VERY-PRIVATE-ECN"), false);
  assert.equal(serializedAudits.includes("VERY PRIVATE CELL VALUE"), false);
});

test("needs_remap and partial captures can never produce final readiness", async () => {
  resetEcnProfileMemoryForTests();
  const noAiAnalyze = (input) => runEcnAnalysis({
    ...input,
    aiAnalyzer: async () => ({
      status: "available",
      model: "fake-model",
      classification: {
        selectedTypes: ["qa_block"],
        alternatives: [],
        confidence: 1,
        requiresConfirmation: false,
      },
      drafts: {
        missingInformation: null,
        approvalComment: "AI says ready, but capture constraints win.",
        implementationHandoff: null,
        reviewerRequest: null,
        closureSummary: null,
      },
    }),
  });
  const router = createEcnExtRouter({
    authMiddleware: testAuth,
    analyze: noAiAnalyze,
    idFactory: () => "analysis-constrained",
  });

  await withApi(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-role": "ecn_user",
        "x-test-scope": "ecn:analyze",
      },
      body: JSON.stringify(analyzeBody({
        snapshot: { ...analyzeBody().snapshot, captureState: "partial" },
      })),
    });
    assert.equal(response.status, 200);
    const analysis = await response.json();
    assert.equal(analysis.capture.profileState, "needs_remap");
    assert.equal(analysis.capture.readinessAllowed, false);
    assert.equal(analysis.classification.requiresConfirmation, true);
    assert.equal(analysis.nextAction.code, "remap_sheet_profile");
    assert.notEqual(analysis.nextAction.status, "ready");
  });
});

test("analysis failures return a generic error and keep raw row text out of audit", async () => {
  resetEcnAuditMemoryForTests();
  const ready = { ...profileBody().profile, confirmed: true, mappingState: "ready" };
  const router = createEcnExtRouter({
    authMiddleware: testAuth,
    getProfile: async () => ready,
    analyze: async () => {
      throw new Error("VERY PRIVATE CELL VALUE must never reach logs or response");
    },
    idFactory: () => "analysis-failed",
  });

  await withApi(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-role": "ecn_user",
        "x-test-scope": "ecn:analyze",
      },
      body: JSON.stringify(analyzeBody()),
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.message, "Internal server error");
    assert.equal(JSON.stringify(body).includes("VERY PRIVATE CELL VALUE"), false);
  });

  const serializedAudits = JSON.stringify(getEcnMemoryAuditsForTests());
  assert.equal(serializedAudits.includes("VERY PRIVATE CELL VALUE"), false);
  assert.equal(serializedAudits.includes("VERY-PRIVATE-ECN"), false);
});

test("partial capture suppresses readiness-sensitive AI drafts even with a confirmed profile", async () => {
  const profile = { ...profileBody().profile, confirmed: true, mappingState: "ready" };
  const result = await runEcnAnalysis({
    ...analyzeBody({
      snapshot: { ...analyzeBody().snapshot, captureState: "partial" },
    }),
    profile,
    aiAnalyzer: async () => ({
      status: "available",
      model: "fake-model",
      classification: {
        selectedTypes: ["qa_block"],
        alternatives: [],
        confidence: 1,
        requiresConfirmation: false,
      },
      drafts: {
        missingInformation: "Please complete the row capture.",
        approvalComment: "Incorrectly says ready for approval.",
        implementationHandoff: "Incorrectly hands off implementation.",
        reviewerRequest: "Incorrectly requests review.",
        closureSummary: "Incorrectly says closed.",
      },
    }),
  });
  assert.equal(result.capture.profileState, "ready");
  assert.equal(result.capture.readinessAllowed, false);
  assert.equal(result.classification.requiresConfirmation, true);
  assert.equal(result.nextAction.code, "complete_row_capture");
  assert.equal(result.drafts.missingInformation, "Please complete the row capture.");
  assert.equal(result.drafts.approvalComment, null);
  assert.equal(result.drafts.implementationHandoff, null);
  assert.equal(result.drafts.reviewerRequest, null);
  assert.equal(result.drafts.closureSummary, null);
  assert.equal(result.drafts.restrictedByCapture, true);
});
