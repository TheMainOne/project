import express from "express";
import { requireAuth, requireScopes } from "../middlewares/auth.js";
import ComplianceAuditLog from "../extensions/sf-compliance/models/ComplianceAuditLog.js";

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

complianceExtRouter.get("/session", requireAuth, requireScopes(["compliance:read"]), async (req, res) => {
  await writeAudit({ userId: req.user.id, action: "session.read", outcome: "success" });
  return res.json({
    ok: true,
    user: { id: req.user.id, email: req.user.email },
    scope: req.user.scopes || [],
    tokenType: req.user.tokenType,
  });
});

complianceExtRouter.post("/case-context", requireAuth, requireScopes(["compliance:read"]), async (req, res) => {
  const caseId = String(req.body?.caseId || "").trim();
  if (!caseId) {
    await writeAudit({ userId: req.user.id, action: "case-context.read", caseId: null, outcome: "error" });
    return res.status(400).json({ error: "caseId is required" });
  }

  await writeAudit({ userId: req.user.id, action: "case-context.read", caseId, outcome: "success" });
  return res.json({ ok: true, caseId, context: req.body?.context || null });
});

complianceExtRouter.post("/analyze", requireAuth, requireScopes(["compliance:analyze"]), async (req, res) => {
  const caseId = String(req.body?.caseId || "").trim();
  if (!caseId) {
    await writeAudit({ userId: req.user.id, action: "case.analyze", caseId: null, outcome: "error" });
    return res.status(400).json({ error: "caseId is required" });
  }

  const result = {
    riskLevel: "medium",
    summary: "Compliance analysis completed",
    details: req.body?.payload || null,
  };

  await writeAudit({ userId: req.user.id, action: "case.analyze", caseId, outcome: "success" });
  return res.json({ ok: true, caseId, result });
});

export default complianceExtRouter;
