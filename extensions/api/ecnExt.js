import express from "express";
import { randomUUID } from "crypto";
import {
  requireExtensionAuth,
  requireExtensionScope,
} from "../../middlewares/auth.js";
import DEFAULT_ECN_RULESET from "../ecn/rules/defaultRuleset.js";
import {
  getSheetProfileForUser,
  saveSheetProfileForUser,
  EcnProfileError,
} from "../ecn/services/profileService.js";
import {
  validateAnalyzeRequest,
  validateProfileRequest,
} from "../ecn/services/validation.js";
import {
  runEcnAnalysis,
  toEcnAnalysisResponse,
} from "../ecn/services/analysisService.js";
import {
  createAuditSummary,
  hashEcnRow,
  writeEcnAudit,
} from "../ecn/services/auditService.js";
import { loadActiveEcnRuleset } from "../ecn/services/rulesetService.js";

function validationError(res, details) {
  return res.status(400).json({
    error: "ValidationError",
    details: Array.isArray(details) ? details : [String(details)],
  });
}

function safeCapabilities() {
  return {
    captureModes: ["dom", "paste"],
    rowRead: true,
    analyze: true,
    profileMapping: true,
    aiDrafts: Boolean(process.env.OPENAI_API_KEY),
    smartsheetWrite: false,
    sapWrite: false,
    notificationSend: false,
    attachmentRead: false,
    commentRead: false,
  };
}

export function requireActiveEcnUser(req, res, next) {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles.map(String) : [];
  if (req.user?.isActive === false || !roles.includes("ecn_user")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return next();
}

export function createEcnExtRouter({
  authMiddleware = requireExtensionAuth,
  readScopeMiddleware = requireExtensionScope("ecn:read"),
  analyzeScopeMiddleware = requireExtensionScope("ecn:analyze"),
  roleMiddleware = requireActiveEcnUser,
  getProfile = getSheetProfileForUser,
  saveProfile = saveSheetProfileForUser,
  analyze = runEcnAnalysis,
  audit = writeEcnAudit,
  rowHasher = hashEcnRow,
  idFactory = randomUUID,
  ruleset = null,
  rulesetProvider = loadActiveEcnRuleset,
} = {}) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    next();
  });
  const resolveRuleset = async () => {
    if (ruleset) return { ruleset, state: "injected", version: ruleset.version };
    try {
      const resolved = await rulesetProvider();
      if (resolved?.ruleset) return resolved;
      const direct = resolved?.kind === "ecn-ruleset" ? resolved : DEFAULT_ECN_RULESET;
      return { ruleset: direct, state: "baseline_no_active", version: direct.version };
    } catch {
      return {
        ruleset: DEFAULT_ECN_RULESET,
        state: "baseline_invalid_active",
        version: DEFAULT_ECN_RULESET.version,
      };
    }
  };

  router.get(
    "/bootstrap",
    authMiddleware,
    roleMiddleware,
    readScopeMiddleware,
    async (req, res, next) => {
      try {
        const active = await resolveRuleset();
        const currentRuleset = active.ruleset;
        const profile = await getProfile(req.user.id);
        await audit({
          user: req.user.id,
          action: "bootstrap.read",
          profileVersion: profile.version,
          ruleSetVersion: currentRuleset.version,
          outcome: "success",
          resultSummary: {
            profileState: profile.mappingState,
            confirmed: profile.confirmed === true,
          },
        });
        return res.json({
          profile,
          ruleSetVersion: currentRuleset.version,
          ruleSetState: active.state,
          language: profile.locale || req.user.locale || "en",
          capabilities: safeCapabilities(),
          changeTypes: (currentRuleset.changeTypes || []).map(({ id, label, aliases = [] }) => ({
            id,
            label,
            aliases,
          })),
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  router.put(
    "/sheet-profile",
    authMiddleware,
    roleMiddleware,
    analyzeScopeMiddleware,
    async (req, res, next) => {
      const active = await resolveRuleset();
      const currentRuleset = active.ruleset;
      const checked = validateProfileRequest(req.body);
      if (!checked.ok) {
        await audit({
          user: req.user.id,
          action: "sheet-profile.update",
          ruleSetVersion: currentRuleset.version,
          outcome: "validation_error",
          resultSummary: { errorCount: checked.errors.length },
        });
        return validationError(res, checked.errors);
      }

      try {
        const profile = await saveProfile(req.user.id, checked.value.profile, {
          confirmed: checked.value.confirmed,
        });
        await audit({
          user: req.user.id,
          action: "sheet-profile.update",
          profileVersion: profile.version,
          ruleSetVersion: currentRuleset.version,
          outcome: "success",
          resultSummary: {
            profileState: profile.mappingState,
            confirmed: profile.confirmed === true,
            headerCount: profile.headerOrder.length,
          },
        });
        return res.json({ profile });
      } catch (error) {
        if (error instanceof EcnProfileError) {
          await audit({
            user: req.user.id,
            action: "sheet-profile.update",
            profileVersion: checked.value.profile.version,
            ruleSetVersion: currentRuleset.version,
            outcome: "validation_error",
            resultSummary: { errorCount: 1 },
          });
          return validationError(res, [error.message, ...(error.details || [])]);
        }
        return next(error);
      }
    }
  );

  router.post(
    "/analyze",
    authMiddleware,
    roleMiddleware,
    analyzeScopeMiddleware,
    async (req, res, next) => {
      const active = await resolveRuleset();
      const currentRuleset = active.ruleset;
      const checked = validateAnalyzeRequest(req.body);
      if (!checked.ok) {
        await audit({
          user: req.user.id,
          action: "row.analyze",
          ruleSetVersion: currentRuleset.version,
          outcome: "validation_error",
          resultSummary: { errorCount: checked.errors.length },
        });
        return validationError(res, checked.errors);
      }

      const analysisId = idFactory();
      const rowHash = rowHasher(checked.value.snapshot);
      try {
        const profile = await getProfile(req.user.id);
        const internalResult = await analyze({
          ...checked.value,
          profile,
          ruleset: currentRuleset,
        });
        const response = toEcnAnalysisResponse(analysisId, internalResult);

        await audit({
          analysisId,
          user: req.user.id,
          action: "row.analyze",
          rowHash,
          profileVersion: profile.version,
          ruleSetVersion: response.ruleSetVersion,
          outcome: "success",
          resultSummary: createAuditSummary({
            ...response,
            model: undefined,
          }),
          model: internalResult.model || null,
        });
        return res.json(response);
      } catch (error) {
        await audit({
          analysisId,
          user: req.user.id,
          action: "row.analyze",
          rowHash,
          ruleSetVersion: currentRuleset.version,
          outcome: "error",
          resultSummary: { failure: "analysis_failed" },
        });
        // Never forward the original analysis error: provider/validation errors
        // can include request fragments. Return the shared generic 500 shape
        // without writing row data to application logs.
        return res.status(500).json({
          status: "fail",
          code: 500,
          message: "Internal server error",
          data: "Internal Server Error",
        });
      }
    }
  );

  return router;
}

const ecnExtRouter = createEcnExtRouter();

export default ecnExtRouter;
