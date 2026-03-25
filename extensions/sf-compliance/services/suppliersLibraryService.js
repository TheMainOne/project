import ComplianceAssertion from "../models/ComplianceAssertion.js";
import ComplianceDocument from "../models/ComplianceDocument.js";
import Supplier from "../models/Supplier.js";
import Regulation from "../models/Regulation.js";


function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDocumentForLibrary(doc) {
  if (!doc) return null;

  return {
    documentId: String(doc._id),
    title: doc.title || "",
    fileName: doc.fileName || "",
    documentType: doc.documentType || "",
    source: doc.source || "",
    status: doc.status || "",
    issueDate: doc.issueDate || null,
    receivedDate: doc.receivedDate || null,
    validUntil: doc.validUntil || null,
    storage: {
      provider: doc?.storage?.provider || "",
      url: doc?.storage?.url || "",
      site: doc?.storage?.site || "",
      library: doc?.storage?.library || "",
      folderPath: doc?.storage?.folderPath || "",
      documentId: doc?.storage?.documentId || "",
    },
  };
}

function formatAssertionForLibrary(assertion, regulation, document) {
  return {
    assertionId: String(assertion._id),
    regulation: regulation
      ? {
          id: String(regulation._id),
          code: regulation.code || "",
          name: regulation.name || "",
        }
      : {
          id: String(assertion.regulationId || ""),
          code: "",
          name: "",
        },
    assertionType: assertion.assertionType || "",
    coverageLevel: assertion.coverageLevel || "",
    statementText: assertion.statementText || "",
    status: assertion.status || "",
    confidence: assertion.confidence || "",
    issueDate: assertion.issueDate || null,
    validUntil: assertion.validUntil || null,
    scope: {
      allSupplierItems: Boolean(assertion?.scope?.allSupplierItems),
      dwkItemNumbers: Array.isArray(assertion?.scope?.dwkItemNumbers)
        ? assertion.scope.dwkItemNumbers
        : [],
      supplierPartNumbers: Array.isArray(assertion?.scope?.supplierPartNumbers)
        ? assertion.scope.supplierPartNumbers
        : [],
      families: Array.isArray(assertion?.scope?.families)
        ? assertion.scope.families
        : [],
      countries: Array.isArray(assertion?.scope?.countries)
        ? assertion.scope.countries
        : [],
      plants: Array.isArray(assertion?.scope?.plants)
        ? assertion.scope.plants
        : [],
      notes: assertion?.scope?.notes || "",
    },
    document: document
      ? {
          documentId: String(document._id),
          title: document.title || "",
          fileName: document.fileName || "",
          url: document?.storage?.url || "",
          provider: document?.storage?.provider || "",
          issueDate: document.issueDate || null,
          validUntil: document.validUntil || null,
          status: document.status || "",
        }
      : null,
  };
}

function buildRegulationSummary(assertions, regulationById) {
  const grouped = new Map();

  assertions.forEach((assertion) => {
    const regulationId = String(assertion.regulationId || "");
    if (!regulationId) return;

    if (!grouped.has(regulationId)) {
      grouped.set(regulationId, []);
    }

    grouped.get(regulationId).push(assertion);
  });

  const summary = [];

  grouped.forEach((items, regulationId) => {
    const regulation = regulationById.get(regulationId);

    const activeItems = items.filter(
      (item) => String(item.status || "").toLowerCase() === "active"
    );

    let status = "covered";
    if (!activeItems.length && items.length) {
      status = "expired";
    }

    summary.push({
      regulationId,
      regulationCode: regulation?.code || "",
      regulationName: regulation?.name || "",
      status,
      statementsCount: items.length,
      activeStatementsCount: activeItems.length,
    });
  });

  summary.sort((a, b) => {
    const codeA = a.regulationCode || "";
    const codeB = b.regulationCode || "";
    return codeA.localeCompare(codeB);
  });

  return summary;
}

export async function getSuppliersLibrary({ search = "" } = {}) {
  const normalizedSearch = normalizeSearchValue(search);

  const [
    suppliers,
    documents,
    assertions,
    regulations,
  ] = await Promise.all([
    Supplier.find({})
      .sort({ supplierName: 1, supplierCode: 1 })
      .lean(),
    ComplianceDocument.find({})
      .sort({ issueDate: -1, createdAt: -1 })
      .lean(),
    ComplianceAssertion.find({})
      .sort({ createdAt: -1 })
      .lean(),
    Regulation.find({})
      .lean(),
  ]);

  const regulationById = new Map(
    regulations.map((reg) => [String(reg._id), reg])
  );

  const documentsBySupplierId = new Map();
  documents.forEach((doc) => {
    const supplierId = String(doc.supplierId || "");
    if (!supplierId) return;

    if (!documentsBySupplierId.has(supplierId)) {
      documentsBySupplierId.set(supplierId, []);
    }

    documentsBySupplierId.get(supplierId).push(doc);
  });

  const assertionsBySupplierId = new Map();
  assertions.forEach((assertion) => {
    const supplierId = String(assertion.supplierId || "");
    if (!supplierId) return;

    if (!assertionsBySupplierId.has(supplierId)) {
      assertionsBySupplierId.set(supplierId, []);
    }

    assertionsBySupplierId.get(supplierId).push(assertion);
  });

  const documentById = new Map(
    documents.map((doc) => [String(doc._id), doc])
  );

  const library = suppliers.map((supplier) => {
    const supplierId = String(supplier._id);
    const supplierDocuments = documentsBySupplierId.get(supplierId) || [];
    const supplierAssertions = assertionsBySupplierId.get(supplierId) || [];

    const formattedDocuments = supplierDocuments.map(formatDocumentForLibrary);

    const formattedAssertions = supplierAssertions.map((assertion) => {
      const regulation = regulationById.get(String(assertion.regulationId || ""));
      const document = documentById.get(String(assertion.documentId || ""));

      return formatAssertionForLibrary(assertion, regulation, document);
    });

    const regulationSummary = buildRegulationSummary(
      supplierAssertions,
      regulationById
    );

    return {
      supplierId,
      supplierName: supplier.supplierName || "",
      supplierCode: supplier.supplierCode || "",
      aliases: Array.isArray(supplier.aliases) ? supplier.aliases : [],
      documentsCount: formattedDocuments.length,
      assertionsCount: formattedAssertions.length,
      regulationSummary,
      documents: formattedDocuments,
      assertions: formattedAssertions,
    };
  });

  const filteredSuppliers = !normalizedSearch
    ? library
    : library.filter((supplier) => {
        const haystack = [
          supplier.supplierName,
          supplier.supplierCode,
          ...(Array.isArray(supplier.aliases) ? supplier.aliases : []),
        ]
          .map((value) => normalizeSearchValue(value))
          .filter(Boolean)
          .join(" | ");

        return haystack.includes(normalizedSearch);
      });

  return {
    ok: true,
    total: filteredSuppliers.length,
    suppliers: filteredSuppliers,
  };
}