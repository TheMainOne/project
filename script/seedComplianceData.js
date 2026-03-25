import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import Supplier from "../extensions/sf-compliance/models/Supplier.js";
import Regulation from "../extensions/sf-compliance/models/Regulation.js";
import ComplianceDocument from "../extensions/sf-compliance/models/ComplianceDocument.js";
import ComplianceAssertion from "../extensions/sf-compliance/models/ComplianceAssertion.js";
import seedEntries from "./data.js";

// ======================================================
// Helpers
// ======================================================

function normalizeRegulationCode(code) {
  if (!code || typeof code !== "string") return code;

  const normalized = code.trim();

  const aliases = {
    "REACH": "REACH",
    "EU REACH": "REACH",

    "RoHS": "ROHS",
    "ROHS": "ROHS",
    "EU RoHS": "ROHS",

    "PFAS": "PFAS",
    "PFOS": "PFAS",
    "PFOA": "PFAS",

    "BSE/TSE": "BSE_TSE",
    "BSE": "BSE_TSE",
    "TSE": "BSE_TSE",

    "California Prop 65": "CA_PROP_65",
    "CA Prop 65": "CA_PROP_65",
    "Prop 65": "CA_PROP_65",

    "POPs": "EU_POP",
    "EU POP": "EU_POP",
    "Persistent Organic Pollutants": "EU_POP",

    "TSCA": "TSCA",
    "TSCA PBT": "TSCA",

    "FDA 21 CFR": "FDA_21_CFR",
    "21 CFR": "FDA_21_CFR",

    "Nitrosamine": "NITROSAMINES",
    "Nitrosamines": "NITROSAMINES",

    "Melamine": "MELAMINE",

    "Latex": "LATEX",
    "Natural Rubber Latex": "LATEX",

    "Phthalates": "PHTHALATES",

    "SDS": "SDS_MSDS",
    "MSDS": "SDS_MSDS",

    "Gluten": "GLUTEN",

    "ICH Q3C": "ICH_Q3C",
    "Residual solvent": "ICH_Q3C",
    "Residual Solvents (ICH Q3C)": "ICH_Q3C",

    "Non Pyrogenic": "NON_PYROGENIC",
    "Pyrogen-free": "NON_PYROGENIC",

    "Cytotoxicity": "CYTOTOXICITY",
    "Cytotoxic": "CYTOTOXICITY",

    "DNase": "DNASE_RNASE",
    "RNase": "DNASE_RNASE",
    "DNase-free": "DNASE_RNASE",
    "RNase-free": "DNASE_RNASE",

    "Minamata Convention": "MINAMATA",
    "Mercury Convention": "MINAMATA",

    "Montreal Protocol": "MONTREAL_PROTOCOL",
    "Ozone Depleting Substances": "MONTREAL_PROTOCOL",

    "Canada Toxic Substances": "CANADA_TOXIC_SUBSTANCES",
    "CEPA toxic substances": "CANADA_TOXIC_SUBSTANCES",

    "EU MDR": "EU_MDR",
    "MDR": "EU_MDR",

    "CE": "CE_MARKING",
    "CE Marking": "CE_MARKING",

    "BPR": "EU_BPR",
    "Biocidal Products Regulation": "EU_BPR",

    "BPA": "BPA_DEHP",
    "DEHP": "BPA_DEHP",
    "Bisphenol A": "BPA_DEHP",
    "Bis(2-Ethylhexyl) DEHP": "BPA_DEHP",

    "GMO": "GMO",

    "Allergens": "ALLERGENS",
    "Allergen-free": "ALLERGENS",
  };

  return aliases[normalized] || normalized;
}

function buildRegulationMap(regulations) {
  const map = {};

  for (const reg of regulations) {
    if (!reg?.code) continue;

    map[reg.code] = reg._id;

    // Дополнительно положим upper-case ключ
    map[reg.code.toUpperCase()] = reg._id;
  }

  return map;
}

function resolveRegulationId(regMap, rawCode) {
  const normalizedCode = normalizeRegulationCode(rawCode);

  return (
    regMap[normalizedCode] ||
    regMap[String(normalizedCode).toUpperCase()] ||
    null
  );
}

function buildScope(coverage) {
  if (!coverage || !coverage.type) return {};

  switch (coverage.type) {
    case "supplier_all":
      return {
        allSupplierItems: true,
      };

    case "item_list":
      return {
        dwkItemNumbers: coverage.dwkItemNumbers || [],
      };

    case "supplier_subset":
      return {
        subsetDescription: coverage.description || "",
      };

    default:
      return {};
  }
}

function buildCoverageLevel(coverage) {
  if (!coverage?.type) return "supplier_all";
  return coverage.type;
}

function buildAssertionText({
  supplierName,
  regulationCode,
  assertionType,
  coverage,
}) {
  const actionText =
    assertionType === "free_from"
      ? "is free from"
      : assertionType === "not_present"
      ? "does not contain"
      : "is compliant with";

  if (coverage?.type === "item_list" && coverage?.dwkItemNumbers?.length) {
    return `${supplierName} ${actionText} ${regulationCode} for specific listed items`;
  }

  if (coverage?.type === "supplier_subset" && coverage?.description) {
    return `${supplierName} ${actionText} ${regulationCode} for ${coverage.description}`;
  }

  return `${supplierName} ${actionText} ${regulationCode}`;
}

// ======================================================
// DB helpers
// ======================================================

async function getOrCreateSupplier({
  supplierCode,
  supplierName,
  aliases = [],
}) {
  let supplier = await Supplier.findOne({ supplierCode });

  if (!supplier) {
    supplier = await Supplier.create({
      supplierCode,
      supplierName,
      aliases,
    });

    console.log(`Created supplier: ${supplierName}`);
    return supplier;
  }

  let changed = false;

  if (supplierName && supplier.supplierName !== supplierName) {
    supplier.supplierName = supplierName;
    changed = true;
  }

  if (Array.isArray(aliases) && aliases.length > 0) {
    const existingAliases = Array.isArray(supplier.aliases) ? supplier.aliases : [];
    const mergedAliases = [...new Set([...existingAliases, ...aliases])];

    if (mergedAliases.length !== existingAliases.length) {
      supplier.aliases = mergedAliases;
      changed = true;
    }
  }

  if (changed) {
    await supplier.save();
    console.log(`Updated supplier: ${supplierName}`);
  } else {
    console.log(`Using existing supplier: ${supplierName}`);
  }

  return supplier;
}

async function createDocument({
  supplierId,
  title,
  fileName,
  url,
  documentType = "comprehensive_statement",
  issueDate,
  validUntil = null,
  status = "active",
  provider = "sharepoint",
}) {
  const doc = await ComplianceDocument.create({
    supplierId,
    title,
    fileName,
    storage: {
      provider,
      url: url || "",
    },
    documentType,
    issueDate: issueDate ? new Date(issueDate) : null,
    validUntil: validUntil ? new Date(validUntil) : null,
    status,
  });

  console.log(`Created document: ${title}`);

  return doc;
}

async function createAssertion({
  supplierId,
  documentId,
  regulationId,
  assertionType = "compliant",
  coverageLevel,
  scope,
  statementText,
}) {
  const assertion = await ComplianceAssertion.create({
    supplierId,
    documentId,
    regulationId,
    assertionType,
    coverageLevel,
    scope,
    statementText,
  });

  console.log(`Created assertion: ${assertion._id}`);

  return assertion;
}

// ======================================================
// Seeder core
// ======================================================

async function seedEntry(entry, regMap) {
  const supplier = await getOrCreateSupplier(entry.supplier);

  const document = await createDocument({
    supplierId: supplier._id,
    title: entry.document.title,
    fileName: entry.document.fileName,
    url: entry.document.url,
    documentType: entry.document.documentType,
    issueDate: entry.document.issueDate,
    validUntil: entry.document.validUntil,
    status: entry.document.status,
    provider: entry.document.provider || "sharepoint",
  });

  for (const rawCode of entry.regulations || []) {
    const regulationId = resolveRegulationId(regMap, rawCode);

    if (!regulationId) {
      console.warn(
        `[WARN] Regulation not found in DB: "${rawCode}" (normalized: "${normalizeRegulationCode(rawCode)}")`
      );
      continue;
    }

    await createAssertion({
      supplierId: supplier._id,
      documentId: document._id,
      regulationId,
      assertionType: entry.assertionType || "compliant",
      coverageLevel: buildCoverageLevel(entry.coverage),
      scope: buildScope(entry.coverage),
      statementText:
        entry.statementText ||
        buildAssertionText({
          supplierName: supplier.supplierName,
          regulationCode: normalizeRegulationCode(rawCode),
          assertionType: entry.assertionType || "compliant",
          coverage: entry.coverage,
        }),
    });
  }
}


// ======================================================
// Run
// ======================================================

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing in .env");
  }

  await mongoose.connect(process.env.DATABASE_URL);
  console.log("Connected to DB");

  const regulations = await Regulation.find({});
  const regMap = buildRegulationMap(regulations);

  console.log(
    "Loaded regulation codes:",
    regulations.map((r) => r.code).sort()
  );

  for (const entry of seedEntries) {
    console.log("--------------------------------------------------");
    console.log(
      `Seeding document: ${entry.document.fileName} | Supplier: ${entry.supplier.supplierName}`
    );

    await seedEntry(entry, regMap);
  }

  console.log("Seed completed");
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Seed failed:", err);

  try {
    await mongoose.disconnect();
  } catch (disconnectErr) {
    console.error("Disconnect failed:", disconnectErr);
  }

  process.exit(1);
});