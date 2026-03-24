import ComplianceAssertion from "../sf-compliance/models/ComplianceAssertion.js";
import Regulation from "../sf-compliance/models/Regulation.js";
import Supplier from "../sf-compliance/models/Supplier.js";

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

export function doesAssertionMatchItem(assertion, itemNumber) {
  const normalizedItem = normalizeItemNumber(itemNumber);

  if (!normalizedItem || !assertion) return false;
  if (assertion.status && assertion.status !== "active") return false;

  const coverageLevel = assertion.coverageLevel;
  const scope = assertion.scope || {};

  if (coverageLevel === "supplier_all") {
    return scope.allSupplierItems === true;
  }

  if (coverageLevel === "item_single" || coverageLevel === "item_list") {
    const dwkItems = Array.isArray(scope.dwkItemNumbers)
      ? scope.dwkItemNumbers.map(normalizeItemNumber)
      : [];

    return dwkItems.includes(normalizedItem);
  }

  return false;
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

  if (normalized.includes("informational") && normalized.every((status) => status === "informational")) {
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

export async function getCoverageForItem({ itemNumber, supplierId }) {
  const normalizedItemNumber = normalizeItemNumber(itemNumber);

  if (!normalizedItemNumber) {
    throw new Error("itemNumber is required");
  }

  if (!supplierId) {
    throw new Error("supplierId is required");
  }

  const [regulations, assertions] = await Promise.all([
    Regulation.find({ isActive: true }).sort({ code: 1 }),
    ComplianceAssertion.find({
      supplierId,
      status: { $in: ["active", "expired"] },
    })
      .populate("regulationId", "code name")
      .populate("documentId", "title fileName status issueDate validUntil storage"),
  ]);

  const matchedAssertions = assertions.filter((assertion) =>
    doesAssertionMatchItem(assertion, normalizedItemNumber)
  );

  const results = regulations.map((regulation) => {
    const regulationAssertions = matchedAssertions.filter(
      (assertion) =>
        String(assertion?.regulationId?._id || assertion?.regulationId) ===
        String(regulation._id)
    );

    const bestAssertion = pickBestAssertion(regulationAssertions);
    const coverageStatus = mapAssertionToCoverageStatus(bestAssertion);

    return {
      regulation: {
        _id: regulation._id,
        code: regulation.code,
        name: regulation.name,
      },
      coverageStatus,
      matchedAssertionsCount: regulationAssertions.length,
      bestAssertion: bestAssertion
        ? {
            _id: bestAssertion._id,
            assertionType: bestAssertion.assertionType,
            coverageLevel: bestAssertion.coverageLevel,
            statementText: bestAssertion.statementText,
            issueDate: bestAssertion.issueDate,
            validUntil: bestAssertion.validUntil,
            status: bestAssertion.status,
            confidence: bestAssertion.confidence,
            scope: bestAssertion.scope,
            document: bestAssertion.documentId
              ? {
                  _id: bestAssertion.documentId._id,
                  title: bestAssertion.documentId.title,
                  fileName: bestAssertion.documentId.fileName,
                  status: bestAssertion.documentId.status,
                  issueDate: bestAssertion.documentId.issueDate,
                  validUntil: bestAssertion.documentId.validUntil,
                  storage: bestAssertion.documentId.storage,
                }
              : null,
          }
        : null,
    };
  });

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

  const supplierIds = suppliers.map((supplier) => supplier._id);
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

  const byMaterial = normalizedResults.map((result) => {
    const relevantSuppliers = collectRelevantSuppliersFromLookupResult(result);
    const itemNumber = normalizeItemNumber(result.material);

    const regulationsForMaterial = requestedRegulations.map((regulation) => {
      const supplierResults = relevantSuppliers.map((supplierInfo) => {
const supplierDoc = supplierLookupMap.get(
  normalizeSupplierName(supplierInfo.supplierName).toLowerCase()
);

        if (!supplierDoc) {
          return {
            supplierName: supplierInfo.supplierName,
            supplierId: null,
            sources: supplierInfo.sources,
            coverageStatus: "missing",
            matchedAssertionsCount: 0,
            bestAssertion: null,
          };
        }

        const key = `${String(supplierDoc._id)}::${String(regulation._id)}`;
        const rawAssertions = assertionsBySupplierAndRegulation.get(key) || [];

        const matchedAssertions = rawAssertions.filter((assertion) =>
          doesAssertionMatchItem(assertion, itemNumber)
        );

        const bestAssertion = pickBestAssertion(matchedAssertions);
        const coverageStatus = mapAssertionToCoverageStatus(bestAssertion);

return {
  supplierName: supplierDoc.supplierName,
  supplierCode: supplierDoc.supplierCode || null,
  supplierId: supplierDoc._id,
  sources: supplierInfo.sources,
  coverageStatus,
  matchedAssertionsCount: matchedAssertions.length,
  bestAssertion: buildAssertionPreview(bestAssertion),
};
      });

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

      return {
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
      };
    });

    return {
      query: result.query,
      normalizedQuery: result.normalizedQuery,
      material: itemNumber,
      suppliers: relevantSuppliers.map((entry) => entry.supplierName),
      regulations: regulationsForMaterial,
    };
  });

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