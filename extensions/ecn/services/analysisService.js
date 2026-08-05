import { analyzeEcnSnapshot } from "./ruleEngine.js";
import { analyzeEcnWithAi } from "./aiService.js";
import {
  assessSnapshotAgainstProfile,
  resolveCanonicalFields,
} from "./profileService.js";
import DEFAULT_ECN_RULESET from "../rules/defaultRuleset.js";

const AI_CONFIRMATION_THRESHOLD = 0.75;

function unique(values) {
  return [...new Set((values || []).map(String).filter(Boolean))];
}

function unavailableDrafts(reason = "model_unavailable") {
  return {
    status: "unavailable",
    reason,
    missingInformation: null,
    approvalComment: null,
    implementationHandoff: null,
    reviewerRequest: null,
    closureSummary: null,
  };
}

function availableDrafts(drafts = {}) {
  return {
    status: "available",
    reason: null,
    missingInformation: drafts.missingInformation ?? null,
    approvalComment: drafts.approvalComment ?? null,
    implementationHandoff: drafts.implementationHandoff ?? null,
    reviewerRequest: drafts.reviewerRequest ?? null,
    closureSummary: drafts.closureSummary ?? null,
  };
}

function captureNextAction(captureAssessment, language) {
  const ru = language === "ru";
  if (captureAssessment.profileState === "needs_remap") {
    return {
      id: "confirm_sheet_profile",
      type: "confirm_sheet_profile",
      code: "remap_sheet_profile",
      stage: "MDC Validation",
      severity: "blocker",
      label: ru
        ? "Подтвердите сопоставление колонок и fingerprint листа перед окончательной оценкой."
        : "Confirm the column mapping and sheet fingerprint before a final readiness assessment.",
    };
  }
  if (!captureAssessment.readinessAllowed) {
    return {
      id: "complete_row_capture",
      type: "complete_row_capture",
      code: "complete_row_capture",
      stage: "MDC Validation",
      severity: "blocker",
      label: ru
        ? "Завершите захват выбранной строки либо вставьте полную TSV-строку."
        : "Complete the selected-row capture or paste the complete TSV row.",
    };
  }
  return null;
}

function enforceCaptureConstraint(result, captureAssessment, language) {
  const constrained = !captureAssessment.readinessAllowed;
  const classification = {
    selectedTypes: unique(result.classification?.selectedTypes),
    alternatives: unique(result.classification?.alternatives),
    confidence: Number.isFinite(Number(result.classification?.confidence))
      ? Math.max(0, Math.min(1, Number(result.classification.confidence)))
      : 0,
    requiresConfirmation:
      constrained || result.classification?.requiresConfirmation !== false,
  };
  return {
    ...result,
    capture: {
      state: captureAssessment.state,
      missingColumns: captureAssessment.missingColumns,
      profileState: captureAssessment.profileState,
      fingerprintMatched: captureAssessment.fingerprintMatched,
      readinessAllowed: captureAssessment.readinessAllowed,
    },
    classification,
    drafts: constrained && result.drafts?.status === "available"
      ? {
          ...result.drafts,
          approvalComment: null,
          implementationHandoff: null,
          reviewerRequest: null,
          closureSummary: null,
          restrictedByCapture: true,
        }
      : result.drafts,
    nextAction: captureNextAction(captureAssessment, language) || result.nextAction || {},
  };
}

/**
 * Runs deterministic checks first. AI can suggest a type and produce drafts,
 * but every route/task/gate is recomputed by the deterministic engine.
 */
export async function runEcnAnalysis({
  snapshot,
  selectedTypes = [],
  language = "en",
  profile,
  ruleset = DEFAULT_ECN_RULESET,
  aiAnalyzer = analyzeEcnWithAi,
} = {}) {
  const captureAssessment = assessSnapshotAgainstProfile(snapshot, profile);
  const canonicalFields = resolveCanonicalFields(snapshot, profile);

  let deterministic = analyzeEcnSnapshot({
    snapshot,
    canonicalFields,
    selectedTypes,
    captureAssessment,
    profile,
    language,
    ruleset,
  });

  let ai = {
    status: "unavailable",
    reason: captureAssessment.profileState === "ready" ? "capture_ambiguous" : "profile_needs_remap",
    model: null,
  };
  if (
    captureAssessment.profileState === "ready" &&
    captureAssessment.state !== "ambiguous" &&
    typeof aiAnalyzer === "function"
  ) {
    ai = await aiAnalyzer({
      canonicalFields,
      deterministicResult: deterministic,
      changeTypes: ruleset.changeTypes || [],
      language,
    });
  }

  const manuallySelected = selectedTypes.length > 0;
  if (!manuallySelected && ai.status === "available" && ai.classification?.selectedTypes?.length) {
    // The model only proposes IDs from the allowlist; deterministic logic owns
    // all consequences of those IDs.
    deterministic = analyzeEcnSnapshot({
      snapshot,
      canonicalFields,
      selectedTypes: ai.classification.selectedTypes,
      captureAssessment,
      profile,
      language,
      ruleset,
    });
  }

  let classification = deterministic.classification || {};
  if (ai.status === "available") {
    const selected = manuallySelected
      ? unique(classification.selectedTypes)
      : unique(ai.classification?.selectedTypes?.length
          ? ai.classification.selectedTypes
          : classification.selectedTypes);
    const alternatives = unique([
      ...(classification.alternatives || []),
      ...(ai.classification?.alternatives || []),
    ]).filter((id) => !selected.includes(id));
    const aiConfidence = Number(ai.classification?.confidence || 0);
    classification = {
      selectedTypes: selected,
      alternatives,
      confidence: manuallySelected
        ? Number(classification.confidence ?? 1)
        : aiConfidence,
      requiresConfirmation: manuallySelected
        ? classification.requiresConfirmation === true
        : selected.length === 0 ||
          ai.classification?.requiresConfirmation !== false ||
          aiConfidence < AI_CONFIRMATION_THRESHOLD,
    };
  }

  const merged = {
    ...deterministic,
    ruleSetVersion: ruleset.version || deterministic.ruleSetVersion,
    classification,
    drafts: ai.status === "available"
      ? availableDrafts(ai.drafts)
      : unavailableDrafts(ai.reason || "model_unavailable"),
    model: ai.model || null,
  };

  return enforceCaptureConstraint(merged, captureAssessment, language);
}

export function toEcnAnalysisResponse(analysisId, value = {}) {
  // Keep the public surface limited to the documented EcnAnalysisResponse.
  return {
    analysisId: String(analysisId),
    ruleSetVersion: String(value.ruleSetVersion || ""),
    capture: value.capture || { state: "ambiguous", missingColumns: [] },
    classification: value.classification || {
      selectedTypes: [],
      alternatives: [],
      confidence: 0,
      requiresConfirmation: true,
    },
    gates: Array.isArray(value.gates) ? value.gates : [],
    routing: value.routing && typeof value.routing === "object"
      ? value.routing
      : { preApprovers: [], reviewers: [], recipients: [] },
    tasks: Array.isArray(value.tasks) ? value.tasks : [],
    nextAction: value.nextAction && typeof value.nextAction === "object" ? value.nextAction : {},
    drafts: value.drafts && typeof value.drafts === "object"
      ? value.drafts
      : unavailableDrafts(),
    citations: Array.isArray(value.citations) ? value.citations : [],
  };
}
