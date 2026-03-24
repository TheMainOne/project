import express from "express";
import ComplianceAuditLog from "../sf-compliance/models/ComplianceAuditLog.js";
import { requireExtensionAuth, requireExtensionScope } from "../../middlewares/auth.js";
import {
  validateCaseContextBody,
  validateAnalyzeBody,
} from "../../validators/complianceExtension.js";
import { analyzeComplianceCase } from "../services/complianceCaseAnalyzer.js";
import { bulkLookupMaterialComponentSuppliers } from "../../services/compliance/itemLookupService.js";
import { extractRequestedRegulationsFromCase } from "../sf-compliance/services/requestedRegulations.js";
import { getCoverageForLookupResults } from "../services/complianceCoverage.js";

const complianceExtRouter = express.Router();

async function writeAudit({ userId, action, caseId = null, outcome = "success" }) {
  await ComplianceAuditLog.create({
    user: userId,
    action,
    caseId,
    timestamp: new Date(),
    outcome,
  });
}

complianceExtRouter.get("/session", requireExtensionAuth, async (req, res) => {
  await writeAudit({ userId: req.user.id, action: "session.read", outcome: "success" });

  return res.json({
    ok: true,
    user: { id: req.user.id, email: req.user.email },
    scope: req.user.scopes || [],
    tokenType: req.user.tokenType,
  });
});

complianceExtRouter.post(
  "/case-context",
  requireExtensionAuth,
  requireExtensionScope("compliance:read"),
  async (req, res) => {
    const validation = validateCaseContextBody(req.body);

    if (!validation.ok) {
      await writeAudit({
        userId: req.user.id,
        action: "case-context.read",
        caseId: null,
        outcome: "error",
      });

      return res.status(400).json({ error: validation.error });
    }

    const { caseId, context } = validation.value;

    await writeAudit({
      userId: req.user.id,
      action: "case-context.read",
      caseId,
      outcome: "success",
    });

    return res.json({
      ok: true,
      caseId,
      received: {
        hasContext: !!context,
        hasSubject: !!context?.subject,
        hasDescription: !!context?.description,
      },
    });
  }
);

complianceExtRouter.post(
  "/analyze",
  requireExtensionAuth,
  requireExtensionScope("compliance:analyze"),
  async (req, res) => {
    const validation = validateAnalyzeBody(req.body);

    if (!validation.ok) {
      await writeAudit({
        userId: req.user.id,
        action: "case.analyze",
        caseId: null,
        outcome: "error",
      });

      return res.status(400).json({ error: validation.error });
    }

    const { caseId, payload } = validation.value;

let analysis = null;
let requestedRegulationsResult = {
  requestedRegulations: [],
  matchedBy: [],
  sourceTextLength: 0,
};

try {
  console.log("[ANALYZE ROUTE] Starting LLM analysis for case:", caseId);

  analysis = await analyzeComplianceCase(payload);

  requestedRegulationsResult = extractRequestedRegulationsFromCase(payload);

  console.log("[ANALYZE ROUTE] LLM analysis success:", analysis);
  console.log(
    "[ANALYZE ROUTE] Requested regulations detected:",
    requestedRegulationsResult
  );
} catch (error) {
  console.error("[ANALYZE ROUTE] LLM analysis failed:", error);

  await writeAudit({
    userId: req.user.id,
    action: "case.analyze",
    caseId,
    outcome: "error",
  });

  return res.status(500).json({
    ok: false,
    error: "LLM analysis failed",
    details: error?.message || String(error),
  });
}

const result = {
  riskLevel: "medium",
  summary: "Compliance analysis completed",
  analysis: {
    ...analysis,
    requested_regulations: requestedRegulationsResult.requestedRegulations,
    requested_regulations_meta: requestedRegulationsResult.matchedBy,
  },
};

    await writeAudit({
      userId: req.user.id,
      action: "case.analyze",
      caseId,
      outcome: "success",
    });

    return res.json({ ok: true, caseId, result });
  }
);

complianceExtRouter.post(
  "/material-suppliers",
  requireExtensionAuth,
  requireExtensionScope("compliance:read"),
  async (req, res) => {
const caseId = String(req.body?.caseId || "").trim() || null;
const queries = Array.isArray(req.body?.queries) ? req.body.queries : [];
const requestedRegulations = Array.isArray(req.body?.requestedRegulations)
  ? req.body.requestedRegulations
  : [];

    const cleanQueries = Array.from(
      new Set(
        queries
          .map((q) => String(q || "").trim())
          .filter(Boolean)
      )
    );

    if (cleanQueries.length === 0) {
      await writeAudit({
        userId: req.user.id,
        action: "material-suppliers.read",
        caseId,
        outcome: "error",
      });

      return res.status(400).json({
        error: "Field 'queries' must be a non-empty array",
      });
    }

   try {
  const results = await bulkLookupMaterialComponentSuppliers(cleanQueries);

  let coverage = null;
  let enrichedResults = results;

  if (requestedRegulations.length > 0) {
    coverage = await getCoverageForLookupResults({
      lookupResults: results,
      requestedRegulationCodes: requestedRegulations,
    });

    const coverageByMaterial = new Map(
      (coverage.byMaterial || []).map((entry) => [entry.material, entry])
    );

    enrichedResults = results.map((result) => ({
      ...result,
      coverage: result?.material
        ? coverageByMaterial.get(String(result.material).trim().toUpperCase()) || null
        : null,
    }));
  }

  await writeAudit({
    userId: req.user.id,
    action: "material-suppliers.read",
    caseId,
    outcome: "success",
  });

  return res.json({
    ok: true,
    total: enrichedResults.length,
    requestedRegulations,
    coverageSummary: coverage?.summary || null,
    results: enrichedResults,
  });
} catch (error) {
      console.error("[MATERIAL SUPPLIERS ROUTE] lookup failed:", error);

      await writeAudit({
        userId: req.user.id,
        action: "material-suppliers.read",
        caseId,
        outcome: "error",
      });

      return res.status(500).json({
        ok: false,
        error: "Material suppliers lookup failed",
        details: error?.message || String(error),
      });
    }
  }
);

export default complianceExtRouter;