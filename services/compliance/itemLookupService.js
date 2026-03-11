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