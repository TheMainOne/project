import Item from "../../models/Item.js";

const PACKAGING_SUPPLIERS = [
  "GENERAL PARTITION CO., INC.",
  "VINELAND PACKAGING CORP",
  "GORGO PALLET CO AND LOGISTICS",
  "TAYLOR COMMUNICATIONS",
  "WEBER PACKAGING SOLUTIONS",
  "CROWN PACKAGING CORPORATION",
  "RTS PACKAGING",
  "KELLY PACKAGING LP",
  "CLEARTEC PACKAGING",
  "PACKAGING SERVICES, INC.",
  "UNITED PACKAGING SUPPLY CO",
  "MULTICELL PACKAGING, INC.",
  "ACME CORRUGATED BOX CO. INC.",
  "SEALED AIR CORPORATION (US)",
  "INNOVATIVE COATINGS, INC",
  "DS SMITH PACKAGING-GREENEVILLE",
  "AMERICAN CONTAINER INC",
  "GOTPRINT.COM",
  "PRO-PAK ASSOCIATES INC",
  "ULINE",
  "ATLAS CONTAINER CORPORATION",
  "GEORGE H SWATEK INC",
  "ACME CORRUGATED BOX CO INC",
  "BRADFORD COMPANY",
];

const PACKAGING_KEYWORDS = [
  "CARTON",
  "CASE",
  "BOX",
  "TRAY",
  "PALLET",
  "BAG",
  "WRAP",
  "INSERT",
  "DIVIDER",
  "LABEL",
  "SHRINK",
  "PARTITION"
];

function normalizeKey(value = "") {
  return String(value || "").trim().toUpperCase();
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPackaging(item) {
  const desc = normalizeKey(item?.ItemTextLine);
  const supplierName = normalizeKey(item?.Name);

  if (supplierName && PACKAGING_SUPPLIERS.includes(supplierName)) {
    return true;
  }

  if (!desc) return false;

  return PACKAGING_KEYWORDS.some((keyword) => desc.includes(keyword));
}

function dedupeItems(items = []) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = [
      normalizeKey(item.Material),
      normalizeKey(item.Component),
      normalizeKey(item.CatalogNumber),
      normalizeKey(item.VendorMaterialNumber),
      normalizeKey(item.Name),
      normalizeKey(item.ItemTextLine),
      normalizeKey(item.Plant),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function mapItem(item) {
  return {
    id: String(item._id),
    material: item.Material || "",
    component: item.Component || "",
    catalogNumber: item.CatalogNumber || "",
    description: item.ItemTextLine || "",
    supplierName: item.Name || "",
    vendorMaterialNumber: item.VendorMaterialNumber || "",
    plant: item.Plant || "",
    isPackaging: isPackaging(item),
  };
}

async function findExactMatches(query) {
  const normalized = normalizeKey(query);
  if (!normalized) return [];

  return Item.find({
    $or: [
      { Material: normalized },
      { CatalogNumber: normalized },
      { VendorMaterialNumber: normalized },
    ],
  }).lean();
}

async function findPartialMatches(query) {
  const normalized = normalizeKey(query);
  if (!normalized) return [];

  const safe = escapeRegex(normalized);

  return Item.find({
    $or: [
      { Material: { $regex: safe, $options: "i" } },
      { CatalogNumber: { $regex: safe, $options: "i" } },
      { VendorMaterialNumber: { $regex: safe, $options: "i" } },
    ],
  })
    .limit(50)
    .lean();
}

function preferNonPackaging(matches = []) {
  const nonPackaging = matches.filter((item) => !isPackaging(item));
  return nonPackaging.length > 0 ? nonPackaging : matches;
}

export async function lookupSingleItem(query, options = {}) {
  const normalized = normalizeKey(query);
  if (!normalized) {
    return {
      query: query || "",
      normalizedQuery: "",
      found: false,
      matches: [],
    };
  }

  const allowPartial = options.allowPartial !== false;

  let matches = await findExactMatches(normalized);

  if ((!matches || matches.length === 0) && allowPartial) {
    matches = await findPartialMatches(normalized);
  }

  matches = dedupeItems(matches);
  matches = preferNonPackaging(matches);

  return {
    query,
    normalizedQuery: normalized,
    found: matches.length > 0,
    matches: matches.map(mapItem),
  };
}

export async function bulkLookupItems(queries = [], options = {}) {
  const cleanQueries = Array.from(
    new Set(
      (queries || [])
        .map((q) => String(q || "").trim())
        .filter(Boolean)
    )
  );

  const results = [];
  for (const query of cleanQueries) {
    const result = await lookupSingleItem(query, options);
    results.push(result);
  }

  return results;
}

// ------------------------------
// NEW: component suppliers lookup
// ------------------------------

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((v) => String(v || "").trim())
        .filter(Boolean)
    )
  );
}

async function findBomRowsForMaterial(query) {
  const normalized = normalizeKey(query);
  if (!normalized) {
    return { matchType: "none", rows: [] };
  }

  let rows = await Item.find({ Material: normalized }).lean();

  if (rows.length > 0) {
    return { matchType: "material", rows };
  }

  rows = await Item.find({ CatalogNumber: normalized }).lean();

  if (rows.length > 0) {
    return { matchType: "catalogNumber", rows };
  }

  return { matchType: "none", rows: [] };
}

function groupRowsByComponent(rows = []) {
  const groups = new Map();

  for (const row of rows) {
    const componentKey =
      normalizeKey(row.Component) ||
      `NO_COMPONENT__${normalizeKey(row.Name)}__${normalizeKey(row.ItemTextLine)}`;

    if (!groups.has(componentKey)) {
      groups.set(componentKey, {
        component: row.Component || "",
        descriptions: new Set(),
        suppliers: new Set(),
        vendorMaterialNumbers: new Set(),
        catalogNumbers: new Set(),
        plants: new Set(),
        isPackaging: isPackaging(row),
      });
    }

    const group = groups.get(componentKey);

    if (row.ItemTextLine) group.descriptions.add(String(row.ItemTextLine).trim());
    if (row.Name) group.suppliers.add(String(row.Name).trim());
    if (row.VendorMaterialNumber) {
      group.vendorMaterialNumbers.add(String(row.VendorMaterialNumber).trim());
    }
    if (row.CatalogNumber) group.catalogNumbers.add(String(row.CatalogNumber).trim());
    if (row.Plant) group.plants.add(String(row.Plant).trim());

    if (!isPackaging(row)) {
      group.isPackaging = false;
    }
  }

  return Array.from(groups.values()).map((group) => ({
    component: group.component,
    descriptions: Array.from(group.descriptions),
    suppliers: Array.from(group.suppliers),
    vendorMaterialNumbers: Array.from(group.vendorMaterialNumbers),
    catalogNumbers: Array.from(group.catalogNumbers),
    plants: Array.from(group.plants),
    isPackaging: group.isPackaging,
  }));
}

export async function lookupMaterialComponentSuppliers(query) {
  const normalized = normalizeKey(query);

  if (!normalized) {
    return {
      query: query || "",
      normalizedQuery: "",
      found: false,
      matchType: "none",
      packagingFiltered: false,
      packagingOnly: false,
      material: "",
      catalogNumbers: [],
      supplierCount: 0,
      componentCount: 0,
      suppliers: [],
      components: [],
      rawMatchCount: 0,
    };
  }

  const { matchType, rows } = await findBomRowsForMaterial(normalized);

  if (!rows.length) {
    return {
      query,
      normalizedQuery: normalized,
      found: false,
      matchType: "none",
      packagingFiltered: false,
      packagingOnly: false,
      material: normalized,
      catalogNumbers: [],
      supplierCount: 0,
      componentCount: 0,
      suppliers: [],
      components: [],
      rawMatchCount: 0,
    };
  }

  const dedupedRows = dedupeItems(rows);
  const nonPackagingRows = dedupedRows.filter((row) => !isPackaging(row));
  const packagingFiltered = nonPackagingRows.length > 0;
  const finalRows = packagingFiltered ? nonPackagingRows : dedupedRows;
  const packagingOnly = packagingFiltered ? false : finalRows.every(isPackaging);

  const groupedComponents = groupRowsByComponent(finalRows);

  const suppliers = uniqueStrings(
    groupedComponents.flatMap((component) => component.suppliers || [])
  );

  const catalogNumbers = uniqueStrings(
    finalRows.map((row) => row.CatalogNumber)
  );

  const materialValue =
    finalRows[0]?.Material ||
    normalized;

  return {
    query,
    normalizedQuery: normalized,
    found: true,
    matchType,
    packagingFiltered,
    packagingOnly,
    material: materialValue,
    catalogNumbers,
    supplierCount: suppliers.length,
    componentCount: groupedComponents.length,
    suppliers,
    components: groupedComponents,
    rawMatchCount: dedupedRows.length,
    matches: finalRows.map(mapItem),
  };
}

export async function bulkLookupMaterialComponentSuppliers(queries = []) {
  const cleanQueries = Array.from(
    new Set(
      (queries || [])
        .map((q) => String(q || "").trim())
        .filter(Boolean)
    )
  );

  const results = [];
  for (const query of cleanQueries) {
    const result = await lookupMaterialComponentSuppliers(query);
    results.push(result);
  }

  return results;
}