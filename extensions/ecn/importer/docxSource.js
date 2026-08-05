import fs from "node:fs/promises";
import JSZip from "jszip";

import {
  basenameOnly,
  hashFile,
  sanitizeExcerpt,
} from "./privacy.js";

const XML_ENTITIES = Object.freeze({
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
});

function decodeXml(value) {
  return String(value ?? "").replace(
    /&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/gi,
    (match, entity) => {
      if (entity[0] === "#") {
        const hexadecimal = entity[1]?.toLowerCase() === "x";
        const number = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
        return Number.isFinite(number) ? String.fromCodePoint(number) : match;
      }
      return XML_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

function extractXmlText(fragment) {
  const parts = [];
  const pattern = /<w:(?:t|delText)\b[^>]*>([\s\S]*?)<\/w:(?:t|delText)>/gi;
  let match;
  while ((match = pattern.exec(fragment))) parts.push(decodeXml(match[1]));
  return sanitizeExcerpt(parts.join(" "));
}

function parseParagraphs(documentXml) {
  const paragraphs = [];
  const pattern = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi;
  let match;
  let index = 0;
  while ((match = pattern.exec(documentXml))) {
    index += 1;
    const xml = match[0];
    paragraphs.push({
      index,
      xml,
      text: extractXmlText(xml),
      insertionCount: (xml.match(/<w:ins\b/gi) || []).length,
      deletionCount: (xml.match(/<w:del\b/gi) || []).length,
      commentIds: [...xml.matchAll(/<w:commentRangeStart\b[^>]*w:id="(\d+)"/gi)].map(
        (item) => item[1],
      ),
    });
  }
  return paragraphs;
}

function parseRevision(paragraphs) {
  for (const paragraph of paragraphs) {
    const match = paragraph.text.match(/revision\s*(?:no\.?|number|#)?\s*[:.-]?\s*([a-z0-9.-]+)/i);
    if (match) return sanitizeExcerpt(match[1], 50);
  }
  return "supplied-copy";
}

function resolvedCommentParagraphIds(commentsExtendedXml) {
  const result = new Set();
  if (!commentsExtendedXml) return result;
  for (const match of commentsExtendedXml.matchAll(/<w15:commentEx\b([^>]*)\/?\s*>/gi)) {
    const attributes = match[1];
    const paraId = attributes.match(/w15:paraId="([^"]+)"/i)?.[1];
    const done = attributes.match(/w15:done="([^"]+)"/i)?.[1];
    if (paraId && done === "1") result.add(paraId);
  }
  return result;
}

function parseComments(commentsXml, commentsExtendedXml) {
  if (!commentsXml) return [];
  const resolvedParagraphs = resolvedCommentParagraphIds(commentsExtendedXml);
  const comments = [];
  const pattern = /<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/gi;
  let match;
  while ((match = pattern.exec(commentsXml))) {
    const attributes = match[1];
    const body = match[2];
    const id = attributes.match(/w:id="(\d+)"/i)?.[1];
    if (!id) continue;
    const paragraphId = body.match(/w14:paraId="([^"]+)"/i)?.[1];
    comments.push({
      id,
      resolved: paragraphId ? resolvedParagraphs.has(paragraphId) : false,
    });
  }
  return comments;
}

const KNOWN_CONFLICTS = Object.freeze([
  {
    id: "material_group_wgot_wgbot",
    patterns: [/\bWGOT\b/i, /\bWGBOT\b/i],
    label: "Material-group value appears as both WGOT and WGBOT",
  },
  {
    id: "transaction_cv01n_typo",
    patterns: [/\bCV01N\b/i, /\bCVO(?:1|L)N\b/i],
    label: "DMS transaction appears with conflicting CV01N/CVO1N spelling",
  },
  {
    id: "transaction_co03_typo",
    patterns: [/\bCO03\b/i, /\bC003\b/i],
    label: "Order-display transaction appears with conflicting CO03/C003 spelling",
  },
]);

async function zipText(zip, name) {
  const entry = zip.file(name);
  return entry ? entry.async("string") : "";
}

export async function readDocxSource(filePath, { maximumFindings = 60 } = {}) {
  const [buffer, checksum, stat] = await Promise.all([
    fs.readFile(filePath),
    hashFile(filePath),
    fs.stat(filePath),
  ]);
  const zip = await JSZip.loadAsync(buffer);
  const [documentXml, commentsXml, commentsExtendedXml] = await Promise.all([
    zipText(zip, "word/document.xml"),
    zipText(zip, "word/comments.xml"),
    zipText(zip, "word/commentsExtended.xml"),
  ]);
  if (!documentXml) throw new Error(`${basenameOnly(filePath)} is missing word/document.xml`);

  const paragraphs = parseParagraphs(documentXml);
  const comments = parseComments(commentsXml, commentsExtendedXml);
  const findings = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.insertionCount && !paragraph.deletionCount) continue;
    findings.push({
      id: `redline.p${paragraph.index}`,
      source: basenameOnly(filePath),
      revision: parseRevision(paragraphs),
      section: `word/document.xml paragraph ${paragraph.index}`,
      cellRange: null,
      condition: "Tracked content is applicable",
      severity: "warning",
      expectedValue: "controlled confirmation",
      nextAction: "Confirm the tracked insertion/deletion against the released document revision.",
      evidenceLevel: "provisional_redline",
      excerpt: paragraph.text,
      insertionCount: paragraph.insertionCount,
      deletionCount: paragraph.deletionCount,
    });
    if (findings.length >= maximumFindings) break;
  }

  const paragraphByComment = new Map();
  for (const paragraph of paragraphs) {
    for (const id of paragraph.commentIds) paragraphByComment.set(id, paragraph);
  }
  for (const comment of comments.filter((item) => !item.resolved)) {
    if (findings.length >= maximumFindings) break;
    const paragraph = paragraphByComment.get(comment.id);
    findings.push({
      id: `comment.${comment.id}`,
      source: basenameOnly(filePath),
      revision: parseRevision(paragraphs),
      section: paragraph
        ? `word/document.xml paragraph ${paragraph.index}`
        : `word/comments.xml comment ${comment.id}`,
      cellRange: null,
      condition: "Comment remains unresolved",
      severity: "warning",
      expectedValue: "comment resolved in a controlled revision",
      nextAction: "Resolve the source comment before treating the affected statement as controlled.",
      evidenceLevel: "unresolved_comment",
      excerpt: paragraph?.text || "",
    });
  }

  const allText = paragraphs.map((paragraph) => paragraph.text).join("\n");
  for (const conflict of KNOWN_CONFLICTS) {
    if (!conflict.patterns.every((pattern) => pattern.test(allText))) continue;
    findings.push({
      id: `conflict.${conflict.id}`,
      source: basenameOnly(filePath),
      revision: parseRevision(paragraphs),
      section: "document-wide terminology check",
      cellRange: null,
      condition: "Conflicting values are both present",
      severity: "warning",
      expectedValue: "one confirmed controlled value",
      nextAction: "Confirm the correct value with the document owner.",
      evidenceLevel: "conflict",
      excerpt: conflict.label,
    });
  }

  const mediaCount = Object.keys(zip.files).filter(
    (name) => name.startsWith("word/media/") && !zip.files[name].dir,
  ).length;
  if (mediaCount) {
    findings.push({
      id: "embedded_images",
      source: basenameOnly(filePath),
      revision: parseRevision(paragraphs),
      section: `word/media (${mediaCount} embedded image${mediaCount === 1 ? "" : "s"})`,
      cellRange: null,
      condition: "A requirement is inferred from a screenshot",
      severity: "info",
      expectedValue: "textual controlled confirmation",
      nextAction: "Use screenshots as examples only; confirm field values in controlled text.",
      evidenceLevel: "example_screenshot",
    });
  }

  return {
    kind: "docx",
    signals: [
      /\bWGOT\b/i.test(allText) && "WGOT",
      /\bWGBOT\b/i.test(allText) && "WGBOT",
      /\bCV01N\b/i.test(allText) && "CV01N",
      /\bCVO1N\b/i.test(allText) && "CVO1N",
      /\bCVOLN\b/i.test(allText) && "CVOLN",
      /\bCO03\b/i.test(allText) && "CO03",
      /\bC003\b/i.test(allText) && "C003",
    ].filter(Boolean),
    manifest: {
      fileName: basenameOnly(filePath),
      type: "docx",
      sha256: checksum,
      sizeBytes: stat.size,
      revision: parseRevision(paragraphs),
      statistics: {
        paragraphCount: paragraphs.length,
        trackedInsertions: (documentXml.match(/<w:ins\b/gi) || []).length,
        trackedDeletions: (documentXml.match(/<w:del\b/gi) || []).length,
        comments: comments.length,
        unresolvedComments: comments.filter((item) => !item.resolved).length,
        embeddedImages: mediaCount,
        omittedFindings: Math.max(
          0,
          paragraphs.filter((paragraph) => paragraph.insertionCount || paragraph.deletionCount).length +
            comments.filter((item) => !item.resolved).length -
            maximumFindings,
        ),
      },
    },
    findings,
  };
}

export const __private__ = Object.freeze({
  decodeXml,
  extractXmlText,
  parseComments,
  parseParagraphs,
});
