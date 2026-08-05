import { createHash } from "crypto";
import mongoose from "mongoose";
import EcnAuditLog from "../models/EcnAuditLog.js";

const memoryAudits = [];
const SUMMARY_KEYS = new Set([
  "captureState",
  "profileState",
  "readiness",
  "selectedTypes",
  "gateCounts",
  "aiStatus",
  "errorCount",
  "confirmed",
  "headerCount",
  "failure",
]);

function sanitizeAuditSummary(summary) {
  const source = summary && typeof summary === "object" ? summary : {};
  const result = {};
  for (const key of SUMMARY_KEYS) {
    if (!Object.hasOwn(source, key)) continue;
    const value = source[key];
    if (["captureState", "profileState", "readiness", "aiStatus", "failure"].includes(key)) {
      result[key] = String(value).slice(0, 80);
    } else if (key === "selectedTypes") {
      result[key] = Array.isArray(value)
        ? value.slice(0, 25).map((entry) => String(entry).slice(0, 200))
        : [];
    } else if (key === "gateCounts") {
      const counts = value && typeof value === "object" ? value : {};
      result[key] = Object.fromEntries(
        ["pass", "block", "warning", "unknown"].map((status) => [
          status,
          Math.max(0, Math.min(10_000, Number(counts[status]) || 0)),
        ])
      );
    } else if (["errorCount", "headerCount"].includes(key)) {
      result[key] = Math.max(0, Math.min(10_000, Number(value) || 0));
    } else if (key === "confirmed") {
      result[key] = value === true;
    }
  }
  return result;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

export function hashEcnRow(snapshot) {
  const hashInput = {
    sheetTitle: snapshot?.sheetTitle || "",
    rowHint: snapshot?.rowHint || {},
    fields: [...(snapshot?.fields || [])]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map(({ header, ordinal, value }) => ({ header, ordinal, value })),
  };
  return createHash("sha256")
    .update(JSON.stringify(stableValue(hashInput)), "utf8")
    .digest("hex");
}

export function createAuditSummary(result) {
  const gates = Array.isArray(result?.gates) ? result.gates : [];
  const gateCounts = { pass: 0, block: 0, warning: 0, unknown: 0 };
  for (const gate of gates) {
    if (Object.hasOwn(gateCounts, gate?.status)) gateCounts[gate.status] += 1;
  }
  return {
    captureState: String(result?.capture?.state || "unknown").slice(0, 40),
    profileState: String(result?.capture?.profileState || "unknown").slice(0, 40),
    readiness: String(result?.readiness?.state || result?.nextAction?.status || "unknown").slice(0, 40),
    selectedTypes: (result?.classification?.selectedTypes || [])
      .slice(0, 25)
      .map((value) => String(value).slice(0, 200)),
    gateCounts,
    aiStatus: String(result?.ai?.status || result?.drafts?.status || "unavailable").slice(0, 40),
  };
}

export async function writeEcnAudit(entry) {
  const whitelistedSummary = sanitizeAuditSummary(entry.resultSummary);
  const safeEntry = {
    analysisId: entry.analysisId ? String(entry.analysisId) : undefined,
    user: String(entry.user),
    action: String(entry.action),
    rowHash: entry.rowHash ? String(entry.rowHash) : null,
    profileVersion: entry.profileVersion ? String(entry.profileVersion) : null,
    ruleSetVersion: entry.ruleSetVersion ? String(entry.ruleSetVersion) : null,
    outcome: String(entry.outcome),
    resultSummary: stableValue(whitelistedSummary),
    model: entry.model ? String(entry.model).slice(0, 200) : null,
    timestamp: entry.timestamp instanceof Date ? entry.timestamp : new Date(),
  };

  memoryAudits.push(safeEntry);
  if (memoryAudits.length > 1_000) memoryAudits.shift();

  if (mongoose.connection.readyState === 1) {
    try {
      await EcnAuditLog.create(safeEntry);
    } catch {
      // Analysis remains usable during a transient audit-database failure. The
      // in-process record still contains only the approved metadata fields.
    }
  }
  return safeEntry;
}

export function getEcnMemoryAuditsForTests() {
  return memoryAudits.map((entry) => JSON.parse(JSON.stringify(entry)));
}

export function resetEcnAuditMemoryForTests() {
  memoryAudits.length = 0;
}
