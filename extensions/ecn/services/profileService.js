import { createHash } from "crypto";
import mongoose from "mongoose";
import EcnSheetProfile from "../models/EcnSheetProfile.js";
import { CANONICAL_FIELD_ALIASES } from "../rules/defaultRuleset.js";

export const DEFAULT_ECN_HEADERS = Object.freeze([
  "ECN Number",
  "Status",
  "Requested By",
  "Action Type",
  "Priority",
  "Effect Timing",
  "Item Number",
  "Description",
  "Detailed Description",
  "Reason",
  "Affected Areas",
  "Change Type",
  "Product Manager",
]);

const memoryProfiles = new Map();

export class EcnProfileError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "EcnProfileError";
    this.status = 400;
    this.details = details;
  }
}

export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

export function createHeaderFingerprint(headers) {
  const normalized = (Array.isArray(headers) ? headers : []).map(
    (header, index) => `${index + 1}:${normalizeHeader(header)}`
  );
  return createHash("sha256").update(normalized.join("\n"), "utf8").digest("hex");
}

export function makeColumnBinding(header, ordinal) {
  return `${String(header).trim()}#${Number(ordinal)}`;
}

export function parseColumnBinding(binding) {
  const clean = String(binding ?? "").trim();
  const match = clean.match(/^(.*?)(?:#|::)(\d+)$/);
  if (!match) return { header: clean, ordinal: null };
  return { header: match[1].trim(), ordinal: Number(match[2]) };
}

function toPlainRecord(value) {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultCanonicalAliases() {
  return Object.fromEntries(
    Object.entries(CANONICAL_FIELD_ALIASES).map(([canonical, aliases]) => [canonical, [...aliases]])
  );
}

export function createDefaultSheetProfile() {
  const headerOrder = [...DEFAULT_ECN_HEADERS];
  return {
    version: "draft-unmapped-1",
    headerFingerprint: createHeaderFingerprint(headerOrder),
    expectedHeaders: [...headerOrder],
    headerOrder,
    bindings: {
      ecnNumber: makeColumnBinding("ECN Number", 1),
      status: makeColumnBinding("Status", 2),
      requestedBy: makeColumnBinding("Requested By", 3),
      actionType: makeColumnBinding("Action Type", 4),
      priority: makeColumnBinding("Priority", 5),
      effectTiming: makeColumnBinding("Effect Timing", 6),
      itemNumber: makeColumnBinding("Item Number", 7),
      itemDescription: makeColumnBinding("Description", 8),
      detailedDescription: makeColumnBinding("Detailed Description", 9),
      reason: makeColumnBinding("Reason", 10),
      affectedAreas: makeColumnBinding("Affected Areas", 11),
      changeTypes: makeColumnBinding("Change Type", 12),
      productManager: makeColumnBinding("Product Manager", 13),
    },
    aliases: defaultCanonicalAliases(),
    primaryKeys: ["ecnNumber"],
    statusAliases: {},
    locale: "en",
    confirmed: false,
    mappingState: "needs_remap",
  };
}

function normalizeStoredProfile(value) {
  if (!value) return null;
  const raw = typeof value.toObject === "function" ? value.toObject() : value;
  const profile = {
    version: raw.version,
    headerFingerprint: raw.headerFingerprint,
    expectedHeaders: Array.isArray(raw.expectedHeaders) ? [...raw.expectedHeaders] : [],
    headerOrder: Array.isArray(raw.headerOrder) ? [...raw.headerOrder] : [],
    bindings: toPlainRecord(raw.bindings),
    aliases: { ...defaultCanonicalAliases(), ...toPlainRecord(raw.aliases) },
    primaryKeys: Array.isArray(raw.primaryKeys) ? [...raw.primaryKeys] : [],
    statusAliases: toPlainRecord(raw.statusAliases),
    locale: raw.locale === "ru" ? "ru" : "en",
    confirmed: raw.confirmed === true,
  };
  profile.mappingState = getProfileMappingState(profile);
  return profile;
}

export function getProfileMappingState(profile) {
  const matches = profile?.headerFingerprint === createHeaderFingerprint(profile?.headerOrder || []);
  return profile?.confirmed === true && matches ? "ready" : "needs_remap";
}

export async function getSheetProfileForUser(userId) {
  const key = String(userId);
  if (mongoose.connection.readyState === 1) {
    const stored = await EcnSheetProfile.findOne({ user: key }).lean();
    if (stored) return normalizeStoredProfile(stored);
  }
  return memoryProfiles.has(key)
    ? clone(memoryProfiles.get(key))
    : createDefaultSheetProfile();
}

function validateConfirmation(profile, confirmed) {
  const calculated = createHeaderFingerprint(profile.headerOrder);
  if (calculated !== profile.headerFingerprint) {
    throw new EcnProfileError("Profile header fingerprint does not match headerOrder", [
      "Regenerate headerFingerprint from the exact ordered headers before confirmation.",
    ]);
  }
  if (!confirmed) return;
  if (!profile.primaryKeys.length) {
    throw new EcnProfileError("A confirmed profile must define at least one primary key");
  }
  const missingBindings = profile.primaryKeys.filter((key) => !profile.bindings[key]);
  if (missingBindings.length) {
    throw new EcnProfileError("Every primary key must have a column binding", missingBindings);
  }
  const invalidBindings = [];
  for (const [canonical, binding] of Object.entries(profile.bindings || {})) {
    const parsed = parseColumnBinding(binding);
    const expectedHeader = parsed.ordinal === null ? null : profile.headerOrder[parsed.ordinal - 1];
    if (
      !expectedHeader ||
      normalizeHeader(expectedHeader) !== normalizeHeader(parsed.header)
    ) {
      invalidBindings.push(canonical);
    }
  }
  if (invalidBindings.length) {
    throw new EcnProfileError(
      "Confirmed bindings must use an exact header and its one-based ordinal",
      invalidBindings
    );
  }
}

export async function saveSheetProfileForUser(userId, profile, { confirmed }) {
  validateConfirmation(profile, confirmed);
  const key = String(userId);
  const stored = normalizeStoredProfile({ ...profile, confirmed });
  memoryProfiles.set(key, clone(stored));

  if (mongoose.connection.readyState === 1) {
    await EcnSheetProfile.findOneAndUpdate(
      { user: key },
      {
        $set: {
          version: stored.version,
          headerFingerprint: stored.headerFingerprint,
          expectedHeaders: stored.expectedHeaders,
          headerOrder: stored.headerOrder,
          bindings: stored.bindings,
          aliases: stored.aliases,
          primaryKeys: stored.primaryKeys,
          statusAliases: stored.statusAliases,
          locale: stored.locale,
          confirmed: stored.confirmed,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  return clone(stored);
}

function displayMissingHeader(header, index, headers) {
  const duplicates = headers.filter((candidate) => normalizeHeader(candidate) === normalizeHeader(header));
  return duplicates.length > 1 ? `${header} [${index + 1}]` : header;
}

export function assessSnapshotAgainstProfile(snapshot, profile) {
  const headerOrder = Array.isArray(profile?.headerOrder) ? profile.headerOrder : [];
  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields : [];
  const observedByIndex = new Map();
  let ordinalMismatch = false;

  for (const field of fields) {
    const index = field.ordinal - 1;
    if (index < 0 || index >= headerOrder.length) {
      ordinalMismatch = true;
      continue;
    }
    observedByIndex.set(index, field);
    if (normalizeHeader(field.header) !== normalizeHeader(headerOrder[index])) {
      ordinalMismatch = true;
    }
  }

  const missingColumns = [];
  headerOrder.forEach((header, index) => {
    const field = observedByIndex.get(index);
    if (!field || normalizeHeader(field.header) !== normalizeHeader(header)) {
      missingColumns.push(displayMissingHeader(header, index, headerOrder));
    }
  });

  let completeFingerprintMismatch = false;
  if (snapshot?.captureState === "complete") {
    const observedHeaders = Array.isArray(snapshot.observedHeaders) && snapshot.observedHeaders.length
      ? snapshot.observedHeaders
      : [...fields]
          .sort((left, right) => left.ordinal - right.ordinal)
          .map((field) => field.header);
    completeFingerprintMismatch =
      observedHeaders.length !== headerOrder.length ||
      createHeaderFingerprint(observedHeaders) !== profile?.headerFingerprint;
  }

  const storedProfileInvalid = getProfileMappingState(profile) !== "ready";
  const needsRemap = storedProfileInvalid || ordinalMismatch || completeFingerprintMismatch;
  const readinessAllowed =
    snapshot?.captureState === "complete" &&
    !needsRemap &&
    missingColumns.length === 0;

  return {
    state: snapshot?.captureState || "ambiguous",
    missingColumns,
    profileState: needsRemap ? "needs_remap" : "ready",
    fingerprintMatched: !completeFingerprintMismatch && !ordinalMismatch,
    readinessAllowed,
  };
}

export function resolveCanonicalFields(snapshot, profile, allowedCanonicalFields = null) {
  const allowed = allowedCanonicalFields ? new Set(allowedCanonicalFields) : null;
  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields : [];
  const byOrdinal = new Map(fields.map((field) => [field.ordinal, field]));
  const byHeader = new Map();
  for (const field of fields) {
    const key = normalizeHeader(field.header);
    if (!byHeader.has(key)) byHeader.set(key, []);
    byHeader.get(key).push(field);
  }

  const result = {};
  for (const [canonical, binding] of Object.entries(profile?.bindings || {})) {
    if (allowed && !allowed.has(canonical)) continue;
    const parsed = parseColumnBinding(binding);
    let field = parsed.ordinal === null ? null : byOrdinal.get(parsed.ordinal);
    if (field && normalizeHeader(field.header) !== normalizeHeader(parsed.header)) field = null;
    if (!field && parsed.ordinal === null) {
      field = (byHeader.get(normalizeHeader(parsed.header)) || [])[0] || null;
    }
    if (field) result[canonical] = field.value;
  }
  return result;
}

export function resetEcnProfileMemoryForTests() {
  memoryProfiles.clear();
}
