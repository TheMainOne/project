import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DEFAULT_ECN_RULESET } from "../rules/defaultRuleset.js";
import { readDocxSource } from "./docxSource.js";
import { readXlsxSource } from "./xlsxSource.js";
import { assertPrivateArtifact } from "./privacy.js";

export const DEFAULT_PRIVATE_RULESET_DIRECTORY = path.resolve(
  process.env.ECN_PRIVATE_RULESET_DIRECTORY || path.join(process.cwd(), ".ecn-private"),
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeVersionPart(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

async function collectFiles(inputPaths) {
  const result = [];
  async function visit(inputPath) {
    const stat = await fs.stat(inputPath);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(inputPath, { withFileTypes: true });
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (entry.name.startsWith(".")) continue;
        await visit(path.join(inputPath, entry.name));
      }
      return;
    }
    if (/\.(?:docx|xlsx)$/i.test(inputPath) && !path.basename(inputPath).startsWith("~$")) {
      result.push(path.resolve(inputPath));
    }
  }
  for (const inputPath of inputPaths) await visit(path.resolve(inputPath));
  return [...new Set(result)].sort((left, right) => left.localeCompare(right));
}

function parseRowFromRange(cellRange) {
  const match = String(cellRange || "").match(/![A-Z]+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function shiftRowsInRange(cellRange, delta) {
  if (!cellRange || !delta) return cellRange;
  return cellRange.replace(/([A-Z]+)(\d+)/gi, (match, column, row) => {
    const shifted = Number(row) + delta;
    return shifted > 0 ? `${column}${shifted}` : match;
  });
}

function applyChecklistCoordinates(ruleset, importedProfiles, revision) {
  for (const [id, imported] of Object.entries(importedProfiles || {})) {
    const profile = ruleset.checklistProfiles[id];
    if (!profile) continue;
    const oldStart = parseRowFromRange(profile.sourceCellRange);
    const newStart = parseRowFromRange(imported.sourceCellRange);
    const delta = oldStart && newStart ? newStart - oldStart : 0;
    profile.sourceCellRange = imported.sourceCellRange;
    for (const requirement of profile.requirements || []) {
      requirement.revision = revision || requirement.revision;
      requirement.cellRange = shiftRowsInRange(requirement.cellRange, delta);
    }
  }
}

function importedVersion(results, now) {
  const digest = createHash("sha256")
    .update(results.map((result) => result.manifest.sha256).sort().join("\n"), "utf8")
    .digest("hex")
    .slice(0, 12);
  const date = now.toISOString().slice(0, 10).replaceAll("-", ".");
  return `ecn-draft-${date}-${digest}`;
}

function buildCrossSourceConflicts(results) {
  const sourcesBySignal = new Map();
  for (const result of results) {
    for (const signal of result.signals || []) {
      if (!sourcesBySignal.has(signal)) sourcesBySignal.set(signal, []);
      sourcesBySignal.get(signal).push(result.manifest.fileName);
    }
  }
  const definitions = [
    {
      id: "material_group_wgot_wgbot",
      alternatives: [["WGOT"], ["WGBOT"]],
      label: "Material-group spelling differs between WGOT and WGBOT",
    },
    {
      id: "transaction_cv01n_typo",
      alternatives: [["CV01N"], ["CVO1N", "CVOLN"]],
      label: "DMS transaction spelling differs from CV01N",
    },
    {
      id: "transaction_co03_typo",
      alternatives: [["CO03"], ["C003"]],
      label: "Order-display transaction spelling differs from CO03",
    },
  ];
  const conflicts = [];
  for (const definition of definitions) {
    const observedGroups = definition.alternatives.map((group) =>
      group.filter((signal) => sourcesBySignal.has(signal)),
    );
    if (!observedGroups.every((group) => group.length > 0)) continue;
    const observedSignals = observedGroups.flat();
    const sourceFiles = [...new Set(
      observedSignals.flatMap((signal) => sourcesBySignal.get(signal) || []),
    )];
    conflicts.push({
      id: `cross_source.${definition.id}`,
      source: sourceFiles.join("; "),
      revision: "multiple supplied revisions",
      section: "Cross-source terminology check",
      cellRange: null,
      condition: definition.label,
      severity: "warning",
      expectedValue: "one confirmed controlled value",
      observedValue: observedSignals,
      nextAction: "Confirm the correct term/transaction with the source owner before activation.",
      evidenceLevel: "conflict",
    });
  }
  return conflicts;
}

export function validateEcnRulesetShape(ruleset) {
  const errors = [];
  if (ruleset.kind !== "ecn-ruleset") errors.push("kind must be ecn-ruleset");
  if (!Array.isArray(ruleset.changeTypes) || ruleset.changeTypes.length !== 25) {
    errors.push("ruleset must contain exactly 25 change types");
  }
  if (new Set((ruleset.changeTypes || []).map((route) => route.id)).size !== 25) {
    errors.push("change type IDs must be unique");
  }
  if (Object.keys(ruleset.checklistProfiles || {}).length !== 6) {
    errors.push("ruleset must contain exactly six checklist profiles");
  }

  function inspectEvidence(node, locator = "ruleset") {
    if (Array.isArray(node)) {
      node.forEach((item, index) => inspectEvidence(item, `${locator}[${index}]`));
      return;
    }
    if (!node || typeof node !== "object") return;
    if (node.evidenceLevel && node.evidenceLevel !== "controlled" && node.severity === "blocker") {
      errors.push(`${locator} has a non-controlled blocker`);
    }
    for (const [key, value] of Object.entries(node)) inspectEvidence(value, `${locator}.${key}`);
  }
  inspectEvidence(ruleset);
  if (errors.length) {
    const error = new Error(`Invalid ECN ruleset draft: ${errors.join("; ")}`);
    error.code = "ECN_RULESET_INVALID";
    error.details = errors;
    throw error;
  }
}

export async function buildEcnRulesetDraft({
  inputPaths,
  version,
  now = new Date(),
} = {}) {
  if (!Array.isArray(inputPaths) || inputPaths.length === 0) {
    throw new Error("At least one DOCX/XLSX source path is required");
  }
  const files = await collectFiles(inputPaths);
  if (!files.length) throw new Error("No .docx or .xlsx source files were found");

  const results = [];
  for (const file of files) {
    results.push(
      /\.docx$/i.test(file)
        ? await readDocxSource(file)
        : await readXlsxSource(file),
    );
  }

  const ruleset = clone(DEFAULT_ECN_RULESET);
  ruleset.version = safeVersionPart(version || importedVersion(results, now));
  ruleset.status = "draft";
  ruleset.createdAt = now.toISOString();

  const manifests = results.map((result) => result.manifest);
  const findings = [
    ...results.flatMap((result) => result.findings || []),
    ...buildCrossSourceConflicts(results),
  ];
  const conflicts = [
    ...results.flatMap((result) => result.conflicts || []),
    ...findings.filter((finding) => finding.evidenceLevel === "conflict"),
  ];
  const coordinateIndex = results.flatMap((result) => result.coordinateIndex || []);
  const profileCandidates = results
    .filter((result) => result.profileCandidate)
    .map((result) => ({
      sourceFile: result.manifest.fileName,
      ...result.profileCandidate,
    }));

  const matrix = results.find((result) => result.kind === "approval_matrix");
  if (matrix?.changeTypes?.length === 25) ruleset.changeTypes = matrix.changeTypes;
  const checklist = results.find((result) => result.kind === "required_information_checklist");
  if (checklist) {
    applyChecklistCoordinates(ruleset, checklist.profiles, checklist.manifest.revision);
  }

  ruleset.import = {
    importedAt: now.toISOString(),
    hostFingerprint: createHash("sha256").update(os.hostname()).digest("hex").slice(0, 12),
    sourceManifests: manifests,
    findings,
    coordinateIndex,
    sheetProfileCandidates: profileCandidates,
    conflictCount: conflicts.length,
    privacy: {
      rawSourcesStored: false,
      absolutePathsStored: false,
      maximumExcerptLength: ruleset.sourcePolicy.maximumExcerptLength,
    },
  };

  const conflictsReport = {
    kind: "ecn-ruleset-conflicts",
    ruleSetVersion: ruleset.version,
    generatedAt: now.toISOString(),
    conflictCount: conflicts.length,
    conflicts,
    needsConfirmation: findings.filter((finding) => finding.evidenceLevel !== "controlled"),
    sourceChecksums: manifests.map(({ fileName, sha256: checksum, revision: sourceRevision }) => ({
      fileName,
      sha256: checksum,
      revision: sourceRevision,
    })),
  };

  validateEcnRulesetShape(ruleset);
  assertPrivateArtifact(ruleset);
  assertPrivateArtifact(conflictsReport);
  return {
    ruleset,
    conflictsReport,
    summary: {
      version: ruleset.version,
      sourceCount: manifests.length,
      docxCount: results.filter((result) => result.kind === "docx").length,
      xlsxCount: results.filter((result) => result.kind !== "docx").length,
      matrixRouteCount: matrix?.changeTypes?.length || 0,
      checklistProfileCount: checklist ? Object.keys(checklist.profiles || {}).length : 0,
      sheetProfileCandidateCount: profileCandidates.length,
      needsConfirmationCount: conflictsReport.needsConfirmation.length,
      conflictCount: conflicts.length,
    },
  };
}

async function atomicWriteJson(targetPath, value) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporary = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(temporary, targetPath);
}

export async function importEcnRuleset({
  inputPaths,
  outputDirectory = DEFAULT_PRIVATE_RULESET_DIRECTORY,
  version,
  dryRun = false,
  now = new Date(),
} = {}) {
  const draft = await buildEcnRulesetDraft({ inputPaths, version, now });
  if (dryRun) return { ...draft, written: false, paths: null };
  const baseName = safeVersionPart(draft.ruleset.version);
  const draftPath = path.join(outputDirectory, `${baseName}.draft.json`);
  const conflictsPath = path.join(outputDirectory, `${baseName}.conflicts.json`);
  await atomicWriteJson(draftPath, draft.ruleset);
  await atomicWriteJson(conflictsPath, draft.conflictsReport);
  return {
    ...draft,
    written: true,
    paths: { draftPath, conflictsPath },
  };
}

export const __private__ = Object.freeze({
  applyChecklistCoordinates,
  collectFiles,
  shiftRowsInRange,
  validateDraftShape: validateEcnRulesetShape,
});
