import { createHash } from "node:crypto";
import fs from "node:fs/promises";

export const MAX_ECN_EXCERPT_LENGTH = 240;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function hashFile(filePath) {
  return sha256(await fs.readFile(filePath));
}

export function sanitizeExcerpt(value, maximumLength = MAX_ECN_EXCERPT_LENGTH) {
  const clean = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  return clean.length <= maximumLength
    ? clean
    : `${clean.slice(0, Math.max(0, maximumLength - 1)).trimEnd()}…`;
}

export function basenameOnly(filePath) {
  return String(filePath).replaceAll("\\", "/").split("/").pop();
}

export function assertPrivateArtifact(value, { maximumExcerptLength = MAX_ECN_EXCERPT_LENGTH } = {}) {
  const serialized = JSON.stringify(value);
  const problems = [];
  if (/([A-Za-z]:\\|\/Users\/|\/home\/)/.test(serialized)) {
    problems.push("absolute source path detected");
  }

  function walk(node, path = "root") {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, item] of Object.entries(node)) {
      if (key === "excerpt" && String(item ?? "").length > maximumExcerptLength) {
        problems.push(`${path}.${key} exceeds ${maximumExcerptLength} characters`);
      }
      if (["raw", "rawText", "documentXml", "workbookData", "sourcePath"].includes(key)) {
        problems.push(`${path}.${key} is a forbidden raw-source property`);
      }
      walk(item, `${path}.${key}`);
    }
  }
  walk(value);
  if (problems.length) {
    const error = new Error(`Private ECN artifact policy failed: ${problems.join("; ")}`);
    error.code = "ECN_PRIVATE_ARTIFACT_POLICY";
    error.details = problems;
    throw error;
  }
  return true;
}
