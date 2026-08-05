import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import XLSX from "xlsx";

import { activateEcnRulesetDraft } from "../extensions/ecn/importer/activateRuleset.js";
import { readDocxSource } from "../extensions/ecn/importer/docxSource.js";
import { importEcnRuleset } from "../extensions/ecn/importer/importRuleset.js";
import {
  buildSheetProfileCandidate,
  parseApprovalMatrixSheet,
  parseChecklistSheet,
} from "../extensions/ecn/importer/xlsxSource.js";
import { CHANGE_TYPE_ROUTES, DEPARTMENTS } from "../extensions/ecn/rules/defaultRuleset.js";
import { createHeaderFingerprint } from "../extensions/ecn/services/profileService.js";

const departmentColumns = [
  [1, "Engineering", DEPARTMENTS.ENGINEERING],
  [5, "Quality", DEPARTMENTS.QUALITY],
  [9, "Materials - Supply Chain", DEPARTMENTS.SUPPLY_CHAIN],
  [13, "Marketing-Product Mgrs", DEPARTMENTS.PRODUCT_MANAGEMENT],
  [17, "Project Management", DEPARTMENTS.PROJECT_MANAGEMENT],
  [21, "Production/Operations", DEPARTMENTS.PRODUCTION],
  [25, "Finance", DEPARTMENTS.FINANCE],
  [29, "Pricing Admin.", DEPARTMENTS.PRICING],
  [33, "Customer Service", DEPARTMENTS.CUSTOMER_SERVICE],
];

function syntheticMatrixSheet() {
  const rows = Array.from({ length: 27 }, () => Array(36).fill(null));
  rows[1][0] = "Type Of Change";
  for (const [column, heading, department] of departmentColumns) {
    rows[0][column] = heading;
    rows[1][column] = "Pre-Approval";
    rows[1][column + 1] = "Implementation Review";
    rows[1][column + 2] = "Completion Notification";
    CHANGE_TYPE_ROUTES.forEach((route, index) => {
      rows[index + 2][0] = route.label;
      rows[index + 2][column] = route.preApprovers.includes(department) ? "YES" : "NO";
      rows[index + 2][column + 1] = route.reviewers.includes(department) ? "YES" : "NO";
      rows[index + 2][column + 2] = route.recipients.includes(department) ? "YES" : "NO";
    });
  }
  return XLSX.utils.aoa_to_sheet(rows);
}

function syntheticChecklistSheet() {
  const rows = Array.from({ length: 18 }, () => Array(5).fill(null));
  const anchors = [
    "New Purchased Items (Components or Purchased Finished Items)",
    "New Manufactured items:",
    "Item Change - Purchased:",
    "Modified Manufactured items:",
    "Product Obsolescence",
    "Non-product System Changes",
  ];
  anchors.forEach((label, index) => {
    rows[index * 3][4] = label;
    rows[index * 3 + 1][4] = `Synthetic checklist item ${index + 1}`;
  });
  return XLSX.utils.aoa_to_sheet(rows);
}

async function syntheticDocx(filePath) {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Revision No.: 9</w:t></w:r></w:p>
          <w:p><w:del w:id="1"><w:r><w:delText>old controlled phrase</w:delText></w:r></w:del><w:ins w:id="2"><w:r><w:t>new provisional phrase</w:t></w:r></w:ins></w:p>
          <w:p><w:commentRangeStart w:id="4"/><w:r><w:t>Statement with unresolved source comment</w:t></w:r><w:commentRangeEnd w:id="4"/></w:p>
        </w:body>
      </w:document>`,
  );
  zip.file(
    "word/comments.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:comment w:id="4"><w:p><w:r><w:t>Reviewer note that must remain private</w:t></w:r></w:p></w:comment>
      </w:comments>`,
  );
  zip.file("word/media/example.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

test("matrix parser reconstructs all 25 routes without roster names", () => {
  const parsed = parseApprovalMatrixSheet(syntheticMatrixSheet(), "Matrix", { revision: "5" });
  assert.equal(parsed.changeTypes.length, 25);
  assert.equal(parsed.conflicts.length, 0);
  assert.deepEqual(
    parsed.changeTypes.map((route) => ({
      id: route.id,
      preApprovers: route.preApprovers,
      reviewers: route.reviewers,
      recipients: route.recipients,
    })),
    CHANGE_TYPE_ROUTES.map((route) => ({
      id: route.id,
      preApprovers: route.preApprovers,
      reviewers: route.reviewers,
      recipients: route.recipients,
    })),
  );
});

test("checklist parser finds all six coordinate-preserving profiles", () => {
  const parsed = parseChecklistSheet(syntheticChecklistSheet(), "Checklist", { revision: "2" });
  assert.equal(Object.keys(parsed.profiles).length, 6);
  assert.equal(parsed.conflicts.length, 0);
  for (const profile of Object.values(parsed.profiles)) {
    assert.match(profile.sourceCellRange, /^Checklist!E\d+:E\d+$/);
  }
});

test("sheet profile fingerprint exactly matches backend punctuation semantics", () => {
  const headers = ["ECN #", "Status (Live)", "Reason / Justification"];
  const sheet = XLSX.utils.aoa_to_sheet([
    headers,
    ["ECN-1", "Submitted", "Synthetic"],
  ]);
  const candidate = buildSheetProfileCandidate(sheet, "Export");
  assert.equal(candidate.profile.headerFingerprint, createHeaderFingerprint(headers));
  assert.deepEqual(candidate.profile.headerOrder, headers);
  assert.equal(candidate.profile.bindings.ecnNumber, "ECN ##1");
});

test("sheet profile rejects blank header gaps instead of compressing ordinals", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["ECN Number", null, "Status"],
    ["ECN-1", null, "Submitted"],
  ]);
  assert.throws(
    () => buildSheetProfileCandidate(sheet, "Export"),
    (error) => error.code === "ECN_SHEET_PROFILE_HEADER_GAP",
  );
});

test("DOCX import preserves redline/comment evidence without full source text", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ecn-docx-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "Synthetic Instruction.docx");
  await syntheticDocx(filePath);
  const result = await readDocxSource(filePath);
  assert.equal(result.manifest.statistics.trackedInsertions, 1);
  assert.equal(result.manifest.statistics.trackedDeletions, 1);
  assert.equal(result.manifest.statistics.unresolvedComments, 1);
  assert.equal(result.manifest.statistics.embeddedImages, 1);
  assert.ok(result.findings.some((item) => item.evidenceLevel === "provisional_redline"));
  assert.ok(result.findings.some((item) => item.evidenceLevel === "unresolved_comment"));
  assert.ok(result.findings.some((item) => item.evidenceLevel === "example_screenshot"));
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(directory));
  assert.ok(!serialized.includes("Reviewer note that must remain private"));
  assert.ok(result.findings.every((item) => !item.excerpt || item.excerpt.length <= 240));
});

test("draft import and reviewed activation write only private normalized artifacts", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ecn-import-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, "Synthetic Instruction.docx");
  const outputDirectory = path.join(directory, "private-output");
  await syntheticDocx(sourcePath);

  const imported = await importEcnRuleset({
    inputPaths: [sourcePath],
    outputDirectory,
    version: "ecn-test-draft",
    now: new Date("2026-08-05T12:00:00.000Z"),
  });
  assert.equal(imported.written, true);
  const draftText = await fs.readFile(imported.paths.draftPath, "utf8");
  assert.ok(!draftText.includes(directory));
  assert.ok(!draftText.includes("Reviewer note that must remain private"));
  assert.equal(JSON.parse(draftText).changeTypes.length, 25);

  const activated = await activateEcnRulesetDraft({
    draftPath: imported.paths.draftPath,
    outputDirectory,
    reviewedBy: "Synthetic Reviewer",
    now: new Date("2026-08-05T12:30:00.000Z"),
  });
  const pointer = JSON.parse(await fs.readFile(activated.paths.pointerPath, "utf8"));
  const active = JSON.parse(await fs.readFile(activated.paths.activeVersionPath, "utf8"));
  assert.equal(pointer.kind, "ecn-active-ruleset-pointer");
  assert.equal(active.status, "active");
  assert.equal(active.activation.reviewed, true);
  assert.equal(active.activation.reviewedByHash.length, 64);
  assert.ok(!JSON.stringify(active).includes("Synthetic Reviewer"));
});
