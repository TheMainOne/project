import SupplierEvidence from "../models/SupplierEvidence.js";

function isExpired(evidence) {
  if (evidence.status === "expired") return true;
  if (!evidence.validUntil) return false;
  return new Date(evidence.validUntil).getTime() < Date.now();
}

function buildMatcher(requirement) {
  const value = String(requirement.value || "").toLowerCase();

  if (requirement.type === "material") {
    return (e) => String(e.material || "").toLowerCase() === value;
  }
  if (requirement.type === "jurisdiction") {
    return (e) => String(e.jurisdiction || "").toLowerCase() === value;
  }
  if (requirement.type === "regulation") {
    return (e) =>
      String(e.regulationKey || "").toLowerCase() === value ||
      String(e.regulationName || "").toLowerCase().includes(value);
  }
  if (requirement.type === "document") {
    return (e) => String(e.documentType || "").toLowerCase() === value;
  }
  return () => false;
}

export default async function matchEvidence({ requirements = [] }) {
  const evidencePool = await SupplierEvidence.find({}).lean();

  return requirements.map((requirement) => {
    const matcher = buildMatcher(requirement);
    const hits = evidencePool.filter(matcher);

    if (!hits.length) {
      return {
        requirementId: requirement.id,
        type: requirement.type,
        value: requirement.value,
        details: requirement.details || null,
        status: "missing",
        evidenceRefs: [],
        explainability: {
          matchedFields: [],
          regulationVersionUsed: null,
          reason: "No SupplierEvidence records matched required field values",
        },
      };
    }

    const hasExpiredOnly = hits.every(isExpired);
    const hasActive = hits.some((item) => !isExpired(item));
    const hasVersionMismatch =
      requirement.type === "regulation" &&
      requirement.details &&
      hits.every(
        (item) => String(item.regulationVersion || "").toLowerCase() !== String(requirement.details).toLowerCase()
      );

    let status = "covered";
    if (hasExpiredOnly) status = "expired";
    else if (!hasActive || hasVersionMismatch) status = "needs-review";

    const first = hits[0];
    return {
      requirementId: requirement.id,
      type: requirement.type,
      value: requirement.value,
      details: requirement.details || null,
      status,
      evidenceRefs: hits.map((item) => item._id),
      explainability: {
        matchedFields:
          requirement.type === "material"
            ? ["material"]
            : requirement.type === "jurisdiction"
              ? ["jurisdiction"]
              : requirement.type === "regulation"
                ? ["regulationKey", "regulationName"]
                : ["documentType"],
        regulationVersionUsed: first.regulationVersion || null,
        reason:
          status === "covered"
            ? "Evidence found with matching fields and active validity"
            : status === "expired"
              ? "Only expired evidence matched this requirement"
              : "Evidence matched partially; manual review required for version/validity",
      },
    };
  });
}
