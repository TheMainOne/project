import express from "express";
import ComplianceAuditLog from "../extensions/sf-compliance/models/ComplianceAuditLog.js";
import { requireExtensionAuth, requireExtensionScope } from "../middlewares/auth.js";
import {
  validateCaseContextBody,
  validateAnalyzeBody,
} from "../validators/complianceExtension.js";
import { analyzeComplianceCase } from "../extensions/services/complianceCaseAnalyzer.js";

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

try {
  console.log("[ANALYZE ROUTE] Starting LLM analysis for case:", caseId);

  analysis = await analyzeComplianceCase(payload);

  console.log("[ANALYZE ROUTE] LLM analysis success:", analysis);
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
  analysis,
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

export default complianceExtRouter;