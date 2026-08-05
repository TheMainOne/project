import {
  DEFAULT_ECN_RULESET,
  ECN_RULESET_VERSION,
} from "../rules/defaultRuleset.js";

export { DEFAULT_ECN_RULESET, ECN_RULESET_VERSION };

export const CHANGE_TYPE_IDS = Object.freeze(
  DEFAULT_ECN_RULESET.changeTypes.map((item) => item.id),
);

export const LIFECYCLE_STAGES = Object.freeze([
  "Submitted",
  "MDC Validation",
  "Needs Info",
  "Pre-Approval",
  "Rework",
  "Implementation",
  "MDC Verification",
  "Implementation Review",
  "Notifications",
  "Closed",
]);

const STAGE_ORDER = new Map(
  LIFECYCLE_STAGES.map((stage, index) => [stage.toLowerCase(), index]),
);

const CONTROLLED = "controlled";
const FALSE_WORDS = new Set([
  "",
  "0",
  "false",
  "n",
  "no",
  "none",
  "not required",
  "not applicable",
  "n/a",
  "na",
  "нет",
  "не требуется",
]);
const TRUE_WORDS = new Set([
  "1",
  "true",
  "y",
  "yes",
  "required",
  "complete",
  "completed",
  "done",
  "approved",
  "да",
  "готово",
  "завершено",
]);

const STOP_TOKENS = new Set([
  "a",
  "an",
  "and",
  "change",
  "changes",
  "for",
  "of",
  "or",
  "product",
  "the",
  "to",
]);

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9а-яё]+/giu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function splitValues(value) {
  if (Array.isArray(value)) return value.flatMap(splitValues);
  if (value === null || value === undefined) return [];
  if (typeof value === "object") return Object.values(value).flatMap(splitValues);
  return String(value)
    .split(/[\n;,|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isProvided(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(isProvided);
  if (typeof value === "object") return Object.values(value).some(isProvided);
  return Number.isFinite(value) || typeof value === "boolean";
}

function isTruthyFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const clean = normalize(value);
  if (FALSE_WORDS.has(clean)) return false;
  if (TRUE_WORDS.has(clean)) return true;
  return clean.length > 0;
}

function isClearedValue(value) {
  if (value === false || value === 0) return true;
  if (typeof value === "number") return value === 0;
  const clean = normalize(value);
  return [
    "0",
    "clear",
    "cleared",
    "none",
    "no",
    "no dependencies",
    "no open orders",
    "not applicable",
    "n a",
    "zero",
  ].includes(clean);
}

function fieldWasObserved(fields, field) {
  return Object.prototype.hasOwnProperty.call(fields, field);
}

function routeLookup(ruleset) {
  const lookup = new Map();
  for (const route of ruleset.changeTypes || []) {
    for (const value of [route.id, route.label, ...(route.aliases || [])]) {
      lookup.set(normalize(value), route.id);
    }
  }
  return lookup;
}

/** Resolve IDs, labels, and aliases without guessing unknown values. */
export function resolveChangeTypeIds(values, ruleset = DEFAULT_ECN_RULESET) {
  const lookup = routeLookup(ruleset);
  const selected = [];
  const unknown = [];
  for (const raw of splitValues(values)) {
    const clean = normalize(raw);
    let id = lookup.get(clean);
    if (!id) {
      const candidates = [...lookup.entries()].filter(
        ([alias]) => alias.length >= 8 && (clean.includes(alias) || alias.includes(clean)),
      );
      const unique = [...new Set(candidates.map(([, candidate]) => candidate))];
      if (unique.length === 1) id = unique[0];
    }
    if (id) {
      if (!selected.includes(id)) selected.push(id);
    } else if (clean) {
      unknown.push(raw);
    }
  }
  return { selected, unknown };
}

function tokens(value) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 2 && !STOP_TOKENS.has(token)),
  );
}

function inferChangeTypes(fields, ruleset) {
  const haystack = [
    fields.changeTypes,
    fields.detailedDescription,
    fields.reason,
    fields.actionType,
  ]
    .flatMap(splitValues)
    .join(" ");
  const haystackTokens = tokens(haystack);
  if (!haystackTokens.size) return [];

  return (ruleset.changeTypes || [])
    .map((route) => {
      const routeTokens = tokens([route.label, ...(route.aliases || [])].join(" "));
      const matches = [...routeTokens].filter((token) => haystackTokens.has(token)).length;
      const score = routeTokens.size ? matches / routeTokens.size : 0;
      return { id: route.id, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function classify({ canonicalFields, selectedTypes, ruleset }) {
  const explicit = resolveChangeTypeIds(selectedTypes, ruleset);
  const fromRow = resolveChangeTypeIds(canonicalFields.changeTypes, ruleset);
  const inferred = inferChangeTypes(canonicalFields, ruleset);

  let selected = explicit.selected;
  let confidence = selected.length ? 1 : 0;
  let source = selected.length ? "manual" : "unknown";
  if (!selected.length && fromRow.selected.length) {
    selected = fromRow.selected;
    confidence = fromRow.unknown.length ? 0.72 : 0.94;
    source = "sheet";
  } else if (!selected.length && inferred.length) {
    selected = [inferred[0].id];
    confidence = Math.min(0.69, Number(inferred[0].score.toFixed(2)));
    source = "inference";
  }

  const alternatives = inferred
    .map((candidate) => candidate.id)
    .filter((id) => !selected.includes(id))
    .slice(0, 4);
  const unknown = [...explicit.unknown, ...fromRow.unknown];
  const requiresConfirmation =
    selected.length === 0 ||
    source === "inference" ||
    confidence < 0.75 ||
    unknown.length > 0;

  return {
    selectedTypes: selected,
    alternatives,
    confidence,
    requiresConfirmation,
    source,
    unknownValues: unknown,
  };
}

function resolveProfileId(fields, selectedTypes, ruleset) {
  const requested = normalize(fields.checklistProfile || fields.materialProfile);
  for (const profile of Object.values(ruleset.checklistProfiles || {})) {
    if ([profile.id, profile.label].map(normalize).includes(requested)) return profile.id;
  }

  const action = normalize(fields.actionType);
  if (action.includes("system")) return "system_change";
  if (
    action.includes("delete") ||
    action.includes("obsolete") ||
    action.includes("discontinu") ||
    action.includes("reactivat") ||
    selectedTypes.includes("discontinuation_reactivation")
  ) {
    return "obsolescence";
  }

  const origin = normalize(fields.materialOrigin || fields.procurementType);
  const manufactured = /manufactur|make|in house/.test(origin);
  const purchased = /purchas|buy|vendor|supplier/.test(origin);
  if (/new|create/.test(action)) {
    if (manufactured) return "new_manufactured";
    if (purchased) return "new_purchased";
  }
  if (/change|modify|update/.test(action)) {
    if (manufactured) return "changed_manufactured";
    if (purchased) return "changed_purchased";
  }
  return null;
}

function conditionApplies(condition, fields) {
  if (!condition || condition === "always") return true;
  if (typeof condition === "string") return condition !== "never";
  const value = fields[condition.field];
  switch (condition.operator) {
    case "equals":
      return normalize(value) === normalize(condition.value);
    case "includes":
      return normalize(value).includes(normalize(condition.value));
    case "not_empty":
      return isProvided(value);
    case "falsy":
      return !isTruthyFlag(value);
    case "truthy":
    default:
      return isTruthyFlag(value);
  }
}

function effectiveFailure(rule, status = "missing") {
  if (status === "unknown") return { gateStatus: "unknown", severity: "warning" };
  if (rule.evidenceLevel !== CONTROLLED) {
    return { gateStatus: "warning", severity: "warning" };
  }
  if (rule.severity === "warning") return { gateStatus: "warning", severity: "warning" };
  if (rule.severity === "info") return { gateStatus: "unknown", severity: "info" };
  return { gateStatus: "block", severity: "blocker" };
}

function evaluateRequirement(requirement, fields, captureAssessment) {
  if (!conditionApplies(requirement.condition, fields)) return null;
  const values = (requirement.fields || []).map((field) => fields[field]);
  const satisfied = requirement.mode === "all"
    ? values.every(isProvided)
    : values.some(isProvided);
  if (satisfied) return { status: "pass", severity: "info", missingFields: [] };

  const observed = (requirement.fields || []).some((field) => fieldWasObserved(fields, field));
  const captureComplete =
    captureAssessment.state === "complete" &&
    captureAssessment.profileState !== "needs_remap";
  const status = !observed && !captureComplete ? "unknown" : "missing";
  const failure = effectiveFailure(requirement, status);
  return {
    status,
    severity: failure.severity,
    gateStatus: failure.gateStatus,
    missingFields: [...(requirement.fields || [])],
  };
}

function requirementTask(requirement, result, category, stage) {
  return {
    id: `${category}.${requirement.id}`,
    label: requirement.label,
    category,
    stage,
    status:
      result.status === "unknown" || requirement.evidenceLevel !== CONTROLLED
        ? "needs_confirmation"
        : "missing",
    severity: result.severity,
    fields: requirement.fields,
    missingFields: result.missingFields,
    source: requirement.source,
    revision: requirement.revision,
    section: requirement.section,
    cellRange: requirement.cellRange,
    evidenceLevel: requirement.evidenceLevel,
    expectedValue: requirement.expectedValue,
    nextAction: requirement.nextAction,
  };
}

function aggregateRequirementGate(id, label, stage, evaluated) {
  const failures = evaluated.filter((entry) => entry.result?.status !== "pass");
  let status = "pass";
  if (failures.some((entry) => entry.result.gateStatus === "block")) status = "block";
  else if (failures.some((entry) => entry.result.gateStatus === "unknown")) status = "unknown";
  else if (failures.length) status = "warning";
  return {
    id,
    stage,
    status,
    label,
    missingRuleIds: failures.map((entry) => entry.rule.id),
  };
}

function requiredFieldState(fieldNames, fields, captureAssessment, { truthy = false, clear = false } = {}) {
  const missingFields = [];
  const failedFields = [];
  for (const field of fieldNames) {
    const observed = fieldWasObserved(fields, field);
    const value = fields[field];
    const valid = clear ? isClearedValue(value) : truthy ? isTruthyFlag(value) : isProvided(value);
    if (!valid) {
      (observed ? failedFields : missingFields).push(field);
    }
  }
  if (!missingFields.length && !failedFields.length) return { ok: true, unknown: false, missingFields: [] };
  const incomplete =
    captureAssessment.state !== "complete" || captureAssessment.profileState === "needs_remap";
  return {
    ok: false,
    unknown: failedFields.length === 0 && missingFields.length > 0 && incomplete,
    missingFields: [...failedFields, ...missingFields],
  };
}

function requiredAnyFieldState(fieldNames, fields, captureAssessment) {
  if (fieldNames.some((field) => isProvided(fields[field]))) {
    return { ok: true, unknown: false, missingFields: [] };
  }
  const observed = fieldNames.some((field) => fieldWasObserved(fields, field));
  const incomplete =
    captureAssessment.state !== "complete" || captureAssessment.profileState === "needs_remap";
  return {
    ok: false,
    unknown: !observed && incomplete,
    missingFields: [...fieldNames],
  };
}

function qaRemovalRequested(value) {
  const clean = normalize(value);
  return /remove|unblock|release|off|clear/.test(clean);
}

function currentLifecycleStage(fields, profile) {
  const raw = String(fields.status ?? "").trim();
  const aliases = profile?.statusAliases || {};
  const mapped = aliases[raw] || aliases[normalize(raw)] || raw;
  const clean = normalize(mapped);
  return LIFECYCLE_STAGES.find((stage) => normalize(stage) === clean) || raw || "Submitted";
}

function crossCheckConditions({ rule, fields, selectedTypes, profileId, stage, captureAssessment }) {
  const action = normalize(fields.actionType);
  const isNew = /new|create/.test(action);
  switch (rule.id) {
    case "product_classification":
      if (!isNew) return null;
      return requiredFieldState(["productClassificationForm"], fields, captureAssessment);
    case "incoming_inspection":
      if (!isNew && !selectedTypes.some((id) => id.startsWith("form_fit_function"))) return null;
      return requiredFieldState(["incomingInspection", "inspectionText"], fields, captureAssessment, { truthy: true });
    case "customer_approval_timing": {
      const approvalRequired =
        isTruthyFlag(fields.customerApprovalRequired) ||
        normalize(fields.effectTiming).includes("after customer approval");
      if (!approvalRequired) return null;
      const evidence = requiredFieldState(["customerApprovalEvidence"], fields, captureAssessment, { truthy: true });
      const immediate = normalize(fields.effectTiming).includes("immediate");
      return {
        ok: evidence.ok && !immediate,
        unknown: evidence.unknown && !immediate,
        missingFields: [
          ...(immediate ? ["effectTiming"] : []),
          ...evidence.missingFields,
        ],
      };
    }
    case "tier1_vial_memo":
      if (!isTruthyFlag(fields.tier1VialSourceChange)) return null;
      return requiredFieldState(["tier1VialMemo"], fields, captureAssessment);
    case "conditional_drawing":
      if (!isTruthyFlag(fields.drawingRequired)) return null;
      return requiredAnyFieldState(["drawing", "drawingDisposition"], fields, captureAssessment);
    case "conditional_validation":
      if (!isTruthyFlag(fields.validationRequired)) return null;
      return requiredFieldState(["validationEvidence"], fields, captureAssessment);
    case "bom_uom_conversion": {
      const applies =
        profileId === "new_manufactured" ||
        isTruthyFlag(fields.bomChange) ||
        isTruthyFlag(fields.componentUomDiffers);
      if (!applies) return null;
      const required = ["bom"];
      if (isTruthyFlag(fields.componentUomDiffers)) required.push("uomConversion");
      return requiredFieldState(required, fields, captureAssessment);
    }
    case "routing_base_quantity":
      if (
        profileId !== "new_manufactured" &&
        !isTruthyFlag(fields.routingChange) &&
        !selectedTypes.some((id) => id.includes("routing"))
      ) return null;
      return requiredFieldState(["routingBaseQuantity"], fields, captureAssessment);
    case "qa_authorization":
      if (!qaRemovalRequested(fields.qaBlockAction)) return null;
      return requiredFieldState(["qaAuthorization"], fields, captureAssessment, { truthy: true });
    case "hard_deletion_gates":
      if (!isTruthyFlag(fields.hardDeletion)) return null;
      return requiredFieldState(
        ["remainingInventory", "openOrders", "openForecast", "whereUsed"],
        fields,
        captureAssessment,
        { clear: true },
      );
    case "closure_completion":
      if (normalize(stage) !== "closed" && !isTruthyFlag(fields.closureRequested)) return null;
      return requiredFieldState(
        ["reviewerCompletion", "notificationCompletion"],
        fields,
        captureAssessment,
        { truthy: true },
      );
    default:
      return null;
  }
}

function evaluateCrossChecks(context) {
  const gates = [];
  const tasks = [];
  const applicableRules = [];
  for (const rule of context.ruleset.crossChecks || []) {
    const result = crossCheckConditions({ ...context, rule });
    if (!result) continue;
    applicableRules.push(rule);
    const failure = result.ok
      ? { gateStatus: "pass", severity: "info" }
      : effectiveFailure(rule, result.unknown ? "unknown" : "missing");
    gates.push({
      id: rule.id,
      stage: rule.stage,
      status: failure.gateStatus,
      label: rule.label,
      missingFields: result.missingFields,
      evidenceLevel: rule.evidenceLevel,
    });
    if (!result.ok) {
      tasks.push({
        id: `cross_check.${rule.id}`,
        label: rule.label,
        category: "cross_check",
        stage: rule.stage,
        status: result.unknown || rule.evidenceLevel !== CONTROLLED ? "needs_confirmation" : "missing",
        severity: failure.severity,
        missingFields: result.missingFields,
        source: rule.source,
        revision: rule.revision,
        section: rule.section,
        cellRange: rule.cellRange,
        evidenceLevel: rule.evidenceLevel,
        expectedValue: rule.expectedValue,
        nextAction: rule.nextAction,
      });
    }
  }
  return { gates, tasks, applicableRules };
}

function participantReasons(routes, field) {
  const participants = new Map();
  for (const route of routes) {
    for (const department of route[field] || []) {
      if (!participants.has(department)) {
        participants.set(department, { department, reasons: [] });
      }
      participants.get(department).reasons.push({
        typeId: route.id,
        typeLabel: route.label,
        source: route.source,
        revision: route.revision,
        section: route.section,
        cellRange: route.cellRange,
      });
    }
  }
  return [...participants.values()];
}

function enrichAssignees(participants, fields, profile, ruleset) {
  const roster = profile?.participantRoster || ruleset.participantRoster || {};
  return participants.map((participant) => {
    if (participant.department === "Product Management" && isProvided(fields.productManager)) {
      return {
        ...participant,
        assignees: [{ name: String(fields.productManager).trim(), source: "live_classification" }],
      };
    }
    const fallback = splitValues(roster[participant.department]);
    return fallback.length
      ? {
          ...participant,
          assignees: fallback.map((name) => ({ name, source: "fallback_roster" })),
        }
      : participant;
  });
}

function playbookMatches(playbook, context) {
  const triggers = playbook.triggers || {};
  const reasons = [];
  const action = normalize(context.fields.actionType);
  if ((triggers.actionTypes || []).some((value) => action.includes(normalize(value)))) {
    reasons.push("action_type");
  }
  if ((triggers.typeIds || []).some((id) => context.selectedTypes.includes(id))) {
    reasons.push("change_type");
  }
  if ((triggers.profiles || []).includes(context.profileId)) reasons.push("checklist_profile");
  if ((triggers.fields || []).some((field) => isTruthyFlag(context.fields[field]))) {
    reasons.push("field_condition");
  }
  const status = normalize(context.stage);
  if ((triggers.statuses || []).some((value) => status === normalize(value))) reasons.push("lifecycle_status");
  return reasons;
}

function playbookTasks(context) {
  const tasks = [];
  const applicableRules = [];
  for (const playbook of context.ruleset.playbooks || []) {
    const reasons = playbookMatches(playbook, context);
    if (!reasons.length) continue;
    applicableRules.push(playbook);
    for (const task of playbook.tasks || []) {
      tasks.push({
        ...task,
        category: "implementation",
        stage: "Implementation",
        status: playbook.evidenceLevel === CONTROLLED ? "pending" : "needs_confirmation",
        severity: playbook.evidenceLevel === CONTROLLED ? "info" : "warning",
        reasons,
        source: playbook.source,
        revision: playbook.revision,
        section: playbook.section,
        cellRange: playbook.cellRange,
        evidenceLevel: playbook.evidenceLevel,
        expectedValue: playbook.expectedValue,
        nextAction: playbook.nextAction,
      });
    }
  }
  return { tasks, applicableRules };
}

function citationFrom(rule) {
  return {
    source: rule.source,
    revision: rule.revision,
    section: rule.section,
    cellRange: rule.cellRange || null,
    evidenceLevel: rule.evidenceLevel,
    excerpt: rule.excerpt || undefined,
  };
}

function uniqueCitations(rules) {
  const result = [];
  const seen = new Set();
  for (const rule of rules.filter(Boolean)) {
    const citation = citationFrom(rule);
    const key = [citation.source, citation.revision, citation.section, citation.cellRange].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(citation);
    }
  }
  return result;
}

function importedConflictFindings(ruleset) {
  return (ruleset?.import?.findings || []).filter((finding) => finding?.evidenceLevel === "conflict");
}

function importedConflictTasks(findings) {
  return findings.map((finding, index) => ({
    id: `ruleset.conflict.${String(finding.id || index + 1).replace(/[^a-z0-9._-]+/gi, "_")}`,
    label: finding.condition || finding.label || "Imported ruleset conflict",
    category: "ruleset",
    stage: "MDC Validation",
    status: "needs_confirmation",
    severity: "warning",
    source: finding.source,
    revision: finding.revision,
    section: finding.section,
    cellRange: finding.cellRange || null,
    evidenceLevel: "conflict",
    expectedValue: finding.expectedValue,
    nextAction: finding.nextAction || "Confirm the conflicting source evidence with its owner.",
  }));
}

function captureGate(snapshot, captureAssessment) {
  const profileReady = captureAssessment.profileState !== "needs_remap";
  const complete = snapshot?.captureState === "complete" && profileReady;
  return {
    id: "capture_integrity",
    stage: "MDC Validation",
    status: complete ? "pass" : "unknown",
    label: profileReady ? "Selected-row capture completeness" : "Sheet profile mapping",
    missingColumns: captureAssessment.missingColumns || [],
    profileState: captureAssessment.profileState || (profileReady ? "ready" : "needs_remap"),
  };
}

function classificationGate(classification) {
  return {
    id: "change_type_confirmation",
    stage: "MDC Validation",
    status: classification.requiresConfirmation ? "unknown" : "pass",
    label: "Change type classification",
    unknownValues: classification.unknownValues,
  };
}

function nextLifecycleStage(stage) {
  const clean = normalize(stage);
  const transitions = {
    submitted: "MDC Validation",
    "mdc validation": "Pre-Approval",
    "needs info": "MDC Validation",
    "pre approval": "Implementation",
    rework: "Pre-Approval",
    implementation: "MDC Verification",
    "mdc verification": "Implementation Review",
    "implementation review": "Notifications",
    notifications: "Closed",
    closed: "Closed",
  };
  return transitions[clean] || "MDC Validation";
}

function chooseNextAction({ gates, tasks, classification, captureAssessment, stage, language }) {
  const ru = language === "ru";
  if (captureAssessment.profileState === "needs_remap") {
    return {
      code: "remap_sheet_profile",
      status: "needs_confirmation",
      stage: "MDC Validation",
      label: ru ? "Подтвердите сопоставление колонок листа" : "Confirm the sheet column mapping",
    };
  }
  if (captureAssessment.state !== "complete" || captureAssessment.readinessAllowed === false) {
    return {
      code: "complete_row_capture",
      status: "needs_confirmation",
      stage: "MDC Validation",
      label: ru ? "Завершите захват строки или используйте Paste row" : "Complete row capture or use Paste row",
    };
  }
  if (classification.requiresConfirmation) {
    return {
      code: "confirm_change_types",
      status: "needs_confirmation",
      stage: "MDC Validation",
      label: ru ? "Подтвердите один или несколько Change Types" : "Confirm one or more Change Types",
    };
  }
  const blockers = tasks.filter((task) => task.severity === "blocker");
  if (blockers.length) {
    blockers.sort(
      (left, right) =>
        (STAGE_ORDER.get(normalize(left.stage)) ?? 99) -
        (STAGE_ORDER.get(normalize(right.stage)) ?? 99),
    );
    return {
      code: "resolve_blocker",
      status: "blocked",
      stage: blockers[0].stage,
      label: blockers[0].nextAction || blockers[0].label,
      blockerIds: blockers.map((task) => task.id),
    };
  }
  const confirmation = tasks.filter((task) => task.status === "needs_confirmation");
  if (confirmation.length || gates.some((gate) => gate.status === "warning" || gate.status === "unknown")) {
    return {
      code: "confirm_provisional_rules",
      status: "needs_confirmation",
      stage: confirmation[0]?.stage || stage,
      label: ru ? "Подтвердите отмеченные неоднозначные требования" : "Confirm the flagged provisional requirements",
      taskIds: confirmation.map((task) => task.id),
    };
  }
  if (normalize(stage) === "closed") {
    return {
      code: "closed",
      status: "closed",
      stage: "Closed",
      label: ru ? "ECN закрыт; дополнительных действий нет" : "ECN is closed; no further action",
    };
  }
  const target = nextLifecycleStage(stage);
  return {
    code: "advance_lifecycle",
    status: "ready",
    stage: target,
    label: ru ? `Готово к этапу ${target}` : `Ready for ${target}`,
  };
}

function draftTexts({ language, fields, snapshot, selectedRoutes, tasks, routing, stage }) {
  const ru = language === "ru";
  const reference =
    snapshot?.rowHint?.ecnNumber ||
    snapshot?.rowHint?.primaryValue ||
    fields.ecnNumber ||
    fields.itemNumber ||
    "selected ECN";
  const typeLabels = selectedRoutes.map((route) => route.label).join(", ") || "Needs confirmation";
  const missing = tasks
    .filter((task) => task.status === "missing")
    .map((task) => task.label);
  const implementation = tasks
    .filter((task) => task.category === "implementation")
    .map((task) => task.transaction ? `${task.label} (${task.transaction})` : task.label);
  const reviewers = routing.reviewers.map((item) => item.department).join(", ") || "None";
  const recipients = routing.recipients.map((item) => item.department).join(", ") || "None";

  if (ru) {
    return {
      missingInformation: missing.length
        ? `ECN ${reference}: пожалуйста, предоставьте недостающие сведения: ${missing.join("; ")}.`
        : `ECN ${reference}: обязательные сведения по доступному снимку заполнены.`,
      approvalComment: `ECN ${reference}. Change Types: ${typeLabels}. Запрос готовится к Pre-Approval после устранения всех Blockers и подтверждения спорных пунктов.`,
      implementationHandoff: `ECN ${reference}. Handoff для Implementation. Выполнить и независимо проверить: ${implementation.join("; ") || "applicable SAP/document checklist"}.`,
      reviewerRequest: `ECN ${reference}: требуется Implementation Review — ${reviewers}.`,
      closureSummary: `ECN ${reference}. Текущий этап: ${stage}. Completion recipients: ${recipients}. Перед Closed подтвердить reviewerCompletion и notificationCompletion.`,
    };
  }
  return {
    missingInformation: missing.length
      ? `ECN ${reference}: please provide the missing information: ${missing.join("; ")}.`
      : `ECN ${reference}: required information is complete in the available snapshot.`,
    approvalComment: `ECN ${reference}. Change Types: ${typeLabels}. Prepare for Pre-Approval after all blockers are resolved and provisional items are confirmed.`,
    implementationHandoff: `ECN ${reference}. Implementation handoff. Complete and independently verify: ${implementation.join("; ") || "the applicable SAP/document checklist"}.`,
    reviewerRequest: `ECN ${reference}: Implementation Review is required from ${reviewers}.`,
    closureSummary: `ECN ${reference}. Current stage: ${stage}. Completion recipients: ${recipients}. Confirm reviewerCompletion and notificationCompletion before Closed.`,
  };
}

/**
 * Deterministic ECN analysis. It never mutates the snapshot and does not call
 * an AI model. The backend may merge optional model classification/drafts into
 * this response, but controlled gates remain authoritative.
 */
export function analyzeEcnSnapshot({
  snapshot,
  canonicalFields = {},
  selectedTypes = [],
  captureAssessment = {},
  profile = {},
  language = "en",
  ruleset = DEFAULT_ECN_RULESET,
} = {}) {
  const safeSnapshot = snapshot || { captureState: "ambiguous", rowHint: {} };
  const capture = {
    state: captureAssessment.state || safeSnapshot.captureState || "ambiguous",
    missingColumns: [...(captureAssessment.missingColumns || [])],
    profileState: captureAssessment.profileState || "needs_remap",
    fingerprintMatched: captureAssessment.fingerprintMatched === true,
    readinessAllowed: captureAssessment.readinessAllowed === true,
  };
  const classification = classify({ canonicalFields, selectedTypes, ruleset });
  const selectedRoutes = (ruleset.changeTypes || []).filter((route) =>
    classification.selectedTypes.includes(route.id),
  );
  const profileId = resolveProfileId(canonicalFields, classification.selectedTypes, ruleset);
  const checklistProfile = profileId ? ruleset.checklistProfiles?.[profileId] : null;
  const stage = currentLifecycleStage(canonicalFields, profile);

  const baseEvaluated = (ruleset.baseRequestRequirements || [])
    .map((rule) => ({ rule, result: evaluateRequirement(rule, canonicalFields, capture) }))
    .filter((entry) => entry.result);
  const checklistEvaluated = (checklistProfile?.requirements || [])
    .map((rule) => ({ rule, result: evaluateRequirement(rule, canonicalFields, capture) }))
    .filter((entry) => entry.result);

  const requirementTasks = [
    ...baseEvaluated
      .filter((entry) => entry.result.status !== "pass")
      .map((entry) => requirementTask(entry.rule, entry.result, "required_information", "MDC Validation")),
    ...checklistEvaluated
      .filter((entry) => entry.result.status !== "pass")
      .map((entry) => requirementTask(entry.rule, entry.result, "checklist", "MDC Validation")),
  ];

  if (!profileId) {
    requirementTasks.push({
      id: "checklist.profile_confirmation",
      label: "Checklist profile",
      category: "checklist",
      stage: "MDC Validation",
      status: "needs_confirmation",
      severity: "warning",
      missingFields: ["actionType", "materialOrigin"],
      evidenceLevel: "controlled",
      nextAction: "Confirm whether the item is purchased, manufactured, obsolete/reactivated, or a system change.",
    });
  }

  const crossChecks = evaluateCrossChecks({
    fields: canonicalFields,
    selectedTypes: classification.selectedTypes,
    profileId,
    stage,
    captureAssessment: capture,
    ruleset,
  });
  const playbooks = playbookTasks({
    fields: canonicalFields,
    selectedTypes: classification.selectedTypes,
    profileId,
    stage,
    ruleset,
  });
  const importedConflicts = importedConflictFindings(ruleset);

  const routing = {
    preApprovers: enrichAssignees(
      participantReasons(selectedRoutes, "preApprovers"),
      canonicalFields,
      profile,
      ruleset,
    ),
    reviewers: enrichAssignees(
      participantReasons(selectedRoutes, "reviewers"),
      canonicalFields,
      profile,
      ruleset,
    ),
    recipients: enrichAssignees(
      participantReasons(selectedRoutes, "recipients"),
      canonicalFields,
      profile,
      ruleset,
    ),
  };

  const gates = [
    captureGate(safeSnapshot, capture),
    classificationGate(classification),
    aggregateRequirementGate(
      "base_request_information",
      "Base ECN request information",
      "MDC Validation",
      baseEvaluated,
    ),
  ];
  if (checklistProfile) {
    gates.push(
      aggregateRequirementGate(
        `checklist_${profileId}`,
        checklistProfile.label,
        "MDC Validation",
        checklistEvaluated,
      ),
    );
  }
  gates.push(...crossChecks.gates);
  if (importedConflicts.length) {
    gates.push({
      id: "ruleset_import_conflicts",
      stage: "MDC Validation",
      status: "warning",
      label: "Imported source conflicts require confirmation",
      evidenceLevel: "conflict",
      conflictIds: importedConflicts.map((finding) => finding.id),
    });
  }

  const tasks = [
    ...requirementTasks,
    ...crossChecks.tasks,
    ...playbooks.tasks,
    ...importedConflictTasks(importedConflicts),
  ];
  const nextAction = chooseNextAction({
    gates,
    tasks,
    classification,
    captureAssessment: capture,
    stage,
    language,
  });

  return {
    ruleSetVersion: ruleset.version || ECN_RULESET_VERSION,
    capture,
    classification: {
      selectedTypes: classification.selectedTypes,
      alternatives: classification.alternatives,
      confidence: classification.confidence,
      requiresConfirmation: classification.requiresConfirmation,
    },
    checklist: {
      profileId,
      label: checklistProfile?.label || null,
      requiresConfirmation: !profileId,
    },
    lifecycle: { currentStage: stage },
    gates,
    routing,
    tasks,
    nextAction,
    drafts: draftTexts({
      language,
      fields: canonicalFields,
      snapshot: safeSnapshot,
      selectedRoutes,
      tasks,
      routing,
      stage,
    }),
    citations: uniqueCitations([
      ...selectedRoutes,
      ...baseEvaluated.map((entry) => entry.rule),
      ...checklistEvaluated.map((entry) => entry.rule),
      ...crossChecks.applicableRules,
      ...playbooks.applicableRules,
      ...importedConflicts,
    ]),
  };
}

export default analyzeEcnSnapshot;
