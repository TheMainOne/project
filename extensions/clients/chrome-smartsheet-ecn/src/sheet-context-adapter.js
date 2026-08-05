export class SheetContextAdapter {
  async capture() {
    throw new Error("SheetContextAdapter.capture() must be implemented");
  }

  async diagnostics() {
    return null;
  }
}

export const ECN_LIFECYCLE_STAGES = Object.freeze([
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

function normalizeMappingValue(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function profileCanonicalFields(profile = {}) {
  return Array.from(new Set([
    ...Object.keys(profile.bindings || {}),
    ...Object.keys(profile.aliases || {}),
    ...(Array.isArray(profile.primaryKeys) ? profile.primaryKeys : []),
  ]));
}

export function suggestProfileBindings(profile = {}, headers = []) {
  const normalizedHeaders = headers.map(normalizeMappingValue);
  const result = {};
  for (const canonical of profileCanonicalFields(profile)) {
    const binding = profile.bindings?.[canonical];
    const match = typeof binding === "string" ? binding.match(/^(.*?)(?:#|::)(\d+)$/) : null;
    const currentHeader = normalizeMappingValue(match?.[1] || "");
    const currentOrdinal = Number(match?.[2] || 0);
    if (
      currentHeader &&
      currentOrdinal > 0 &&
      normalizedHeaders[currentOrdinal - 1] === currentHeader
    ) {
      result[canonical] = currentOrdinal;
      continue;
    }
    const aliases = [canonical, ...(Array.isArray(profile.aliases?.[canonical]) ? profile.aliases[canonical] : [])]
      .map(normalizeMappingValue)
      .filter(Boolean);
    const candidates = normalizedHeaders
      .map((header, index) => ({ header, ordinal: index + 1 }))
      .filter(({ header }) => aliases.includes(header));
    if (candidates.length === 1) result[canonical] = candidates[0].ordinal;
  }
  return result;
}

export function parseStatusAliasLines(input) {
  const aliases = {};
  const stageLookup = new Map(ECN_LIFECYCLE_STAGES.map((stage) => [normalizeMappingValue(stage), stage]));
  const lines = String(input ?? "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    const separator = line.includes("=") ? line.indexOf("=") : line.indexOf("\t");
    if (separator <= 0) {
      const error = new Error(`STATUS_ALIAS_FORMAT:${index + 1}`);
      error.code = "STATUS_ALIAS_FORMAT";
      error.line = index + 1;
      throw error;
    }
    const liveValue = line.slice(0, separator).trim();
    const requestedStage = line.slice(separator + 1).trim();
    const stage = stageLookup.get(normalizeMappingValue(requestedStage));
    if (!liveValue || !stage || ["__proto__", "prototype", "constructor"].includes(liveValue)) {
      const error = new Error(`STATUS_ALIAS_VALUE:${index + 1}`);
      error.code = "STATUS_ALIAS_VALUE";
      error.line = index + 1;
      throw error;
    }
    if (Object.hasOwn(aliases, liveValue) && aliases[liveValue] !== stage) {
      const error = new Error(`STATUS_ALIAS_DUPLICATE:${index + 1}`);
      error.code = "STATUS_ALIAS_DUPLICATE";
      error.line = index + 1;
      throw error;
    }
    aliases[liveValue] = stage;
  }
  return aliases;
}

export function formatStatusAliasLines(aliases = {}) {
  return Object.entries(aliases).map(([liveValue, stage]) => `${liveValue} = ${stage}`).join("\n");
}

export function parseSingleTsvRow(input) {
  const source = String(input ?? "");
  const rows = [[]];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "\t" && !quoted) {
      rows.at(-1).push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      rows.at(-1).push(value);
      value = "";
      rows.push([]);
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("TSV_UNCLOSED_QUOTE");
  rows.at(-1).push(value);

  while (rows.length > 1 && rows.at(-1).every((cell) => cell === "")) rows.pop();
  if (rows.length !== 1) throw new Error("TSV_MULTIPLE_ROWS");
  return rows[0];
}

function profileOrder(profile) {
  if (Array.isArray(profile?.headerOrder) && profile.headerOrder.length) return profile.headerOrder;
  if (Array.isArray(profile?.expectedHeaders) && profile.expectedHeaders.length) return profile.expectedHeaders;
  return [];
}

function profileIsConfirmed(profile) {
  const state = String(profile?.mappingState || profile?.state || profile?.status || "").toLowerCase();
  return Boolean(profile) && state !== "needs_remap" && state !== "draft" && profile?.confirmed !== false;
}

export function isAllowedSmartsheetPageUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" && [
      "app.smartsheet.com",
      "app.smartsheet.com.au",
      "app.smartsheet.eu",
      "app.smartsheetgov.com",
    ].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export class PasteRowSheetContextAdapter extends SheetContextAdapter {
  constructor({ profile, input, pageUrl = "", sheetTitle = "Pasted row" }) {
    super();
    this.profile = profile;
    this.input = input;
    this.pageUrl = pageUrl;
    this.sheetTitle = sheetTitle;
  }

  async capture() {
    if (!isAllowedSmartsheetPageUrl(this.pageUrl)) {
      const error = new Error("SMARTSHEET_CONTEXT_REQUIRED");
      error.code = "SMARTSHEET_CONTEXT_REQUIRED";
      throw error;
    }
    const headers = profileOrder(this.profile);
    if (!headers.length) {
      const error = new Error("SHEET_PROFILE_REQUIRED");
      error.code = "SHEET_PROFILE_REQUIRED";
      throw error;
    }
    const cells = parseSingleTsvRow(this.input);
    if (cells.length !== headers.length) {
      const error = new Error(`TSV_COLUMN_COUNT:${cells.length}:${headers.length}`);
      error.code = "TSV_COLUMN_COUNT";
      error.actual = cells.length;
      error.expected = headers.length;
      throw error;
    }

    const fields = headers.map((header, index) => ({ header, ordinal: index + 1, value: cells[index] }));
    const primaryKeys = Array.isArray(this.profile?.primaryKeys) ? this.profile.primaryKeys : [];
    let primary = null;
    for (const canonical of primaryKeys) {
      const binding = this.profile?.bindings?.[canonical];
      const match = typeof binding === "string" ? binding.match(/^(.*?)(?:#|::)(\d+)$/) : null;
      const boundHeader = typeof binding === "string" ? (match?.[1] || binding) : binding?.header;
      const boundOrdinal = Number(match?.[2] || binding?.ordinal || 0);
      primary = fields.find((field) => (
        (!boundHeader || String(field.header).trim().toLowerCase() === String(boundHeader).trim().toLowerCase()) &&
        (!boundOrdinal || field.ordinal === boundOrdinal)
      ));
      if (primary) break;
    }
    if (!primary) {
      const literalHeaders = primaryKeys.map((header) => String(header).trim().toLowerCase());
      primary = fields.find((field) => literalHeaders.includes(String(field.header).trim().toLowerCase()));
    }
    const ecn = fields.find((field) => /(^|\b)(ecn|engineering change)(\b|\s*#)/i.test(field.header));
    const rowHint = {};
    if (primary?.value) rowHint.primaryValue = String(primary.value).trim();
    if (ecn?.value) rowHint.ecnNumber = String(ecn.value).trim();

    return {
      pageUrl: this.pageUrl,
      sheetTitle: this.sheetTitle,
      rowHint,
      captureMode: "paste",
      captureState: profileIsConfirmed(this.profile) ? "complete" : "ambiguous",
      observedHeaders: [...headers],
      fields,
      capturedAt: new Date().toISOString(),
      captureMeta: {
        missingColumns: [],
        unexpectedColumns: [],
        reasons: profileIsConfirmed(this.profile) ? [] : ["profile_needs_remap"],
      },
    };
  }
}

export class DomMessageSheetContextAdapter extends SheetContextAdapter {
  constructor(runtime = globalThis.chrome?.runtime) {
    super();
    if (!runtime?.sendMessage) throw new Error("Chrome runtime is unavailable");
    this.runtime = runtime;
  }

  async capture() {
    const response = await this.runtime.sendMessage({ type: "ECN_CAPTURE_ACTIVE_ROW" });
    if (!response?.ok) throw new Error(response?.error || "CAPTURE_FAILED");
    return response.snapshot;
  }

  async diagnostics() {
    const response = await this.runtime.sendMessage({ type: "ECN_GET_SELECTOR_DIAGNOSTICS" });
    if (!response?.ok) throw new Error(response?.error || "DIAGNOSTICS_FAILED");
    return response.diagnostics;
  }
}

export function enforceReadinessGuard(analysis, snapshot) {
  const profileReady = analysis?.capture?.profileState !== "needs_remap" &&
    analysis?.capture?.readinessAllowed !== false;
  const complete = snapshot?.captureState === "complete" && profileReady;
  if (complete) return { ...analysis, clientGuard: { finalReadinessAllowed: true } };

  const protectedStage = /(approval|ready|readiness|clos|notification)/i;
  const gates = Array.isArray(analysis?.gates)
    ? analysis.gates.map((gate) => (
      gate?.status === "pass" && protectedStage.test(String(gate?.stage || ""))
        ? { ...gate, status: "unknown", clientGuarded: true }
        : gate
    ))
    : [];

  return {
    ...analysis,
    gates,
    drafts: analysis?.drafts && typeof analysis.drafts === "object"
      ? {
          ...analysis.drafts,
          approvalComment: null,
          implementationHandoff: null,
          reviewerRequest: null,
          closureSummary: null,
          restrictedByCapture: true,
        }
      : analysis?.drafts,
    nextAction: {
      kind: "complete_capture",
      clientGuarded: true,
    },
    clientGuard: {
      finalReadinessAllowed: false,
      reason: !profileReady
        ? "profile_needs_remap"
        : snapshot?.captureState === "ambiguous" ? "ambiguous_capture" : "partial_capture",
    },
  };
}
