import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { wordBlocks } from "./word-blocks.js";
import { matrixBlocks } from "./approval-matrix.js";
import { digest } from "../src/ai/knowledge.js";

function markdownBlocks(text) {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/).flatMap(line => {
    const value = line.trim();
    if (!value || /^\[[^\]]+\]:\s+\S+/.test(value) || /^\|[\s:|-]+\|$/.test(value)) return [];
    const match = /^(#{1,6})\s+(.+)/.exec(value);
    return [{ level: match?.[1].length || 0, text: match ? match[2] : value.replace(/\[([^\]]+)\]\[[^\]]+\]/g, "$1") }];
  });
}

export function publish(directory) {
  const source = join(directory, "sources");
  const { documents } = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(documents) || !documents.length) throw new Error("В manifest.json нужно указать хотя бы один источник.");
  const records = [], sections = [], ids = new Set();
  const originals = join(directory, "originals");
  mkdirSync(originals, { recursive: true });
  for (const doc of documents) {
    const { id, title, revision, kind, file } = doc;
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(id) || ids.has(id) || ![title,revision,file].every(v => typeof v === "string" && v.trim()) ||
        /[/\\:\0]/.test(file) || !/\.(docx|md|csv)$/i.test(file) || !["handbook","procedure","guidance","precedent"].includes(kind)) throw new Error("Проверь источник в manifest.json: " + id);
    ids.add(id);
    const path = join(source, file);
    if (statSync(path).size > 20_000_000) throw new Error("Исходный файл превышает 20 МБ: " + file);
    const sourceBytes = readFileSync(path);
    const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
    const original = join(originals, sourceHash + file.slice(file.lastIndexOf(".")).toLowerCase());
    const temp = original + "." + randomUUID() + ".tmp";
    if (!existsSync(original)) {
      try { writeFileSync(temp, sourceBytes, { flag: "wx" }); renameSync(temp, original); }
      finally { rmSync(temp, { force: true }); }
    }
    let blocks;
    if (/\.docx$/i.test(file)) blocks = wordBlocks(sourceBytes);
    else if (/\.csv$/i.test(file)) blocks = matrixBlocks(sourceBytes.toString("utf8"), revision);
    else blocks = markdownBlocks(sourceBytes.toString("utf8"));
    const headings = [], text = [];
    let counter = 0;
    const flush = () => {
      if (!text.length) return;
      const heading = headings.filter(Boolean).join(" › ") || title;
      sections.push({ id: "kb:" + id + ":" + ++counter, document: id, heading, text: text.splice(0).join("\n") });
    };
    let length = 0;
    for (const block of blocks) {
      if (block.level) {
        flush(); length = 0; headings.length = block.level; headings[block.level-1] = block.text;
      } else {
        for (let offset = 0; offset < block.text.length; offset += 2200) {
          const part = block.text.slice(offset, offset + 2200);
          if (length + part.length + 1 > 2600) { flush(); length = 0; }
          text.push(part); length += part.length + 1;
        }
      }
    }
    flush();
    if (!counter) throw new Error("В источнике нет текста для публикации: " + file);
    records.push({ id, title, revision, kind, file, sourceHash });
  }
  const data = { format: 1, documents: records, sections };
  const version = digest(data);
  const versions = join(directory, "versions");
  mkdirSync(versions, { recursive: true });
  const target = join(versions, version + ".json");
  // Only a complete index can become active, including on a simultaneous publication.
  function replace(path, value) {
    const temp = path + "." + randomUUID() + ".tmp";
    try { writeFileSync(temp, JSON.stringify(value), { flag: "wx" }); renameSync(temp, path); }
    finally { rmSync(temp, { force: true }); }
  }
  if (!existsSync(target) || digest(JSON.parse(readFileSync(target, "utf8"))) !== version) replace(target, data);
  replace(join(directory, "active.json"), { version });
  return { version, documents: records.length, sections: sections.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const directory = fileURLToPath(new URL("../data/knowledge/", import.meta.url));
    const info = publish(directory);
    console.log("База опубликована. Источников: %d, фрагментов: %d. Версия %s", info.documents, info.sections, info.version);
  } catch (error) { console.error("Публикация не выполнена.", error.message); process.exitCode = 1; }
}
