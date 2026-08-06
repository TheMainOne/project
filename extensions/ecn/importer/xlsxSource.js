import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import XLSX from "xlsx";

import {
  CANONICAL_FIELD_ALIASES,
  CHANGE_TYPE_ROUTES,
  CHECKLIST_PROFILES,
  DEPARTMENTS,
} from "../rules/defaultRuleset.js";
import {
  DWK_57172_STATUS_ALIASES,
  matchesDwk57172Headers,
} from "../profiles/dwk57172.js";
import { basenameOnly, hashFile, sanitizeExcerpt } from "./privacy.js";

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function cellValue(sheet, row, column) {
  return sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v;
}

function usedRange(sheet) {
  return XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
}

function cells(sheet) {
  const range = usedRange(sheet);
  const result = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const value = cellValue(sheet, row, column);
      if (value === null || value === undefined || String(value).trim() === "") continue;
      result.push({
        row,
        column,
        address: XLSX.utils.encode_cell({ r: row, c: column }),
        value,
      });
    }
  }
  return result;
}

function revisionFromWorkbook(workbook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    for (const cell of cells(sheet)) {
      const match = String(cell.value).match(
        /revision\s*(?:no\.?|number|#)?\s*[:.-]?\s*([a-z0-9.-]+)/i,
      );
      if (match) return sanitizeExcerpt(match[1], 50);
    }
  }
  return "supplied-copy";
}

function workbookFormNumber(workbook) {
  for (const sheetName of workbook.SheetNames) {
    for (const cell of cells(workbook.Sheets[sheetName])) {
      const match = String(cell.value).match(/DWKID[-\s]*(\d+)/i);
      if (match) return `DWKID-${match[1]}`;
    }
  }
  return null;
}

function workbookSignals(workbook) {
  const text = workbook.SheetNames
    .flatMap((sheetName) => cells(workbook.Sheets[sheetName]).map((cell) => String(cell.value)))
    .join("\n");
  return [
    /\bWGOT\b/i.test(text) && "WGOT",
    /\bWGBOT\b/i.test(text) && "WGBOT",
    /\bCV01N\b/i.test(text) && "CV01N",
    /\bCVO1N\b/i.test(text) && "CVO1N",
    /\bCVOLN\b/i.test(text) && "CVOLN",
    /\bCO03\b/i.test(text) && "CO03",
    /\bC003\b/i.test(text) && "C003",
  ].filter(Boolean);
}

const DEPARTMENT_PATTERNS = Object.freeze([
  [/^engineering$/, DEPARTMENTS.ENGINEERING],
  [/^quality$/, DEPARTMENTS.QUALITY],
  [/material|supply chain/, DEPARTMENTS.SUPPLY_CHAIN],
  [/marketing|product mgr|product management/, DEPARTMENTS.PRODUCT_MANAGEMENT],
  [/project management/, DEPARTMENTS.PROJECT_MANAGEMENT],
  [/production|operations/, DEPARTMENTS.PRODUCTION],
  [/finance/, DEPARTMENTS.FINANCE],
  [/pricing/, DEPARTMENTS.PRICING],
  [/customer service/, DEPARTMENTS.CUSTOMER_SERVICE],
]);

function departmentFromHeading(value) {
  const clean = normalize(value);
  return DEPARTMENT_PATTERNS.find(([pattern]) => pattern.test(clean))?.[1] || null;
}

function stageFromHeading(value) {
  const clean = normalize(value);
  if (clean.includes("pre approval")) return "preApprovers";
  if (clean.includes("implementation review")) return "reviewers";
  if (clean.includes("completion notification")) return "recipients";
  return null;
}

function tokens(value) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 2 && !["change", "changes", "product", "item"].includes(token)),
  );
}

function routeSimilarity(label, route) {
  const sourceTokens = tokens(label);
  const routeTokens = tokens([route.label, ...(route.aliases || [])].join(" "));
  const matches = [...routeTokens].filter((token) => sourceTokens.has(token)).length;
  return routeTokens.size ? matches / routeTokens.size : 0;
}

function sameMembers(left, right) {
  return [...left].sort().join("|") === [...right].sort().join("|");
}

function matrixConflict({ route, field, actual, sheetName, row, revision }) {
  return {
    id: `matrix.${route.id}.${field}`,
    source: "DWKID-7206 / ECN Approver-Reviewer-Notify Matrix",
    revision,
    section: `Matrix row: ${route.label}`,
    cellRange: `${sheetName}!A${row + 1}:AJ${row + 1}`,
    condition: `${field} differs from the normalized baseline`,
    severity: "warning",
    expectedValue: route[field],
    observedValue: actual,
    nextAction: "Review the source row and confirm the participant route before activation.",
    evidenceLevel: "conflict",
  };
}

export function parseApprovalMatrixSheet(
  sheet,
  sheetName = "Sheet1",
  { routes = CHANGE_TYPE_ROUTES, revision = "supplied-copy" } = {},
) {
  const allCells = cells(sheet);
  const typeHeader = allCells.find((cell) => normalize(cell.value).includes("type of change"));
  if (!typeHeader) throw new Error("Could not locate the Type Of Change header in DWKID-7206");

  const stageColumns = [];
  const range = usedRange(sheet);
  let departmentHeaderRow = null;
  let departmentHeaderScore = 0;
  for (let row = Math.max(range.s.r, typeHeader.row - 8); row < typeHeader.row; row += 1) {
    let score = 0;
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      if (departmentFromHeading(cellValue(sheet, row, column))) score += 1;
    }
    if (score > departmentHeaderScore) {
      departmentHeaderScore = score;
      departmentHeaderRow = row;
    }
  }
  if (departmentHeaderRow === null || departmentHeaderScore < 9) {
    throw new Error("Could not locate all nine department headings in DWKID-7206");
  }
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const field = stageFromHeading(cellValue(sheet, typeHeader.row, column));
    if (!field) continue;
    let department = null;
    for (let headingColumn = column; headingColumn >= Math.max(range.s.c, column - 2); headingColumn -= 1) {
      department = departmentFromHeading(cellValue(sheet, departmentHeaderRow, headingColumn));
      if (department) break;
    }
    if (department) stageColumns.push({ column, field, department });
  }
  if (stageColumns.length !== 27) {
    throw new Error(`Expected 27 department/stage columns in DWKID-7206; found ${stageColumns.length}`);
  }

  const sourceRows = [];
  for (let row = typeHeader.row + 1; row <= range.e.r; row += 1) {
    const label = sanitizeExcerpt(cellValue(sheet, row, typeHeader.column), 200);
    if (!label || normalize(label) === "date") continue;
    const decisions = stageColumns.map(({ column }) => normalize(cellValue(sheet, row, column)));
    if (!decisions.some((value) => value === "yes" || value === "no")) continue;
    const route = { label, row, preApprovers: [], reviewers: [], recipients: [] };
    for (const { column, field, department } of stageColumns) {
      if (normalize(cellValue(sheet, row, column)) === "yes") route[field].push(department);
    }
    sourceRows.push(route);
  }

  const conflicts = [];
  const normalizedRoutes = [];
  const unmatchedRouteIds = new Set(routes.map((route) => route.id));
  for (const [index, source] of sourceRows.entries()) {
    const ranked = routes
      .filter((route) => unmatchedRouteIds.has(route.id))
      .map((route) => ({ route, score: routeSimilarity(source.label, route) }))
      .sort((left, right) => right.score - left.score);
    const matched = ranked[0]?.score >= 0.25 ? ranked[0] : { route: routes[index], score: 0 };
    if (!matched?.route) continue;
    unmatchedRouteIds.delete(matched.route.id);
    const cellRange = `${sheetName}!${XLSX.utils.encode_col(typeHeader.column)}${source.row + 1}:${XLSX.utils.encode_col(Math.max(...stageColumns.map((item) => item.column)))}${source.row + 1}`;
    const imported = {
      ...matched.route,
      sourceLabel: source.label,
      preApprovers: source.preApprovers,
      reviewers: source.reviewers,
      recipients: source.recipients,
      source: "DWKID-7206 / ECN Approver-Reviewer-Notify Matrix",
      revision,
      section: `Matrix row: ${source.label}`,
      cellRange,
      condition: "always",
      severity: "info",
      expectedValue: "route participants",
      nextAction: "Route the ECN to every required participant.",
      evidenceLevel: matched.score >= 0.25 ? "controlled" : "conflict",
    };
    normalizedRoutes.push(imported);
    for (const field of ["preApprovers", "reviewers", "recipients"]) {
      if (!sameMembers(matched.route[field], source[field])) {
        conflicts.push(
          matrixConflict({
            route: matched.route,
            field,
            actual: source[field],
            sheetName,
            row: source.row,
            revision,
          }),
        );
      }
    }
    if (matched.score < 0.25) {
      conflicts.push({
        id: `matrix.${matched.route.id}.label_match`,
        source: "DWKID-7206 / ECN Approver-Reviewer-Notify Matrix",
        revision,
        section: `Matrix row ${source.row + 1}`,
        cellRange,
        condition: "Change-type label could only be matched by row order",
        severity: "warning",
        expectedValue: matched.route.label,
        observedValue: source.label,
        nextAction: "Confirm the change-type mapping before activation.",
        evidenceLevel: "conflict",
      });
    }
  }

  for (const id of unmatchedRouteIds) {
    const route = routes.find((item) => item.id === id);
    conflicts.push({
      id: `matrix.${id}.missing`,
      source: "DWKID-7206 / ECN Approver-Reviewer-Notify Matrix",
      revision,
      section: "Matrix coverage",
      cellRange: null,
      condition: "Expected normalized type is absent from the workbook",
      severity: "warning",
      expectedValue: route?.label || id,
      observedValue: null,
      nextAction: "Map or restore the missing matrix row before activation.",
      evidenceLevel: "conflict",
    });
  }

  return {
    changeTypes: normalizedRoutes,
    conflicts,
    coordinateIndex: normalizedRoutes.map((route) => ({
      typeId: route.id,
      cellRange: route.cellRange,
    })),
    statistics: { routeCount: normalizedRoutes.length, stageColumnCount: stageColumns.length },
  };
}

const PROFILE_PATTERNS = Object.freeze([
  ["new_purchased", /new purchased items?/],
  ["new_manufactured", /new manufactured items?/],
  ["changed_purchased", /item change purchased/],
  ["changed_manufactured", /modified manufactured items?/],
  ["obsolescence", /product obsolescence/],
  ["system_change", /non product system changes?/],
]);

function profileIdFromValue(value) {
  const clean = normalize(value);
  return PROFILE_PATTERNS.find(([, pattern]) => pattern.test(clean))?.[0] || null;
}

export function parseChecklistSheet(
  sheet,
  sheetName = "Sheet1",
  { profiles = CHECKLIST_PROFILES, revision = "supplied-copy" } = {},
) {
  const allCells = cells(sheet);
  const anchors = allCells
    .map((cell) => ({ ...cell, profileId: profileIdFromValue(cell.value) }))
    .filter((cell) => cell.profileId)
    .sort((left, right) => left.row - right.row);
  const parsedProfiles = {};
  const conflicts = [];
  for (const [index, anchor] of anchors.entries()) {
    const nextRow = anchors[index + 1]?.row ?? usedRange(sheet).e.r + 1;
    let lastRow = anchor.row;
    for (const cell of allCells) {
      if (cell.row >= anchor.row && cell.row < nextRow && cell.column === anchor.column) {
        lastRow = Math.max(lastRow, cell.row);
      }
    }
    const cellRange = `${sheetName}!${XLSX.utils.encode_col(anchor.column)}${anchor.row + 1}:${XLSX.utils.encode_col(anchor.column)}${lastRow + 1}`;
    parsedProfiles[anchor.profileId] = {
      id: anchor.profileId,
      label: profiles[anchor.profileId]?.label || sanitizeExcerpt(anchor.value, 100),
      sourceCellRange: cellRange,
      itemCount: allCells.filter(
        (cell) =>
          cell.column === anchor.column &&
          cell.row > anchor.row &&
          cell.row <= lastRow,
      ).length,
    };
  }
  for (const [id, profile] of Object.entries(profiles)) {
    if (parsedProfiles[id]) continue;
    conflicts.push({
      id: `checklist.${id}.missing`,
      source: "DWKID-7205 / ECN Required Information Checklist",
      revision,
      section: "Checklist profile coverage",
      cellRange: null,
      condition: "Expected checklist profile is absent from the workbook",
      severity: "warning",
      expectedValue: profile.label,
      observedValue: null,
      nextAction: "Map or restore the missing checklist section before activation.",
      evidenceLevel: "conflict",
    });
  }

  const nextRevisionNote = allCells.find((cell) =>
    normalize(cell.value).includes("to be added in next revision"),
  );
  const findings = [];
  if (nextRevisionNote) {
    findings.push({
      id: "checklist.system_change.next_revision",
      source: "DWKID-7205 / ECN Required Information Checklist",
      revision,
      section: "Revision history / System Change",
      cellRange: `${sheetName}!${nextRevisionNote.address}`,
      condition: "System Change requirements are marked for a future revision",
      severity: "warning",
      expectedValue: "released controlled requirements",
      nextAction: "Confirm System Change requirements with the document owner.",
      evidenceLevel: "provisional_redline",
      excerpt: sanitizeExcerpt(nextRevisionNote.value),
    });
  }
  return {
    profiles: parsedProfiles,
    conflicts,
    findings,
    coordinateIndex: Object.values(parsedProfiles).map((profile) => ({
      profileId: profile.id,
      cellRange: profile.sourceCellRange,
    })),
    statistics: { profileCount: Object.keys(parsedProfiles).length },
  };
}

function normalizeProfileHeader(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function fingerprint(headers) {
  return createHash("sha256")
    .update(
      headers
        .map((header, index) => `${index + 1}:${normalizeProfileHeader(header)}`)
        .join("\n"),
      "utf8",
    )
    .digest("hex");
}

function bestHeaderRow(sheet) {
  const range = usedRange(sheet);
  let best = null;
  for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 30); row += 1) {
    const values = [];
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const value = cellValue(sheet, row, column);
      if (value !== undefined && value !== null && String(value).trim()) values.push({ column, value });
    }
    const aliasMatches = values.filter(({ value }) =>
      Object.values(CANONICAL_FIELD_ALIASES).flat().some((alias) => normalize(alias) === normalize(value)),
    ).length;
    const score = values.length + aliasMatches * 5;
    if (!best || score > best.score) best = { row, values, score, aliasMatches };
  }
  return best;
}

const KNOWN_STAGES = Object.freeze([
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

export function buildSheetProfileCandidate(sheet, sheetName = "Sheet1") {
  const header = bestHeaderRow(sheet);
  if (!header || header.values.length < 2) throw new Error("Could not identify a plausible header row");
  const range = usedRange(sheet);
  const firstColumn = Math.min(...header.values.map((item) => item.column));
  const lastColumn = Math.max(...header.values.map((item) => item.column));
  const headerOrder = [];
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    const value = cellValue(sheet, header.row, column);
    if (value === undefined || value === null || !String(value).trim()) {
      const error = new Error(
        `Header row ${header.row + 1} contains a blank gap at ${XLSX.utils.encode_col(column)}${header.row + 1}`,
      );
      error.code = "ECN_SHEET_PROFILE_HEADER_GAP";
      throw error;
    }
    headerOrder.push(sanitizeExcerpt(value, 200));
  }

  const bindings = {};
  for (const [canonical, aliases] of Object.entries(CANONICAL_FIELD_ALIASES)) {
    const matches = headerOrder
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => aliases.some((alias) => normalize(alias) === normalize(value)));
    if (matches.length === 1) {
      const match = matches[0];
      bindings[canonical] = `${match.value}#${match.index + 1}`;
    }
  }
  const isDwk57172 = matchesDwk57172Headers(headerOrder);
  if (isDwk57172) delete bindings.pricing;

  const statusBinding = bindings.status;
  const statusOrdinal = statusBinding ? Number(statusBinding.match(/#(\d+)$/)?.[1]) : null;
  const statusValues = [];
  if (statusOrdinal) {
    for (let row = header.row + 1; row <= Math.min(range.e.r, header.row + 2_000); row += 1) {
      const value = sanitizeExcerpt(
        cellValue(sheet, row, firstColumn + statusOrdinal - 1),
        100,
      );
      if (value && !statusValues.includes(value) && statusValues.length < 50) statusValues.push(value);
    }
  }
  const statusAliases = {};
  const unknownStatusValues = [];
  for (const value of statusValues) {
    const stage = KNOWN_STAGES.find((candidate) => normalize(candidate) === normalize(value)) ||
      (isDwk57172 ? DWK_57172_STATUS_ALIASES[value] : null);
    if (stage) statusAliases[value] = stage;
    else unknownStatusValues.push(value);
  }
  const headerFingerprint = fingerprint(headerOrder);
  return {
    sheetName,
    headerRow: header.row + 1,
    statusHeaderCell: statusOrdinal
      ? `${XLSX.utils.encode_col(firstColumn + statusOrdinal - 1)}${header.row + 1}`
      : null,
    profile: {
      version: `ecn-sheet-draft-${headerFingerprint.slice(0, 12)}`,
      headerFingerprint,
      expectedHeaders: [...headerOrder],
      headerOrder,
      bindings,
      aliases: CANONICAL_FIELD_ALIASES,
      primaryKeys: ["ecnNumber", "itemNumber"].filter((key) => bindings[key]),
      statusAliases,
      locale: "en",
      confirmed: false,
      mappingState: "needs_remap",
    },
    unknownStatusValues,
  };
}

export async function readXlsxSource(filePath) {
  const [buffer, checksum, stat] = await Promise.all([
    fs.readFile(filePath),
    hashFile(filePath),
    fs.stat(filePath),
  ]);
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    cellDates: false,
  });
  const formNumber = workbookFormNumber(workbook);
  const revision = revisionFromWorkbook(workbook);
  const signals = workbookSignals(workbook);
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[firstSheetName];
  const commonManifest = {
    fileName: basenameOnly(filePath),
    type: "xlsx",
    sha256: checksum,
    sizeBytes: stat.size,
    revision,
    formNumber,
    statistics: {
      sheetCount: workbook.SheetNames.length,
      sheets: workbook.SheetNames.map((name) => ({ name, range: workbook.Sheets[name]["!ref"] || null })),
    },
  };

  if (formNumber === "DWKID-7206" || /Approver-Reviewer-Notify Matrix/i.test(filePath)) {
    const parsed = parseApprovalMatrixSheet(firstSheet, firstSheetName, { revision });
    return {
      kind: "approval_matrix",
      signals,
      manifest: { ...commonManifest, statistics: { ...commonManifest.statistics, ...parsed.statistics } },
      ...parsed,
    };
  }
  if (formNumber === "DWKID-7205" || /Required Information Checklist/i.test(filePath)) {
    const parsed = parseChecklistSheet(firstSheet, firstSheetName, { revision });
    return {
      kind: "required_information_checklist",
      signals,
      manifest: { ...commonManifest, statistics: { ...commonManifest.statistics, ...parsed.statistics } },
      ...parsed,
    };
  }
  const candidate = buildSheetProfileCandidate(firstSheet, firstSheetName);
  return {
    kind: "sheet_profile_candidate",
    signals,
    manifest: commonManifest,
    profileCandidate: candidate,
    findings: candidate.unknownStatusValues.length
      ? [{
          id: "sheet_profile.status_mapping",
          source: basenameOnly(filePath),
          revision,
          section: `${firstSheetName} header row ${candidate.headerRow}`,
          cellRange: candidate.statusHeaderCell
            ? `${firstSheetName}!${candidate.statusHeaderCell}`
            : null,
          condition: "One or more live Status values have no lifecycle mapping",
          severity: "warning",
          expectedValue: "explicit mapping to the ECN lifecycle",
          nextAction: "Confirm every Status mapping before marking the profile ready.",
          evidenceLevel: "conflict",
          statusValues: candidate.unknownStatusValues,
        }]
      : [],
    conflicts: [],
  };
}

export const __private__ = Object.freeze({
  bestHeaderRow,
  cells,
  departmentFromHeading,
  fingerprint,
  normalize,
  normalizeProfileHeader,
  profileIdFromValue,
  routeSimilarity,
  stageFromHeading,
});
