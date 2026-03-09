import xlsx from "xlsx";
import Supplier from "../models/Supplier.js";
import MaterialCatalog from "../models/MaterialCatalog.js";
import SupplierEvidence from "../models/SupplierEvidence.js";

export const IMPORT_TEMPLATE = {
  preferredSheetName: "Supplier Matrix",
  columns: [
    "Supplier Code",
    "Supplier Name",
    "Material",
    "Regulation",
    "Evidence Type",
    "Evidence ID",
    "Valid To",
  ],
};

const REQUIRED_COLUMNS = new Set(IMPORT_TEMPLATE.columns);

const REGULATION_ALIASES = {
  ROHS2: "ROHS",
  ROHS_2: "ROHS",
  REACHSVHC: "REACH",
  TSCA_TITLEVI: "TSCA",
};

const MATERIAL_ALIASES = {
  STAINLESSSTEEL: "STAINLESS_STEEL",
  SS: "STAINLESS_STEEL",
  AL: "ALUMINUM",
};

function normalizeToken(value, aliases = {}) {
  const base = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (!base) return "";
  return aliases[base] || base;
}

function normalizeDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function buildNaturalKey({ supplierCode, regulation, evidenceType, evidenceId }) {
  return `${supplierCode}::${regulation}::${evidenceType}::${evidenceId}`;
}

function pickSheet(workbook) {
  if (workbook.SheetNames.includes(IMPORT_TEMPLATE.preferredSheetName)) {
    return workbook.Sheets[IMPORT_TEMPLATE.preferredSheetName];
  }
  return workbook.Sheets[workbook.SheetNames[0]];
}

function validateColumns(rows) {
  if (!rows.length) {
    return { ok: false, missing: [...REQUIRED_COLUMNS] };
  }

  const present = new Set(Object.keys(rows[0] || {}));
  const missing = [...REQUIRED_COLUMNS].filter((col) => !present.has(col));
  return { ok: missing.length === 0, missing };
}

export default async function importSupplierMatrixFromBuffer(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
  const worksheet = pickSheet(workbook);

  if (!worksheet) {
    return {
      totalRows: 0,
      imported: 0,
      skipped: 0,
      errors: [{ row: 0, message: "Workbook has no worksheets" }],
      template: IMPORT_TEMPLATE,
    };
  }

  const rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });
  const columnsCheck = validateColumns(rows);

  if (!columnsCheck.ok) {
    return {
      totalRows: rows.length,
      imported: 0,
      skipped: rows.length,
      errors: [
        {
          row: 0,
          message: `Missing required columns: ${columnsCheck.missing.join(", ")}`,
        },
      ],
      template: IMPORT_TEMPLATE,
    };
  }

  const report = {
    totalRows: rows.length,
    imported: 0,
    skipped: 0,
    errors: [],
    template: IMPORT_TEMPLATE,
  };

  const seenKeys = new Set();

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 2;
    const row = rows[i] || {};

    const supplierCode = normalizeToken(row["Supplier Code"]);
    const supplierName = String(row["Supplier Name"] || "").trim();
    const materialCode = normalizeToken(row.Material, MATERIAL_ALIASES);
    const regulation = normalizeToken(row.Regulation, REGULATION_ALIASES);
    const evidenceType = normalizeToken(row["Evidence Type"]);
    const evidenceId = normalizeToken(row["Evidence ID"]);
    const validTo = normalizeDate(row["Valid To"]);

    if (!supplierCode || !supplierName || !materialCode || !regulation || !evidenceType || !evidenceId) {
      report.skipped += 1;
      report.errors.push({ row: rowNumber, message: "Missing required value(s) in row" });
      continue;
    }

    const naturalKey = buildNaturalKey({ supplierCode, regulation, evidenceType, evidenceId });

    if (seenKeys.has(naturalKey)) {
      report.skipped += 1;
      report.errors.push({ row: rowNumber, message: `Duplicate row in file for key ${naturalKey}` });
      continue;
    }

    seenKeys.add(naturalKey);

    try {
      const supplier = await Supplier.findOneAndUpdate(
        { supplierCode },
        { $set: { supplierName } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const material = await MaterialCatalog.findOneAndUpdate(
        { code: materialCode },
        { $setOnInsert: { code: materialCode } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await SupplierEvidence.findOneAndUpdate(
        { supplierCode, regulation, evidenceType, evidenceId },
        {
          $set: {
            supplierId: supplier._id,
            supplierCode,
            materialId: material._id,
            materialCode,
            regulation,
            evidenceType,
            evidenceId,
            validTo,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      report.imported += 1;
    } catch (error) {
      report.skipped += 1;
      report.errors.push({ row: rowNumber, message: error.message });
    }
  }

  return report;
}
