import express from "express";
import ComplianceAuditLog from "../sf-compliance/models/ComplianceAuditLog.js";
import ComplianceDocument from "../sf-compliance/models/ComplianceDocument.js";
import ComplianceAssertion from "../sf-compliance/models/ComplianceAssertion.js";
import Supplier from "../sf-compliance/models/Supplier.js";
import Regulation from "../sf-compliance/models/Regulation.js";
import SupplierOutreach from "../sf-compliance/models/SupplierOutreach.js";
import { requireExtensionAuth, requireExtensionScope } from "../../middlewares/auth.js";
import {
  validateCaseContextBody,
  validateAnalyzeBody,
} from "../../validators/complianceExtension.js";
import { analyzeComplianceCase } from "../services/complianceCaseAnalyzer.js";
import { bulkLookupMaterialComponentSuppliers } from "../../services/compliance/itemLookupService.js";
import { extractRequestedRegulationsFromCase } from "../sf-compliance/services/requestedRegulations.js";
import { getCoverageForLookupResults } from "../services/complianceCoverage.js";
import { getSuppliersLibrary } from "../sf-compliance/services/suppliersLibraryService.js";

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

complianceExtRouter.post(
  "/suppliers-library",
  requireExtensionAuth,
  requireExtensionScope("compliance:read"),
  async (req, res, next) => {
    try {
      const search = String(req.body?.search || "").trim();

      const result = await getSuppliersLibrary({ search });

      await writeAudit({
        userId: req.user.id,
        action: "suppliers-library.read",
        outcome: "success",
      });

      return res.json(result);
    } catch (error) {
      await writeAudit({
        userId: req.user.id,
        action: "suppliers-library.read",
        outcome: "failure",
      });

      next(error);
    }
  }
);

// ============================================================
// POST /regulations — список активных регуляций для формы
// ============================================================

complianceExtRouter.post(
  "/regulations",
  requireExtensionAuth,
  requireExtensionScope("compliance:read"),
  async (req, res) => {
    try {
      const regulations = await Regulation.find({ isActive: true })
        .select("code name category")
        .sort({ code: 1 })
        .lean();

      return res.json({
        ok: true,
        total: regulations.length,
        regulations,
      });
    } catch (error) {
      console.error("[REGULATIONS ROUTE] failed:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);

// ============================================================
// POST /suppliers-search — поиск поставщиков для автокомплита
// ============================================================

complianceExtRouter.post(
  "/suppliers-search",
  requireExtensionAuth,
  requireExtensionScope("compliance:read"),
  async (req, res) => {
    try {
      const search = String(req.body?.q || "").trim().toLowerCase();

      const suppliers = await Supplier.find({})
        .select("supplierCode supplierName aliases")
        .sort({ supplierName: 1 })
        .lean();

      const filtered = search
        ? suppliers.filter((s) => {
            const haystack = [
              s.supplierName,
              s.supplierCode,
              ...(Array.isArray(s.aliases) ? s.aliases : []),
            ]
              .map((v) => String(v || "").toLowerCase())
              .join(" ");

            return haystack.includes(search);
          })
        : suppliers;

      return res.json({
        ok: true,
        total: filtered.length,
        suppliers: filtered.slice(0, 50),
      });
    } catch (error) {
      console.error("[SUPPLIERS-SEARCH ROUTE] failed:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);


// ============================================================
// POST /add-regulation — создание новой регуляции из расширения
// ============================================================

complianceExtRouter.post(
  "/add-regulation",
  requireExtensionAuth,
  requireExtensionScope("compliance:analyze"),
  async (req, res) => {
    try {
      const code = String(req.body?.code || "").trim().toUpperCase();
      const name = String(req.body?.name || "").trim();
      const category = String(req.body?.category || "general").trim();
      const aliases = Array.isArray(req.body?.aliases)
        ? req.body.aliases.map((a) => String(a || "").trim()).filter(Boolean)
        : [];

      if (!code || !name) {
        return res.status(400).json({
          error: "code and name are required",
        });
      }

      const existing = await Regulation.findOne({ code });

      if (existing) {
        return res.status(409).json({
          error: `Regulation with code "${code}" already exists`,
          regulation: {
            id: existing._id,
            code: existing.code,
            name: existing.name,
          },
        });
      }

      const regulation = await Regulation.create({
        code,
        name,
        aliases,
        category,
        isActive: true,
      });

      console.log("[ADD-REGULATION] Created:", regulation.code, regulation.name);

      await writeAudit({
        userId: req.user.id,
        action: "add-regulation",
        outcome: "success",
      });

      return res.json({
        ok: true,
        regulation: {
          id: regulation._id,
          code: regulation.code,
          name: regulation.name,
        },
      });
    } catch (error) {
      console.error("[ADD-REGULATION ROUTE] failed:", error);

      await writeAudit({
        userId: req.user.id,
        action: "add-regulation",
        outcome: "error",
      });

      return res.status(500).json({
        ok: false,
        error: "Failed to add regulation",
        details: error?.message || String(error),
      });
    }
  }
);

// ============================================================
// POST /add-statement — создание стейтмента из расширения
// ============================================================

complianceExtRouter.post(
  "/add-statement",
  requireExtensionAuth,
  requireExtensionScope("compliance:analyze"),
  async (req, res) => {
    try {
      const {
        supplier: supplierInput,
        document: docInput,
        coverage,
        regulations: regulationsInput,
        assertionType,
      } = req.body;

      // ---------- Validation ----------

      if (!supplierInput?.supplierCode || !supplierInput?.supplierName) {
        return res.status(400).json({
          error: "supplier.supplierCode and supplier.supplierName are required",
        });
      }

      if (!docInput?.title || !docInput?.url) {
        return res.status(400).json({
          error: "document.title and document.url are required",
        });
      }

       if (!Array.isArray(regulationsInput) || regulationsInput.length === 0) {
        return res.status(400).json({
           error: "regulations must be a non-empty array",
        });
      }

      const validAssertionTypes = [
        "compliant",
        "free_from",
        "contains",
        "non_compliant",
        "partial",
        "informational",
      ];

      // Accept two shapes:
      //   1) regulations: ["CODE1", "CODE2"] + top-level assertionType (legacy)
      //   2) regulations: [{ code, assertionType }, ...] (per-regulation)
      // Per-regulation type wins; falls back to top-level assertionType.
      const regulationEntries = [];
      for (const entry of regulationsInput) {
        if (typeof entry === "string") {
          regulationEntries.push({ code: entry, assertionType });
        } else if (entry && typeof entry === "object" && entry.code) {
          regulationEntries.push({
            code: entry.code,
            assertionType: entry.assertionType || assertionType,
          });
        } else {
          return res.status(400).json({
            error: "Each regulation must be a code string or { code, assertionType } object",
          });
        }
      }
 
      for (const entry of regulationEntries) {
        if (!validAssertionTypes.includes(entry.assertionType)) {
          return res.status(400).json({
            error: `assertionType for "${entry.code}" must be one of: ${validAssertionTypes.join(", ")}`,
          });
        }
      }

      // ---------- Supplier: find or create ----------

      const normalizedCode = String(supplierInput.supplierCode).trim().toUpperCase();
      const normalizedName = String(supplierInput.supplierName).trim();
      const aliases = Array.isArray(supplierInput.aliases)
        ? [...new Set(supplierInput.aliases.map((a) => String(a || "").trim()).filter(Boolean))]
        : [];

      let supplier = await Supplier.findOne({ supplierCode: normalizedCode });

      if (!supplier) {
        supplier = await Supplier.create({
          supplierCode: normalizedCode,
          supplierName: normalizedName,
          aliases,
        });
        console.log("[ADD-STATEMENT] Created new supplier:", normalizedCode, normalizedName);
      } else {
        const existingAliases = new Set(supplier.aliases || []);
        let changed = false;

        aliases.forEach((alias) => {
          if (!existingAliases.has(alias)) {
            existingAliases.add(alias);
            changed = true;
          }
        });

        if (changed) {
          supplier.aliases = [...existingAliases];
          await supplier.save();
          console.log("[ADD-STATEMENT] Updated aliases for supplier:", normalizedCode);
        }
      }

      // ---------- Document: create ----------

      const complianceDoc = await ComplianceDocument.create({
        supplierId: supplier._id,
        title: docInput.title,
        fileName: docInput.fileName || "",
        storage: {
          provider: "sharepoint",
          url: docInput.url,
          site: docInput.site || "",
          library: docInput.library || "",
          folderPath: docInput.folderPath || "",
          documentId: docInput.documentId || "",
        },
        documentType: docInput.documentType || "certificate",
        source: docInput.source || "supplier",
        issueDate: docInput.issueDate || null,
        receivedDate: docInput.receivedDate || null,
        validUntil: docInput.validUntil || null,
        status: docInput.status || "active",
        notes: docInput.notes || "",
        tags: Array.isArray(docInput.tags) ? docInput.tags : [],
      });

      console.log("[ADD-STATEMENT] Created document:", complianceDoc._id, complianceDoc.title);

      // ---------- Coverage / Scope ----------

      const coverageType = coverage?.type || "supplier_all";

      const validCoverageLevels = [
        "supplier_all",
        "supplier_partial",
        "supplier_subset",
        "item_single",
        "item_list",
        "material_family",
        "component_family",
        "country_specific",
        "plant_specific",
      ];

      const coverageLevel = validCoverageLevels.includes(coverageType)
        ? coverageType
        : "supplier_all";

      const scope = {
        allSupplierItems: coverageLevel === "supplier_all",
        dwkItemNumbers: Array.isArray(coverage?.dwkItemNumbers)
          ? coverage.dwkItemNumbers.map((n) => String(n).trim().toUpperCase()).filter(Boolean)
          : [],
        supplierPartNumbers: Array.isArray(coverage?.supplierPartNumbers)
          ? coverage.supplierPartNumbers.map((n) => String(n).trim().toUpperCase()).filter(Boolean)
          : [],
        families: Array.isArray(coverage?.families)
          ? coverage.families.map((f) => String(f).trim()).filter(Boolean)
          : [],
        countries: Array.isArray(coverage?.countries)
          ? coverage.countries.map((c) => String(c).trim()).filter(Boolean)
          : [],
        plants: Array.isArray(coverage?.plants)
          ? coverage.plants.map((p) => String(p).trim()).filter(Boolean)
          : [],
        notes: coverage?.notes || "",
      };

      // ---------- Assertions: one per regulation ----------

       // Map normalized code -> assertionType; dedupe while keeping first type seen.
      const assertionTypeByCode = new Map();
      for (const entry of regulationEntries) {
        const normalized = String(entry.code).trim().toUpperCase();
        if (!normalized) continue;
        if (!assertionTypeByCode.has(normalized)) {
          assertionTypeByCode.set(normalized, entry.assertionType);
        }
      }
 
      const normalizedRegCodes = [...assertionTypeByCode.keys()];

      const regulations = await Regulation.find({
        code: { $in: normalizedRegCodes },
        isActive: true,
      });

      const foundCodes = new Set(regulations.map((r) => r.code));
      const missingCodes = normalizedRegCodes.filter((c) => !foundCodes.has(c));

      if (missingCodes.length > 0) {
        console.log("[ADD-STATEMENT] Regulations not found in DB:", missingCodes);
      }

      const createdAssertions = [];

      for (const regulation of regulations) {
        const perRegAssertionType = assertionTypeByCode.get(regulation.code);

        const assertion = await ComplianceAssertion.create({
          supplierId: supplier._id,
          documentId: complianceDoc._id,
          regulationId: regulation._id,
          assertionType: perRegAssertionType,
          coverageLevel,
          scope,
          statementText: docInput.statementText || docInput.title || "",
          issueDate: docInput.issueDate || null,
          validUntil: docInput.validUntil || null,
          status: docInput.status || "active",
          confidence: "manual_verified",
        });

        createdAssertions.push({
          assertionId: assertion._id,
          regulationCode: regulation.code,
          regulationName: regulation.name,
          assertionType: perRegAssertionType,
        });

        console.log(
          "[ADD-STATEMENT] Created assertion:",
          assertion._id,
          regulation.code,
          perRegAssertionType
        );
      }

      // ---------- Audit ----------

      await writeAudit({
        userId: req.user.id,
        action: "add-statement",
        outcome: "success",
      });

      // ---------- Response ----------

      return res.json({
        ok: true,
        supplier: {
          id: supplier._id,
          supplierCode: supplier.supplierCode,
          supplierName: supplier.supplierName,
        },
        document: {
          id: complianceDoc._id,
          title: complianceDoc.title,
        },
        assertions: createdAssertions,
        missingRegulations: missingCodes,
      });
    } catch (error) {
      console.error("[ADD-STATEMENT ROUTE] failed:", error);

      await writeAudit({
        userId: req.user.id,
        action: "add-statement",
        outcome: "error",
      });

      return res.status(500).json({
        ok: false,
        error: "Failed to add statement",
        details: error?.message || String(error),
      });
    }
  }
);


// ============================================================
// POST /refresh-document — обновление дат для существующего
// документа без повторной загрузки. Подходит для случая, когда
// поставщик присылает тот же документ с новыми датами.
// ============================================================

complianceExtRouter.post(
  "/refresh-document",
  requireExtensionAuth,
  requireExtensionScope("compliance:analyze"),
  async (req, res) => {
    try {
      const documentId = String(req.body?.documentId || "").trim();
      const issueDateRaw = req.body?.issueDate ?? null;
      const validUntilRaw = req.body?.validUntil ?? null;
      const receivedDateRaw = req.body?.receivedDate ?? null;
      const cascadeAssertions = req.body?.cascadeAssertions !== false;
      const reactivate = req.body?.reactivate !== false;
      const notes = typeof req.body?.notes === "string" ? req.body.notes : null;

      if (!documentId) {
        return res.status(400).json({ ok: false, error: "documentId is required" });
      }

      const parseDate = (value, label) => {
        if (value === null || value === undefined || value === "") return null;
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid ${label}`);
        }
        return date;
      };

      let issueDate, validUntil, receivedDate;
      try {
        issueDate = parseDate(issueDateRaw, "issueDate");
        validUntil = parseDate(validUntilRaw, "validUntil");
        receivedDate = parseDate(receivedDateRaw, "receivedDate");
      } catch (parseError) {
        return res.status(400).json({ ok: false, error: parseError.message });
      }

      if (issueDateRaw === undefined && validUntilRaw === undefined && receivedDateRaw === undefined) {
        return res.status(400).json({
          ok: false,
          error: "At least one of issueDate, validUntil, or receivedDate must be provided",
        });
      }

      const document = await ComplianceDocument.findById(documentId);
      if (!document) {
        return res.status(404).json({ ok: false, error: "Document not found" });
      }

      const docUpdate = {};
      if (issueDateRaw !== undefined) docUpdate.issueDate = issueDate;
      if (validUntilRaw !== undefined) docUpdate.validUntil = validUntil;
      if (receivedDateRaw !== undefined) {
        docUpdate.receivedDate = receivedDate || new Date();
      }
      if (notes !== null) docUpdate.notes = notes;

      if (reactivate && document.status === "expired") {
        const stillValid = !validUntil || validUntil.getTime() >= Date.now();
        if (stillValid) docUpdate.status = "active";
      }

      Object.assign(document, docUpdate);
      await document.save();

      let assertionsUpdated = 0;
      if (cascadeAssertions) {
        const assertionUpdate = {};
        if (issueDateRaw !== undefined) assertionUpdate.issueDate = issueDate;
        if (validUntilRaw !== undefined) assertionUpdate.validUntil = validUntil;

        if (Object.keys(assertionUpdate).length > 0) {
          const result = await ComplianceAssertion.updateMany(
            { documentId: document._id },
            { $set: assertionUpdate }
          );
          assertionsUpdated = result.modifiedCount || result.nModified || 0;
        }

        if (reactivate) {
          const stillValid = !validUntil || validUntil.getTime() >= Date.now();
          if (stillValid) {
            await ComplianceAssertion.updateMany(
              { documentId: document._id, status: "expired" },
              { $set: { status: "active" } }
            );
          }
        }
      }

      await writeAudit({
        userId: req.user.id,
        action: "refresh-document",
        outcome: "success",
      });

      return res.json({
        ok: true,
        document: {
          id: String(document._id),
          title: document.title,
          fileName: document.fileName,
          issueDate: document.issueDate,
          validUntil: document.validUntil,
          receivedDate: document.receivedDate,
          status: document.status,
        },
        assertionsUpdated,
      });
    } catch (error) {
      console.error("[REFRESH-DOCUMENT ROUTE] failed:", error);

      await writeAudit({
        userId: req.user.id,
        action: "refresh-document",
        outcome: "error",
      });

      return res.status(500).json({
        ok: false,
        error: "Failed to refresh document",
        details: error?.message || String(error),
      });
    }
  }
);

// ============================================================
// Outreach tracker — CRUD
// ============================================================

complianceExtRouter.get(
  "/outreach",
  requireExtensionAuth,
  requireExtensionScope("compliance:read"),
  async (req, res) => {
    try {
      const filter = {};
      if (req.query.supplierId) filter.supplierId = req.query.supplierId;
      if (req.query.caseId) filter.caseId = req.query.caseId;
      if (req.query.status) filter.status = req.query.status;

      const records = await SupplierOutreach.find(filter)
        .sort({ sentAt: -1 })
        .lean();

      await writeAudit({ userId: req.user.id, action: "outreach.list", outcome: "success" });

      return res.json({ ok: true, total: records.length, records });
    } catch (error) {
      console.error("[OUTREACH GET] failed:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);

complianceExtRouter.post(
  "/outreach",
  requireExtensionAuth,
  requireExtensionScope("compliance:read"),
  async (req, res) => {
    try {
      const {
        supplierId,
        supplierName,
        caseId,
        contactEmail,
        subject,
        method,
        sentAt,
        nextFollowUpAt,
        notes,
        regulationTags,
      } = req.body;

      if (!supplierId || !supplierName || !subject) {
        return res.status(400).json({ error: "supplierId, supplierName, and subject are required" });
      }

      const record = await SupplierOutreach.create({
        supplierId,
        supplierName: String(supplierName).trim(),
        caseId: caseId || null,
        contactEmail: contactEmail || "",
        subject: String(subject).trim(),
        method: method || "email",
        sentAt: sentAt ? new Date(sentAt) : new Date(),
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
        status: nextFollowUpAt ? "awaiting" : "sent",
        notes: notes || "",
        createdBy: req.user.id,
        regulationTags: Array.isArray(regulationTags) ? regulationTags : [],
      });

      await writeAudit({ userId: req.user.id, action: "outreach.create", outcome: "success" });

      return res.json({ ok: true, record });
    } catch (error) {
      console.error("[OUTREACH POST] failed:", error);
      await writeAudit({ userId: req.user.id, action: "outreach.create", outcome: "error" });
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);

complianceExtRouter.patch(
  "/outreach/:id",
  requireExtensionAuth,
  requireExtensionScope("compliance:read"),
  async (req, res) => {
    try {
      const allowed = ["status", "respondedAt", "notes", "nextFollowUpAt", "contactEmail"];
      const setUpdate = {};
      for (const key of allowed) {
        if (key in req.body) setUpdate[key] = req.body[key];
      }

     if (setUpdate.status === "responded" && !setUpdate.respondedAt) {
        setUpdate.respondedAt = new Date();
      }

      const followUpAgain = req.body?.followUpAgain === true;
      const updateOps = {};
      if (Object.keys(setUpdate).length > 0) {
        updateOps.$set = setUpdate;
      }

      if (followUpAgain) {
        const followUpAt = req.body.followUpAt ? new Date(req.body.followUpAt) : new Date();
        if (isNaN(followUpAt.getTime())) {
          return res.status(400).json({ ok: false, error: "Invalid followUpAt date" });
        }

        const nextFollowUpAt =
          req.body.nextFollowUpAt && !isNaN(new Date(req.body.nextFollowUpAt).getTime())
            ? new Date(req.body.nextFollowUpAt)
            : null;

        updateOps.$set = {
          ...(updateOps.$set || {}),
          status: "awaiting",
          lastFollowedUpAt: followUpAt,
        };
        updateOps.$inc = { followUpCount: 1 };
        updateOps.$push = {
          followUpEvents: {
            at: followUpAt,
            nextFollowUpAt,
            by: req.user.id,
          },
        };
      }

      if (Object.keys(updateOps).length === 0) {
        return res.status(400).json({ ok: false, error: "No valid fields to update" });
      }

      const record = await SupplierOutreach.findByIdAndUpdate(
        req.params.id,
         updateOps,
        { new: true }
      ).lean();

      if (!record) return res.status(404).json({ error: "Record not found" });

      await writeAudit({ userId: req.user.id, action: "outreach.update", outcome: "success" });

      return res.json({ ok: true, record });
    } catch (error) {
      console.error("[OUTREACH PATCH] failed:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);

complianceExtRouter.delete(
  "/outreach/:id",
  requireExtensionAuth,
  requireExtensionScope("compliance:read"),
  async (req, res) => {
    try {
      const record = await SupplierOutreach.findByIdAndDelete(req.params.id).lean();
      if (!record) return res.status(404).json({ error: "Record not found" });

      await writeAudit({ userId: req.user.id, action: "outreach.delete", outcome: "success" });

      return res.json({ ok: true });
    } catch (error) {
      console.error("[OUTREACH DELETE] failed:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Supplier contacts
// ─────────────────────────────────────────────────────────────────────────────

complianceExtRouter.post(
  "/suppliers/:supplierId/contacts",
  requireExtensionAuth,
  requireExtensionScope("compliance:read"),
  async (req, res) => {
    try {
      const { name, email, phone, role, notes } = req.body;
      if (!name) return res.status(400).json({ ok: false, error: "name is required" });

      const supplier = await Supplier.findById(req.params.supplierId);
      if (!supplier) return res.status(404).json({ ok: false, error: "Supplier not found" });

      supplier.contacts.push({ name, email: email || "", phone: phone || "", role: role || "", notes: notes || "" });
      await supplier.save();

      const contact = supplier.contacts[supplier.contacts.length - 1];
      await writeAudit({ userId: req.user.id, action: "supplier-contact.create", outcome: "success" });
      return res.json({ ok: true, contact: { contactId: String(contact._id), name: contact.name, email: contact.email, phone: contact.phone, role: contact.role, notes: contact.notes } });
    } catch (error) {
      console.error("[SUPPLIER CONTACT POST] failed:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);

complianceExtRouter.patch(
  "/suppliers/:supplierId/contacts/:contactId",
  requireExtensionAuth,
  requireExtensionScope("compliance:read"),
  async (req, res) => {
    try {
      const supplier = await Supplier.findById(req.params.supplierId);
      if (!supplier) return res.status(404).json({ ok: false, error: "Supplier not found" });

      const contact = supplier.contacts.id(req.params.contactId);
      if (!contact) return res.status(404).json({ ok: false, error: "Contact not found" });

      const allowed = ["name", "email", "phone", "role", "notes"];
      for (const key of allowed) {
        if (key in req.body) contact[key] = req.body[key];
      }
      await supplier.save();

      await writeAudit({ userId: req.user.id, action: "supplier-contact.update", outcome: "success" });
      return res.json({ ok: true, contact: { contactId: String(contact._id), name: contact.name, email: contact.email, phone: contact.phone, role: contact.role, notes: contact.notes } });
    } catch (error) {
      console.error("[SUPPLIER CONTACT PATCH] failed:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);

complianceExtRouter.delete(
  "/suppliers/:supplierId/contacts/:contactId",
  requireExtensionAuth,
  requireExtensionScope("compliance:read"),
  async (req, res) => {
    try {
      const supplier = await Supplier.findById(req.params.supplierId);
      if (!supplier) return res.status(404).json({ ok: false, error: "Supplier not found" });

      const contact = supplier.contacts.id(req.params.contactId);
      if (!contact) return res.status(404).json({ ok: false, error: "Contact not found" });

      contact.deleteOne();
      await supplier.save();

      await writeAudit({ userId: req.user.id, action: "supplier-contact.delete", outcome: "success" });
      return res.json({ ok: true });
    } catch (error) {
      console.error("[SUPPLIER CONTACT DELETE] failed:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);

export default complianceExtRouter;