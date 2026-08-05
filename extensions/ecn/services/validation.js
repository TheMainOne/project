const CAPTURE_MODES = new Set(["dom", "paste"]);
const CAPTURE_STATES = new Set(["complete", "partial", "ambiguous"]);
const LANGUAGES = new Set(["en", "ru"]);
const LIFECYCLE_STAGE_VALUES = new Set([
  "Submitted",
  "MDC Validation",
  "Needs Info",
  "Pre-Approval",
  "Rework",
  "Implementation",
  "MDC Verification",
  "Implementation Review",
  "Notifications",
  "Closed",
]);
export const SMARTSHEET_DOM_HOSTS = Object.freeze([
  "app.smartsheet.com",
  "app.smartsheet.eu",
  "app.smartsheetgov.com",
  "app.smartsheet.com.au",
]);
const SMARTSHEET_DOM_HOST_SET = new Set(SMARTSHEET_DOM_HOSTS);

const SNAPSHOT_KEYS = new Set([
  "pageUrl",
  "sheetTitle",
  "rowHint",
  "captureMode",
  "captureState",
  "observedHeaders",
  "fields",
  "capturedAt",
]);
const ROW_HINT_KEYS = new Set(["rowIndex", "primaryValue", "ecnNumber"]);
const FIELD_KEYS = new Set(["header", "ordinal", "value"]);
const PROFILE_KEYS = new Set([
  "version",
  "headerFingerprint",
  "expectedHeaders",
  "headerOrder",
  "bindings",
  "aliases",
  "primaryKeys",
  "statusAliases",
  "locale",
]);
const ANALYZE_KEYS = new Set(["snapshot", "selectedTypes", "language"]);
const PROFILE_BODY_KEYS = new Set(["profile", "confirmed"]);
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
}

function cleanString(value, { max = 500, allowEmpty = false } = {}) {
  if (typeof value !== "string") return null;
  const clean = value.normalize("NFKC").trim();
  if ((!allowEmpty && !clean) || clean.length > max) return null;
  return clean;
}

function validateStringArray(value, path, errors, { maxItems = 500, maxLength = 300 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    errors.push(`${path} must be an array with at most ${maxItems} entries`);
    return [];
  }

  const result = [];
  value.forEach((entry, index) => {
    const clean = cleanString(entry, { max: maxLength });
    if (clean === null) errors.push(`${path}[${index}] must be a non-empty string`);
    else result.push(clean);
  });
  return result;
}

function validateCellValue(value, path, errors, depth = 0) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length <= 10_000) return value;
  if (depth < 3 && Array.isArray(value) && value.length <= 50) {
    return value.map((entry, index) => validateCellValue(entry, `${path}[${index}]`, errors, depth + 1));
  }
  if (depth < 3 && isPlainObject(value) && Object.keys(value).length <= 50) {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      const cleanKey = cleanString(key, { max: 200 });
      if (!cleanKey || FORBIDDEN_OBJECT_KEYS.has(cleanKey)) {
        errors.push(`${path} contains an invalid object key`);
        continue;
      }
      result[cleanKey] = validateCellValue(entry, `${path}.${cleanKey}`, errors, depth + 1);
    }
    return result;
  }
  errors.push(
    `${path} must be bounded JSON data (maximum depth 3, 50 entries, and 10000 characters per string)`
  );
  return null;
}

export function validateDomRowSnapshot(input) {
  const errors = [];
  if (!isPlainObject(input)) return { ok: false, errors: ["snapshot must be an object"] };
  unknownKeys(input, SNAPSHOT_KEYS, "snapshot", errors);

  const pageUrl = cleanString(input.pageUrl, { max: 2_000 });
  if (!pageUrl) errors.push("snapshot.pageUrl is required");
  else {
    try {
      const parsed = new URL(pageUrl);
      if (!["https:", "http:"].includes(parsed.protocol)) errors.push("snapshot.pageUrl must use http or https");
      const host = parsed.hostname.toLocaleLowerCase("en-US");
      if (CAPTURE_MODES.has(input.captureMode)) {
        if (parsed.protocol !== "https:") {
          errors.push("snapshot.pageUrl must use https for ECN capture");
        }
        if (!SMARTSHEET_DOM_HOST_SET.has(host)) {
          errors.push("snapshot.pageUrl must use an allowed Smartsheet application host for ECN capture");
        }
      }
    } catch {
      errors.push("snapshot.pageUrl must be a valid URL");
    }
  }

  const sheetTitle = cleanString(input.sheetTitle, { max: 500 });
  if (!sheetTitle) errors.push("snapshot.sheetTitle is required");

  if (!CAPTURE_MODES.has(input.captureMode)) {
    errors.push("snapshot.captureMode must be dom or paste");
  }
  if (!CAPTURE_STATES.has(input.captureState)) {
    errors.push("snapshot.captureState must be complete, partial, or ambiguous");
  }

  const observedHeaders = validateStringArray(
    input.observedHeaders,
    "snapshot.observedHeaders",
    errors
  );

  const rowHint = {};
  if (!isPlainObject(input.rowHint)) {
    errors.push("snapshot.rowHint must be an object");
  } else {
    unknownKeys(input.rowHint, ROW_HINT_KEYS, "snapshot.rowHint", errors);
    if (input.rowHint.rowIndex !== undefined) {
      if (!Number.isInteger(input.rowHint.rowIndex) || input.rowHint.rowIndex < 0) {
        errors.push("snapshot.rowHint.rowIndex must be a non-negative integer");
      } else rowHint.rowIndex = input.rowHint.rowIndex;
    }
    for (const key of ["primaryValue", "ecnNumber"]) {
      if (input.rowHint[key] !== undefined) {
        const clean = cleanString(input.rowHint[key], { max: 500, allowEmpty: true });
        if (clean === null) errors.push(`snapshot.rowHint.${key} must be a string`);
        else rowHint[key] = clean;
      }
    }
  }

  const fields = [];
  const ordinals = new Set();
  if (!Array.isArray(input.fields) || input.fields.length > 500) {
    errors.push("snapshot.fields must be an array with at most 500 entries");
  } else {
    input.fields.forEach((field, index) => {
      const path = `snapshot.fields[${index}]`;
      if (!isPlainObject(field)) {
        errors.push(`${path} must be an object`);
        return;
      }
      unknownKeys(field, FIELD_KEYS, path, errors);
      const header = cleanString(field.header, { max: 300 });
      if (!header) errors.push(`${path}.header is required`);
      if (!Number.isInteger(field.ordinal) || field.ordinal < 1 || field.ordinal > 10_000) {
        errors.push(`${path}.ordinal must be a positive one-based integer`);
      } else if (ordinals.has(field.ordinal)) {
        errors.push(`${path}.ordinal duplicates another field ordinal`);
      } else {
        ordinals.add(field.ordinal);
      }
      fields.push({
        header: header || "",
        ordinal: field.ordinal,
        value: validateCellValue(field.value, `${path}.value`, errors),
      });
    });
  }

  const capturedAt = cleanString(input.capturedAt, { max: 100 });
  if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) {
    errors.push("snapshot.capturedAt must be an ISO date-time string");
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      pageUrl,
      sheetTitle,
      rowHint,
      captureMode: input.captureMode,
      captureState: input.captureState,
      observedHeaders,
      fields,
      capturedAt: new Date(capturedAt).toISOString(),
    },
  };
}

function validateStringRecord(value, path, errors, { arrayValues = false } = {}) {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return {};
  }
  const entries = Object.entries(value);
  if (entries.length > 500) {
    errors.push(`${path} must contain at most 500 entries`);
    return {};
  }
  const result = {};
  for (const [rawKey, rawValue] of entries) {
    const key = cleanString(rawKey, { max: 200 });
    if (!key || FORBIDDEN_OBJECT_KEYS.has(key)) {
      errors.push(`${path} contains an invalid key`);
      continue;
    }
    if (arrayValues) {
      result[key] = validateStringArray(rawValue, `${path}.${key}`, errors, {
        maxItems: 50,
        maxLength: 300,
      });
    } else {
      const valueString = cleanString(rawValue, { max: 500 });
      if (!valueString) errors.push(`${path}.${key} must be a non-empty string`);
      else result[key] = valueString;
    }
  }
  return result;
}

export function validateSheetProfile(input) {
  const errors = [];
  if (!isPlainObject(input)) return { ok: false, errors: ["profile must be an object"] };
  unknownKeys(input, PROFILE_KEYS, "profile", errors);

  const version = cleanString(input.version, { max: 100 });
  if (!version) errors.push("profile.version is required");
  const headerFingerprint = cleanString(input.headerFingerprint, { max: 128 });
  if (!headerFingerprint || !/^[a-f\d]{64}$/i.test(headerFingerprint)) {
    errors.push("profile.headerFingerprint must be a SHA-256 hex digest");
  }
  const expectedHeaders = validateStringArray(
    input.expectedHeaders,
    "profile.expectedHeaders",
    errors
  );
  const headerOrder = validateStringArray(input.headerOrder, "profile.headerOrder", errors);
  if (headerOrder.length === 0) errors.push("profile.headerOrder must not be empty");
  if (
    expectedHeaders.length !== headerOrder.length ||
    expectedHeaders.some((header, index) => header !== headerOrder[index])
  ) {
    errors.push("profile.expectedHeaders must exactly match profile.headerOrder");
  }
  const bindings = validateStringRecord(input.bindings, "profile.bindings", errors);
  const aliases = input.aliases === undefined
    ? {}
    : validateStringRecord(input.aliases, "profile.aliases", errors, { arrayValues: true });
  const primaryKeys = validateStringArray(input.primaryKeys, "profile.primaryKeys", errors, {
    maxItems: 20,
    maxLength: 200,
  });
  const statusAliases = validateStringRecord(
    input.statusAliases,
    "profile.statusAliases",
    errors
  );
  for (const [statusValue, lifecycleStage] of Object.entries(statusAliases)) {
    if (!LIFECYCLE_STAGE_VALUES.has(lifecycleStage)) {
      errors.push(`profile.statusAliases.${statusValue} must map to a known lifecycle stage`);
    }
  }
  const locale = input.locale === undefined ? "en" : input.locale;
  if (!LANGUAGES.has(locale)) errors.push("profile.locale must be en or ru");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      version,
      headerFingerprint: headerFingerprint.toLowerCase(),
      expectedHeaders,
      headerOrder,
      bindings,
      aliases,
      primaryKeys,
      statusAliases,
      locale,
    },
  };
}

export function validateAnalyzeRequest(input) {
  const errors = [];
  if (!isPlainObject(input)) return { ok: false, errors: ["request body must be an object"] };
  unknownKeys(input, ANALYZE_KEYS, "body", errors);
  const snapshot = validateDomRowSnapshot(input.snapshot);
  if (!snapshot.ok) errors.push(...snapshot.errors);
  const selectedTypes = input.selectedTypes === undefined
    ? []
    : validateStringArray(input.selectedTypes, "body.selectedTypes", errors, {
        maxItems: 25,
        maxLength: 200,
      });
  const language = input.language === undefined ? "en" : input.language;
  if (!LANGUAGES.has(language)) errors.push("body.language must be en or ru");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { snapshot: snapshot.value, selectedTypes, language } };
}

export function validateProfileRequest(input) {
  const errors = [];
  if (!isPlainObject(input)) return { ok: false, errors: ["request body must be an object"] };
  unknownKeys(input, PROFILE_BODY_KEYS, "body", errors);
  const profile = validateSheetProfile(input.profile);
  if (!profile.ok) errors.push(...profile.errors);
  if (typeof input.confirmed !== "boolean") errors.push("body.confirmed must be a boolean");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { profile: profile.value, confirmed: input.confirmed } };
}

export function isSupportedLanguage(value) {
  return LANGUAGES.has(value);
}
