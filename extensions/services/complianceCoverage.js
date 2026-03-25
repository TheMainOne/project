import "dotenv/config";
import OpenAI from "openai";
import ComplianceAssertion from "../sf-compliance/models/ComplianceAssertion.js";
import Regulation from "../sf-compliance/models/Regulation.js";
import Supplier from "../sf-compliance/models/Supplier.js";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

export function normalizeItemNumber(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeRegulationCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeSupplierName(value) {
  return String(value || "").trim();
}

export function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function isAssertionExpired(assertion) {
  if (!assertion?.validUntil) return false;

  const validUntilDate = new Date(assertion.validUntil);
  if (Number.isNaN(validUntilDate.getTime())) return false;

  return validUntilDate < new Date();
}

export function collectRelevantSuppliersFromLookupResult(result) {
  const supplierMap = new Map();

  const addSupplier = (supplierName, source, component = null) => {
    const normalizedName = normalizeSupplierName(supplierName);
    if (!normalizedName) return;

    const key = normalizedName.toLowerCase();

    if (!supplierMap.has(key)) {
      supplierMap.set(key, {
        supplierName: normalizedName,
        sources: [],
      });
    }

    supplierMap.get(key).sources.push({
      source,
      component: component ? normalizeItemNumber(component) : null,
    });
  };

  toArray(result?.suppliers).forEach((supplierName) => {
    addSupplier(supplierName, "material");
  });

  toArray(result?.components).forEach((componentEntry) => {
    toArray(componentEntry?.suppliers).forEach((supplierName) => {
      addSupplier(
        supplierName,
        "component",
        componentEntry?.component || componentEntry?.catalogNumbers?.[0] || null
      );
    });
  });

  return Array.from(supplierMap.values());
}

export function collectRelevantSuppliersFromLookupEntry(entry) {
  const supplierMap = new Map();

  const addSupplier = (supplierName, source, componentMaterial = null) => {
    const normalizedName = normalizeSupplierName(supplierName);
    if (!normalizedName) return;

    const key = normalizedName.toLowerCase();

    if (!supplierMap.has(key)) {
      supplierMap.set(key, {
        supplierName: normalizedName,
        sources: [],
      });
    }

    const existing = supplierMap.get(key);

    existing.sources.push({
      source,
      componentMaterial: componentMaterial ? normalizeItemNumber(componentMaterial) : null,
    });
  };

  addSupplier(entry?.supplier, "material");

  toArray(entry?.components).forEach((component) => {
    addSupplier(component?.supplier, "component", component?.material);
  });

  return Array.from(supplierMap.values());
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hasStructuredScope(scope = {}) {
  return Boolean(
    scope?.allSupplierItems === true ||
      (Array.isArray(scope?.dwkItemNumbers) && scope.dwkItemNumbers.length > 0) ||
      (Array.isArray(scope?.supplierPartNumbers) && scope.supplierPartNumbers.length > 0) ||
      (Array.isArray(scope?.families) && scope.families.length > 0) ||
      (Array.isArray(scope?.countries) && scope.countries.length > 0) ||
      (Array.isArray(scope?.plants) && scope.plants.length > 0)
  );
}

function isLlmEligibleAssertion(assertion) {
  const eligibleTypes = new Set(["compliant", "free_from", "informational"]);
  return eligibleTypes.has(assertion?.assertionType);
}

export function resolveAssertionMatch(assertion, context = {}) {
  const normalizedItem = normalizeItemNumber(context.itemNumber);
  const coverageLevel = assertion?.coverageLevel;
  const scope = assertion?.scope || {};

  if (!assertion) {
    return {
      matched: false,
      requiresLlm: false,
      reason: "No assertion provided",
      matchSource: "none",
    };
  }

  if (!normalizedItem) {
    return {
      matched: false,
      requiresLlm: false,
      reason: "No item number provided",
      matchSource: "none",
    };
  }

  if (assertion.status && !["active", "expired"].includes(assertion.status)) {
    return {
      matched: false,
      requiresLlm: false,
      reason: `Assertion status ${assertion.status} is not eligible`,
      matchSource: "none",
    };
  }

  const dwkItems = Array.isArray(scope.dwkItemNumbers)
    ? scope.dwkItemNumbers.map(normalizeItemNumber).filter(Boolean)
    : [];

  if (coverageLevel === "supplier_all") {
    return {
      matched: scope.allSupplierItems === true,
      requiresLlm: false,
      reason:
        scope.allSupplierItems === true
          ? "Matched supplier_all with allSupplierItems=true"
          : "supplier_all without allSupplierItems=true",
      matchSource: scope.allSupplierItems === true ? "scope" : "none",
    };
  }

  if (coverageLevel === "item_single" || coverageLevel === "item_list") {
    const matched = dwkItems.includes(normalizedItem);

    return {
      matched,
      requiresLlm: false,
      reason: matched
        ? "Matched DWK item number from explicit scope"
        : "DWK item number not present in explicit scope",
      matchSource: matched ? "scope" : "none",
    };
  }

  if (coverageLevel === "supplier_subset") {
    if (scope.allSupplierItems === true) {
      return {
        matched: true,
        requiresLlm: false,
        reason: "supplier_subset treated as supplier-wide because allSupplierItems=true",
        matchSource: "scope",
      };
    }

    if (dwkItems.includes(normalizedItem)) {
      return {
        matched: true,
        requiresLlm: false,
        reason: "Matched supplier_subset by explicit DWK item number",
        matchSource: "scope",
      };
    }

    const structuredScopeExists = hasStructuredScope(scope);
    const hasStatementText = Boolean(normalizeText(assertion.statementText));
    const hasDescriptions =
      Array.isArray(context.descriptions) &&
      context.descriptions.some((d) => normalizeText(d));

    if (
      !structuredScopeExists &&
      hasStatementText &&
      hasDescriptions &&
      isLlmEligibleAssertion(assertion)
    ) {
      return {
        matched: false,
        requiresLlm: true,
        reason:
          "supplier_subset has statementText but no structured scope; LLM interpretation needed",
        matchSource: "none",
      };
    }

    return {
      matched: false,
      requiresLlm: false,
      reason: "supplier_subset did not match structured scope",
      matchSource: "none",
    };
  }

  return {
    matched: false,
    requiresLlm: false,
    reason: `Unsupported coverageLevel: ${coverageLevel || "unknown"}`,
    matchSource: "none",
  };
}

async function resolveAssertionsWithLlm({
  assertions = [],
  itemNumber,
  descriptions = [],
  supplierName,
  regulationCode,
}) {
  if (!assertions.length) {
    return {
      matchedAssertionIds: [],
      decision: "no_match",
      reason: "No candidate assertions",
    };
  }

  if (!openai) {
    return {
      matchedAssertionIds: [],
      decision: "uncertain",
      reason: "OPENAI_API_KEY is not configured on the server",
    };
  }

  const sanitizedDescriptions = toArray(descriptions)
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 10);

  const candidateAssertions = assertions.map((assertion) => ({
    id: String(assertion._id),
    assertionType: assertion.assertionType || "",
    coverageLevel: assertion.coverageLevel || "",
    statementText: assertion.statementText || "",
    scope: assertion.scope || {},
    confidence: assertion.confidence || null,
  }));

  const promptPayload = {
    itemNumber,
    supplierName: supplierName || "",
    regulationCode: regulationCode || "",
    descriptions: sanitizedDescriptions,
    assertions: candidateAssertions,
  };

  const instructions = `
You are reviewing supplier compliance statements.

Your task is NOT to decide actual regulatory compliance.
Your only task is to decide whether the item's description appears to fall within
the textual scope of one or more supplier statements.

Important rules:
- Be conservative.
- Only mark a statement as matched when the item description clearly falls within the statement text.
- If the statement is broad but ambiguous, prefer "uncertain".
- Do not infer compliance beyond the textual scope.
- Ignore supplier name matching because the supplier is already pre-filtered.
- Return strict JSON only.

JSON schema:
{
  "matchedAssertionIds": ["string"],
  "decision": "match" | "no_match" | "uncertain",
  "reason": "string"
}
`.trim();

  try {
    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      store: false,
      input: [
        {
          role: "system",
          content: instructions,
        },
        {
          role: "user",
          content: JSON.stringify(promptPayload),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "assertion_scope_match_result",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              matchedAssertionIds: {
                type: "array",
                items: {
                  type: "string",
                },
              },
              decision: {
                type: "string",
                enum: ["match", "no_match", "uncertain"],
              },
              reason: {
                type: "string",
              },
            },
            required: ["matchedAssertionIds", "decision", "reason"],
          },
        },
      },
    });

    const rawText = response.output_text || "{}";
    const parsed = JSON.parse(rawText);

    const validIds = new Set(candidateAssertions.map((item) => item.id));
    const matchedAssertionIds = toArray(parsed?.matchedAssertionIds)
      .map((id) => String(id))
      .filter((id) => validIds.has(id));

    const decision = ["match", "no_match", "uncertain"].includes(parsed?.decision)
      ? parsed.decision
      : "uncertain";

    const reason =
      typeof parsed?.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : "No reason returned by LLM";

    return {
      matchedAssertionIds,
      decision,
      reason,
    };
  } catch (error) {
    return {
      matchedAssertionIds: [],
      decision: "uncertain",
      reason: `LLM resolver failed: ${error.message}`,
    };
  }
}

function getAssertionPriority(assertionType) {
  switch (assertionType) {
    case "contains":
      return 100;
    case "non_compliant":
      return 90;
    case "free_from":
      return 80;
    case "compliant":
      return 70;
    case "partial":
      return 60;
    case "informational":
      return 50;
    default:
      return 0;
  }
}

export function mapAssertionToCoverageStatus(assertion) {
  if (!assertion) return "missing";

  if (isAssertionExpired(assertion)) {
    return "expired";
  }

  switch (assertion.assertionType) {
    case "contains":
    case "non_compliant":
      return "non_compliant";

    case "free_from":
    case "compliant":
      return "covered";

    case "partial":
      return "partial";

    case "informational":
      return "informational";

    default:
      return "missing";
  }
}

export function pickBestAssertion(assertions = []) {
  if (!Array.isArray(assertions) || assertions.length === 0) return null;

  const sorted = [...assertions].sort((a, b) => {
    const priorityDiff =
      getAssertionPriority(b.assertionType) - getAssertionPriority(a.assertionType);

    if (priorityDiff !== 0) return priorityDiff;

    const aIssueDate = a.issueDate ? new Date(a.issueDate).getTime() : 0;
    const bIssueDate = b.issueDate ? new Date(b.issueDate).getTime() : 0;

    return bIssueDate - aIssueDate;
  });

  return sorted[0];
}

export function summarizeSupplierCoverageStatuses(statuses = []) {
  const normalized = statuses.filter(Boolean);

  if (normalized.includes("non_compliant")) {
    return "non_compliant";
  }

  if (normalized.length === 0 || normalized.every((status) => status === "missing")) {
    return "missing";
  }

  if (normalized.every((status) => status === "covered")) {
    return "covered";
  }

  if (normalized.includes("partial")) {
    return "partial";
  }

  if (normalized.includes("expired") && normalized.every((status) => status === "expired")) {
    return "expired";
  }

  if (normalized.includes("covered") && normalized.includes("missing")) {
    return "partial";
  }

  if (normalized.includes("covered") && normalized.includes("expired")) {
    return "partial";
  }

  if (normalized.includes("expired") && normalized.includes("missing")) {
    return "partial";
  }

  if (
    normalized.includes("informational") &&
    normalized.every((status) => status === "informational")
  ) {
    return "informational";
  }

  if (normalized.includes("covered")) {
    return "partial";
  }

  return "partial";
}

export function buildAssertionPreview(assertion) {
  if (!assertion) return null;

  return {
    _id: assertion._id,
    assertionType: assertion.assertionType,
    coverageLevel: assertion.coverageLevel,
    statementText: assertion.statementText,
    issueDate: assertion.issueDate,
    validUntil: assertion.validUntil,
    status: assertion.status,
    confidence: assertion.confidence,
    scope: assertion.scope,
    regulation: assertion.regulationId
      ? {
          _id: assertion.regulationId._id,
          code: assertion.regulationId.code,
          name: assertion.regulationId.name,
        }
      : null,
    document: assertion.documentId
      ? {
          _id: assertion.documentId._id,
          title: assertion.documentId.title,
          fileName: assertion.documentId.fileName,
          status: assertion.documentId.status,
          issueDate: assertion.documentId.issueDate,
          validUntil: assertion.documentId.validUntil,
          storage: assertion.documentId.storage,
        }
      : null,
  };
}

export async function getCoverageForItem({ itemNumber, supplierId, descriptions = [] }) {
  const normalizedItemNumber = normalizeItemNumber(itemNumber);

  if (!normalizedItemNumber) {
    throw new Error("itemNumber is required");
  }

  if (!supplierId) {
    throw new Error("supplierId is required");
  }

  const [regulations, assertions, supplierDoc] = await Promise.all([
    Regulation.find({ isActive: true }).sort({ code: 1 }),
    ComplianceAssertion.find({
      supplierId,
      status: { $in: ["active", "expired"] },
    })
      .populate("regulationId", "code name")
      .populate("documentId", "title fileName status issueDate validUntil storage"),
    Supplier.findById(supplierId).select("_id supplierName supplierCode aliases"),
  ]);

  const lookupContext = {
    itemNumber: normalizedItemNumber,
    descriptions: toArray(descriptions).filter(Boolean),
  };

  const results = [];

  for (const regulation of regulations) {
    const regulationAssertions = assertions.filter(
      (assertion) =>
        String(assertion?.regulationId?._id || assertion?.regulationId) ===
        String(regulation._id)
    );

    const resolvedMatches = regulationAssertions.map((assertion) => ({
      assertion,
      resolution: resolveAssertionMatch(assertion, lookupContext),
    }));

    const strictMatchedAssertions = resolvedMatches
      .filter((entry) => entry.resolution.matched)
      .map((entry) => entry.assertion);

    const llmCandidateAssertions = resolvedMatches
      .filter((entry) => entry.resolution.requiresLlm)
      .map((entry) => entry.assertion);

    let finalMatchedAssertions = [...strictMatchedAssertions];
    let llmReview = null;

    if (
      finalMatchedAssertions.length === 0 &&
      llmCandidateAssertions.length > 0 &&
      lookupContext.descriptions.length > 0
    ) {
      llmReview = await resolveAssertionsWithLlm({
        assertions: llmCandidateAssertions,
        itemNumber: normalizedItemNumber,
        descriptions: lookupContext.descriptions,
        supplierName: supplierDoc?.supplierName,
        regulationCode: regulation.code,
      });

      const llmMatchedIds = new Set(
        toArray(llmReview?.matchedAssertionIds).map((id) => String(id))
      );

      finalMatchedAssertions = llmCandidateAssertions.filter((assertion) =>
        llmMatchedIds.has(String(assertion._id))
      );
    }

    const bestAssertion = pickBestAssertion(finalMatchedAssertions);
    const coverageStatus = mapAssertionToCoverageStatus(bestAssertion);

    results.push({
      regulation: {
        _id: regulation._id,
        code: regulation.code,
        name: regulation.name,
      },
      coverageStatus,
      matchedAssertionsCount: finalMatchedAssertions.length,
      bestAssertion: buildAssertionPreview(bestAssertion),
      matchSource: bestAssertion ? (llmReview ? "llm" : "scope") : "none",
      matchReason: llmReview?.reason || null,
      llmUsed: Boolean(llmReview),
    });
  }

  return {
    itemNumber: normalizedItemNumber,
    supplierId,
    totalRegulations: regulations.length,
    coveredCount: results.filter((r) => r.coverageStatus === "covered").length,
    nonCompliantCount: results.filter((r) => r.coverageStatus === "non_compliant").length,
    partialCount: results.filter((r) => r.coverageStatus === "partial").length,
    informationalCount: results.filter((r) => r.coverageStatus === "informational").length,
    expiredCount: results.filter((r) => r.coverageStatus === "expired").length,
    missingCount: results.filter((r) => r.coverageStatus === "missing").length,
    results,
  };
}

export async function getCoverageForLookupResults({
  lookupResults = [],
  requestedRegulationCodes = [],
}) {
  const normalizedRequestedCodes = [
    ...new Set(
      toArray(requestedRegulationCodes)
        .map(normalizeRegulationCode)
        .filter(Boolean)
    ),
  ];

  if (normalizedRequestedCodes.length === 0) {
    return {
      requestedRegulations: [],
      byMaterial: [],
      summary: {},
    };
  }

  const normalizedResults = toArray(lookupResults).filter(
    (result) => result && result.found && result.material
  );

  const supplierCandidates = normalizedResults.flatMap((result) =>
    collectRelevantSuppliersFromLookupResult(result).map((entry) => entry.supplierName)
  );

  const uniqueSupplierNames = [
    ...new Set(
      supplierCandidates.map((name) => normalizeSupplierName(name)).filter(Boolean)
    ),
  ];

  const [regulations, suppliers] = await Promise.all([
    Regulation.find({
      isActive: true,
      code: { $in: normalizedRequestedCodes },
    }).sort({ code: 1 }),
    Supplier.find({}).select("_id supplierName supplierCode aliases"),
  ]);

  const regulationByCode = new Map(
    regulations.map((regulation) => [normalizeRegulationCode(regulation.code), regulation])
  );

  const requestedRegulations = normalizedRequestedCodes
    .map((code) => regulationByCode.get(code))
    .filter(Boolean);

  const supplierLookupMap = new Map();

  suppliers.forEach((supplier) => {
    const keys = [
      supplier.supplierName,
      supplier.supplierCode,
      ...(Array.isArray(supplier.aliases) ? supplier.aliases : []),
    ]
      .map((value) => normalizeSupplierName(value).toLowerCase())
      .filter(Boolean);

    keys.forEach((key) => {
      if (!supplierLookupMap.has(key)) {
        supplierLookupMap.set(key, supplier);
      }
    });
  });

  const matchedSupplierDocs = uniqueSupplierNames
    .map((name) => supplierLookupMap.get(normalizeSupplierName(name).toLowerCase()))
    .filter(Boolean);

  const supplierIds = [...new Set(matchedSupplierDocs.map((supplier) => String(supplier._id)))];
  const regulationIds = requestedRegulations.map((regulation) => regulation._id);

  const assertions =
    supplierIds.length && regulationIds.length
      ? await ComplianceAssertion.find({
          supplierId: { $in: supplierIds },
          regulationId: { $in: regulationIds },
          status: { $in: ["active", "expired"] },
        })
          .populate("regulationId", "code name")
          .populate("documentId", "title fileName status issueDate validUntil storage")
      : [];

  const assertionsBySupplierAndRegulation = new Map();

  assertions.forEach((assertion) => {
    const supplierId = String(assertion.supplierId);
    const regulationId = String(assertion?.regulationId?._id || assertion?.regulationId);
    const key = `${supplierId}::${regulationId}`;

    if (!assertionsBySupplierAndRegulation.has(key)) {
      assertionsBySupplierAndRegulation.set(key, []);
    }

    assertionsBySupplierAndRegulation.get(key).push(assertion);
  });

  const byMaterial = [];

  for (const result of normalizedResults) {
    const relevantSuppliers = collectRelevantSuppliersFromLookupResult(result);
    const itemNumber = normalizeItemNumber(result.material);

    const materialDescriptions = [
      ...toArray(result?.matches).map((entry) => entry?.description),
      ...toArray(result?.components).flatMap((component) => toArray(component?.descriptions)),
    ].filter(Boolean);

    const lookupContext = {
      itemNumber,
      descriptions: materialDescriptions,
    };

    const regulationsForMaterial = [];

    for (const regulation of requestedRegulations) {
      const supplierResults = [];

      for (const supplierInfo of relevantSuppliers) {
        const supplierDoc = supplierLookupMap.get(
          normalizeSupplierName(supplierInfo.supplierName).toLowerCase()
        );

        if (!supplierDoc) {
          supplierResults.push({
            supplierName: supplierInfo.supplierName,
            supplierId: null,
            supplierCode: null,
            sources: supplierInfo.sources,
            coverageStatus: "missing",
            matchedAssertionsCount: 0,
            bestAssertion: null,
            matchSource: "none",
            matchReason: "Supplier not found in Supplier collection",
            llmUsed: false,
          });
          continue;
        }

        const key = `${String(supplierDoc._id)}::${String(regulation._id)}`;
        const rawAssertions = assertionsBySupplierAndRegulation.get(key) || [];

        const resolvedMatches = rawAssertions.map((assertion) => ({
          assertion,
          resolution: resolveAssertionMatch(assertion, lookupContext),
        }));

        const strictMatchedAssertions = resolvedMatches
          .filter((entry) => entry.resolution.matched)
          .map((entry) => entry.assertion);

        const llmCandidateAssertions = resolvedMatches
          .filter((entry) => entry.resolution.requiresLlm)
          .map((entry) => entry.assertion);

        let finalMatchedAssertions = [...strictMatchedAssertions];
        let llmReview = null;

        if (
          finalMatchedAssertions.length === 0 &&
          llmCandidateAssertions.length > 0 &&
          materialDescriptions.length > 0
        ) {
          llmReview = await resolveAssertionsWithLlm({
            assertions: llmCandidateAssertions,
            itemNumber,
            descriptions: materialDescriptions,
            supplierName: supplierDoc.supplierName,
            regulationCode: regulation.code,
          });

          const llmMatchedIds = new Set(
            toArray(llmReview?.matchedAssertionIds).map((id) => String(id))
          );

          finalMatchedAssertions = llmCandidateAssertions.filter((assertion) =>
            llmMatchedIds.has(String(assertion._id))
          );
        }

        const bestAssertion = pickBestAssertion(finalMatchedAssertions);
        const coverageStatus = mapAssertionToCoverageStatus(bestAssertion);

        supplierResults.push({
          supplierName: supplierDoc.supplierName,
          supplierCode: supplierDoc.supplierCode || null,
          supplierId: supplierDoc._id,
          sources: supplierInfo.sources,
          coverageStatus,
          matchedAssertionsCount: finalMatchedAssertions.length,
          bestAssertion: buildAssertionPreview(bestAssertion),
          matchSource: bestAssertion ? (llmReview ? "llm" : "scope") : "none",
          matchReason: llmReview?.reason || null,
          llmUsed: Boolean(llmReview),
        });
      }

      const coveredSuppliers = supplierResults
        .filter((entry) => entry.coverageStatus === "covered")
        .map((entry) => entry.supplierName);

      const partialSuppliers = supplierResults
        .filter((entry) => entry.coverageStatus === "partial")
        .map((entry) => entry.supplierName);

      const expiredSuppliers = supplierResults
        .filter((entry) => entry.coverageStatus === "expired")
        .map((entry) => entry.supplierName);

      const informationalSuppliers = supplierResults
        .filter((entry) => entry.coverageStatus === "informational")
        .map((entry) => entry.supplierName);

      const nonCompliantSuppliers = supplierResults
        .filter((entry) => entry.coverageStatus === "non_compliant")
        .map((entry) => entry.supplierName);

      const missingSuppliers = supplierResults
        .filter((entry) => entry.coverageStatus === "missing")
        .map((entry) => entry.supplierName);

      const overallStatus = summarizeSupplierCoverageStatuses(
        supplierResults.map((entry) => entry.coverageStatus)
      );

      regulationsForMaterial.push({
        regulation: {
          _id: regulation._id,
          code: regulation.code,
          name: regulation.name,
        },
        overallStatus,
        coveredSuppliers,
        partialSuppliers,
        expiredSuppliers,
        informationalSuppliers,
        nonCompliantSuppliers,
        missingSuppliers,
        supplierResults,
      });
    }

    byMaterial.push({
      query: result.query,
      normalizedQuery: result.normalizedQuery,
      material: itemNumber,
      suppliers: relevantSuppliers.map((entry) => entry.supplierName),
      regulations: regulationsForMaterial,
    });
  }

  const summary = {};

  normalizedRequestedCodes.forEach((code) => {
    const statuses = byMaterial.flatMap((materialResult) =>
      materialResult.regulations
        .filter(
          (regulationResult) =>
            normalizeRegulationCode(regulationResult.regulation.code) === code
        )
        .map((regulationResult) => regulationResult.overallStatus)
    );

    summary[code] = summarizeSupplierCoverageStatuses(statuses);
  });

  return {
    requestedRegulations: requestedRegulations.map((regulation) => ({
      _id: regulation._id,
      code: regulation.code,
      name: regulation.name,
    })),
    byMaterial,
    summary,
  };
}