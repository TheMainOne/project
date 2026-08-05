import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import DEFAULT_ECN_RULESET from "../rules/defaultRuleset.js";

export const DEFAULT_ACTIVE_RULESET_DIRECTORY = path.resolve(
  process.env.ECN_PRIVATE_RULESET_DIRECTORY || path.join(process.cwd(), ".ecn-private")
);

const MAX_ACTIVE_RULESET_BYTES = 5 * 1024 * 1024;
let cache = null;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function validateNoDangerousKeys(value, location = "ruleset") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNoDangerousKeys(entry, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) {
      throw new Error(`${location} contains a forbidden key`);
    }
    validateNoDangerousKeys(entry, `${location}.${key}`);
  }
}

export function validateActiveEcnRuleset(ruleset) {
  validateNoDangerousKeys(ruleset);
  if (!ruleset || ruleset.kind !== "ecn-ruleset" || ruleset.status !== "active") {
    throw new Error("Active ruleset has an invalid kind or status");
  }
  if (typeof ruleset.version !== "string" || !ruleset.version.trim()) {
    throw new Error("Active ruleset version is required");
  }
  const typeIds = (ruleset.changeTypes || []).map((entry) => entry?.id).filter(Boolean);
  if (typeIds.length !== 25 || new Set(typeIds).size !== 25) {
    throw new Error("Active ruleset must contain 25 unique change types");
  }
  if (Object.keys(ruleset.checklistProfiles || {}).length !== 6) {
    throw new Error("Active ruleset must contain six checklist profiles");
  }
  if (ruleset.activation?.reviewed !== true) {
    throw new Error("Active ruleset must record a human review");
  }

  function inspectEvidence(node) {
    if (Array.isArray(node)) {
      node.forEach(inspectEvidence);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (node.severity === "blocker" && node.evidenceLevel !== "controlled") {
      throw new Error("A non-controlled rule cannot be a blocker");
    }
    Object.values(node).forEach(inspectEvidence);
  }
  inspectEvidence(ruleset);
  return ruleset;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function baseline(state, reason = null) {
  return {
    ruleset: DEFAULT_ECN_RULESET,
    state,
    reason,
    version: DEFAULT_ECN_RULESET.version,
  };
}

export async function loadActiveEcnRuleset({
  directory = DEFAULT_ACTIVE_RULESET_DIRECTORY,
} = {}) {
  const resolvedDirectory = path.resolve(directory);
  const pointerPath = path.join(resolvedDirectory, "active.json");
  let pointerStat;
  try {
    pointerStat = await fs.stat(pointerPath);
  } catch (error) {
    if (error?.code === "ENOENT") return baseline("baseline_no_active");
    return baseline("baseline_invalid_active", "pointer_unreadable");
  }

  if (
    cache &&
    cache.directory === resolvedDirectory &&
    cache.pointerMtimeMs === pointerStat.mtimeMs &&
    cache.pointerSize === pointerStat.size
  ) {
    return cache.value;
  }

  let value;
  try {
    const pointer = JSON.parse(await fs.readFile(pointerPath, "utf8"));
    if (
      pointer?.kind !== "ecn-active-ruleset-pointer" ||
      typeof pointer.version !== "string" ||
      typeof pointer.fileName !== "string" ||
      !/^[a-z0-9._-]+\.active\.json$/i.test(pointer.fileName) ||
      !/^[a-f\d]{64}$/i.test(String(pointer.sha256 || ""))
    ) {
      throw new Error("Invalid active ruleset pointer");
    }
    const activePath = path.resolve(resolvedDirectory, pointer.fileName);
    if (path.dirname(activePath) !== resolvedDirectory) {
      throw new Error("Active ruleset path escapes its private directory");
    }
    const activeStat = await fs.stat(activePath);
    if (activeStat.size > MAX_ACTIVE_RULESET_BYTES) {
      throw new Error("Active ruleset exceeds the size limit");
    }
    const serialized = await fs.readFile(activePath);
    if (sha256(serialized) !== pointer.sha256.toLowerCase()) {
      throw new Error("Active ruleset checksum mismatch");
    }
    const ruleset = validateActiveEcnRuleset(JSON.parse(serialized.toString("utf8")));
    if (ruleset.version !== pointer.version) {
      throw new Error("Active ruleset version does not match its pointer");
    }
    value = {
      ruleset: deepFreeze(ruleset),
      state: "active",
      reason: null,
      version: ruleset.version,
    };
  } catch {
    // Do not log parsing errors: imported excerpts are private. Bootstrap makes
    // the fallback state visible without exposing file contents.
    value = baseline("baseline_invalid_active", "verification_failed");
  }

  cache = {
    directory: resolvedDirectory,
    pointerMtimeMs: pointerStat.mtimeMs,
    pointerSize: pointerStat.size,
    value,
  };
  return value;
}

export async function getActiveEcnRuleset(options) {
  return (await loadActiveEcnRuleset(options)).ruleset;
}

export function resetEcnRulesetCacheForTests() {
  cache = null;
}
