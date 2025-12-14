// services/rag/ingestDocument.js
import fs from "fs/promises";
import { gunzipSync } from "zlib";
import path from "path";
import OpenAI from "openai";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import mongoose from "mongoose"; // ← добавлено

import ClientDocument from "../../models/ClientDocument.js";
import ClientDocChunk from "../../models/ClientDocChunk.js";

import s3 from "../amazon/s3Client.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";

// ===== Config (под свои реалии можно вынести в .env) =====
const SMALL_DOC_CHARS = Number(process.env.RAG_SMALL_DOC_CHARS || 6000); // до этого размера — 1 чанк
const FULL_DOC_MAX_CHARS = Number(process.env.RAG_FULL_DOC_MAX_CHARS || 28000); // максимум для «полного» чанка
const DEFAULT_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 1400);
const DEFAULT_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 200);

const oai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// =================== Utils (S3 / IO) ===================
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readSource({ localPath, s3Bucket, s3Key }) {
  if (s3Bucket && s3Key) {
    if (s3 && typeof s3.getObject === "function") {
      const resp =
        (await s3.getObject({ Bucket: s3Bucket, Key: s3Key }).promise?.()) ||
        (await s3.getObject({ Bucket: s3Bucket, Key: s3Key }));
      const body = resp.Body;
      return Buffer.isBuffer(body) ? body : await streamToBuffer(body);
    }
    if (s3 && typeof s3.send === "function") {
      const resp = await s3.send(
        new GetObjectCommand({ Bucket: s3Bucket, Key: s3Key })
      );
      const body = resp.Body;
      return Buffer.isBuffer(body) ? body : await streamToBuffer(body);
    }
    if (s3 && typeof s3.getObjectBuffer === "function") {
      return await s3.getObjectBuffer({ Bucket: s3Bucket, Key: s3Key });
    }
    throw new Error("Unsupported S3 client: no getObject/send/getObjectBuffer");
  }
  if (localPath) return await fs.readFile(localPath);
  throw new Error(
    "No source provided: either {s3Bucket,s3Key} or localPath is required"
  );
}

function extFrom({ mimeType, localPath, s3Key }) {
  const name = localPath || s3Key || "";
  return path.extname(name).toLowerCase();
}

// =================== Parsing ===================
async function parsePDFBuffer(buffer) {
  let data;
  if (Buffer.isBuffer(buffer)) {
    data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else if (buffer instanceof Uint8Array) {
    data = buffer;
  } else {
    data = new Uint8Array(buffer);
  }
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => it.str || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pageTexts.push(text);
  }
  const text = pageTexts.join("\n\n--- PAGE BREAK ---\n\n");
  return { text, pages: pdf.numPages || pageTexts.length || 0 };
}

function bufferToUtf8(bufLike) {
  const buf = Buffer.isBuffer(bufLike)
    ? bufLike
    : bufLike instanceof Uint8Array
    ? Buffer.from(bufLike)
    : Buffer.from(bufLike || []);
  let s = buf.toString("utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // strip BOM
  return s;
}

async function parseByBuffer({ buffer, mimeType, ext }) {
  if (mimeType?.includes("pdf") || ext === ".pdf") {
    return await parsePDFBuffer(buffer);
  }
  if (mimeType?.includes("word") || ext === ".docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: value || "", pages: 0 };
  }
  if (
    ext === ".xlsx" ||
    ext === ".xls" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const parts = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: " ", RS: "\n" });
      if (csv?.trim()) parts.push(`# ${sheetName}\n${csv}`);
    }
    return { text: parts.join("\n\n"), pages: 0 };
  }
  const isTextMime = typeof mimeType === "string" && /^text\//i.test(mimeType);
  const isTextExt = [".txt", ".md", ".csv", ".log"].includes(ext);
  if (isTextMime || isTextExt || !mimeType) {
    const gzHeader = Buffer.isBuffer(buffer)
      ? buffer.slice(0, 2)
      : Buffer.from(buffer).slice(0, 2);
    const looksGzip =
      gzHeader.length === 2 && gzHeader[0] === 0x1f && gzHeader[1] === 0x8b;
    const decoded = looksGzip ? gunzipSync(Buffer.from(buffer)) : buffer;
    return { text: bufferToUtf8(decoded), pages: 0 };
  }
  return { text: bufferToUtf8(buffer), pages: 0 };
}

// =================== Normalize + Chunking ===================
function normalizeText(raw) {
  // сохраняем абзацы (двойные \n), но одиночные переносы превращаем в пробелы
  let s = String(raw || "")
    .replace(/\r/g, "\n")
    .replace(/[ \u00A0\t]+/g, " ");

  s = s
    .replace(/\n{3,}/g, "\n\n") // >2 переносов -> 2
    .replace(/([^\n])\n(?!\n)/g, "$1 ") // одиночный перенос -> пробел (чтобы не рвало слова)
    .replace(/[ ]{2,}/g, " ")
    .trim();

  return s;
}

/**
 * Полный чанкер с перекрытием.
 */
export function splitIntoChunksFull(
  text,
  {
    chunkSize = DEFAULT_CHUNK_SIZE,
    overlap = DEFAULT_OVERLAP,
    normalize = true,
  } = {}
) {
  let s = text || "";
  if (normalize) {
    s = s
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const chunks = [];
  let i = 0;
  while (i < s.length) {
    const end = Math.min(i + chunkSize, s.length);
    let slice = s.slice(i, end);

    // стараемся закрыть чанк на границе предложения/строки, если рядом
    let best = end;
    for (const re of [/[.!?]\s/g, /\n/g]) {
      const local = slice.search(re);
      if (local !== -1 && slice.length - local <= 200) {
        best = i + local + 1;
        break;
      }
    }
    if (best > i) slice = s.slice(i, best);

    chunks.push(slice.trim());
    if (end === s.length) break;
    i = (best > i ? best : end) - overlap;
    if (i < 0) i = 0;
  }
  return chunks.filter(Boolean);
}

// =================== Embeddings ===================
async function embedBatch(
  texts,
  { model = "text-embedding-3-small", retries = 3 } = {}
) {
  if (!oai) throw new Error("OPENAI_API_KEY not configured");

  const MAX_PER_REQ = 64;
  const all = [];
  let attempt = 0;

  while (attempt <= retries) {
    try {
      for (let i = 0; i < texts.length; i += MAX_PER_REQ) {
        const part = texts.slice(i, i + MAX_PER_REQ);
        const res = await oai.embeddings.create({ model, input: part });
        all.push(...res.data.map((d) => d.embedding));
      }
      return all;
    } catch (e) {
      attempt += 1;
      if (attempt > retries) throw e;
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  return all;
}

async function enrichChunkWithLLM(content, { title } = {}) {
  if (!oai) return null;

  const safeContent = String(content || "").slice(0, 4000);
  const pageTitle = title
    ? `Page title (may help you understand context): "${title}".`
    : "";

  const prompt = `
You help to index website content for Retrieval-Augmented Generation (RAG) search.

You are given a fragment of text (a chunk). Your tasks:

1) Briefly summarize the meaning of the chunk in 2–3 sentences.
2) Decide the main category of this chunk. Choose ONE of:
   - "contacts"      – contact information, emails, phone numbers, physical addresses, contact forms, support contacts.
   - "services"      – description of services, what the company does for clients.
   - "products"      – description of specific products, product features, technical specs.
   - "case_study"    – case studies, success stories, campaign results, client examples.
   - "about"         – about the company, team, mission, values, offices, geography, history.
   - "pricing"       – prices, budgets, fees, minimums, payment terms, pricing plans.
   - "faq"           – frequently asked questions and their answers.
   - "legal"         – terms of use, privacy policy, cookies, legal notices, compliance text.
   - "blog_article"  – blog posts, news, insights, educational articles.
   - "support"       – help center, troubleshooting, step-by-step guides, how-to instructions.
   - "other"         – everything else that does not clearly fit the categories above.

3) Optionally add 1–5 short tags (one or two words each) that help search (for example: "Google Ads", "pricing", "contact form", "privacy").

Very important rules:
- DO NOT invent new facts, phone numbers, email addresses, URLs or people — use ONLY the information that is present in the chunk.
- If there are no contacts in the text, do NOT fabricate them.
- If it is hard to choose a type, or the text mixes multiple topics without a clear dominant one, use "other".
- If the content is mostly navigation, cookie banners, or UI labels with no meaningful information, also use "other".

${pageTitle}

Return STRICT JSON (no markdown, no comments) in the following format:
{
  "summary": "string, 2-3 sentences",
  "type": "contacts|services|products|case_study|about|pricing|faq|legal|blog_article|support|other",
  "tags": ["tag1", "tag2"]
}

Chunk text:
"""${safeContent}"""
  `.trim();

  const res = await oai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant that returns strict JSON with no extra text.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim() || "{}";

  try {
    const parsed = JSON.parse(raw);
    const summary = String(parsed.summary || "").trim();
    const type = String(parsed.type || "other").trim();
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((t) => String(t).trim()).filter(Boolean)
      : [];

    return {
      semanticSummary: summary || null,
      chunkType: type || "other",
      tags,
    };
  } catch (e) {
    // если JSON не распарсился — просто не ставим enrichment
    console.error("[RAG][enrichChunk] JSON parse error:", e?.message, raw);
    return null;
  }
}

// =================== Main ===================
/**
 * Ингест документа с «small-doc mode» и «full-doc sentinel».
 */
export async function ingestDocument({
  clientId,
  siteId,
  documentId,
  title,
  // источник:
  localPath,
  s3Key,
  s3Bucket,
  // метаданные:
  mimeType,
}) {
  // ← Приводим clientId к ObjectId (МИНИМАЛЬНАЯ ПРАВКА)
  const clientObjectId =
    clientId instanceof mongoose.Types.ObjectId
      ? clientId
      : mongoose.isValidObjectId(clientId)
      ? new mongoose.Types.ObjectId(clientId)
      : null;

  if (!clientObjectId) {
    throw new Error("ingestDocument: invalid clientId");
  }

  // 1) читаем источник
  const buffer = await readSource({ localPath, s3Bucket, s3Key });

  // 2) парсим
  const ext = extFrom({ mimeType, localPath, s3Key });
  const parsed = await parseByBuffer({ buffer, mimeType, ext });
  const textRaw = parsed.text || "";
  const text = normalizeText(textRaw);
  const pages = parsed.pages || 0;

  if (!text) {
    await ClientDocument.updateOne(
      { _id: documentId },
      { $set: { pages: 0, textPreview: "" } }
    );
    return { chunks: 0, pages: 0 };
  }

  // 3) выбираем стратегию чанкинга
  let chunks = [];
  const len = text.length;

  if (len <= SMALL_DOC_CHARS) {
    // Small-doc mode: один чанк = весь документ
    chunks = [text];
  } else {
    // Обычный режим: бьём на перекрывающиеся куски
    chunks = splitIntoChunksFull(text, {
      chunkSize: DEFAULT_CHUNK_SIZE,
      overlap: DEFAULT_OVERLAP,
      normalize: false,
    });
  }

  let fullSentinel = null;
  if (
    len <= FULL_DOC_MAX_CHARS &&
    !(chunks.length === 1 && chunks[0] === text)
  ) {
    fullSentinel = text;
  }

  // 4) LLM-обогащение чанков (summary + type + tags)
  const enrichments = [];
  for (const c of chunks) {
    try {
      const enriched = await enrichChunkWithLLM(c, { title });
      enrichments.push(enriched);
    } catch (e) {
      console.error("[RAG][enrichChunk] error:", e?.message);
      enrichments.push(null);
    }
  }

  let fullSentinelEnrichment = null;
  if (fullSentinel) {
    try {
      fullSentinelEnrichment = await enrichChunkWithLLM(fullSentinel, {
        title,
      });
    } catch (e) {
      console.error("[RAG][enrichChunk full] error:", e?.message);
    }
  }

  // 5) Эмбеддинги
  const embedInputs = fullSentinel ? [...chunks, fullSentinel] : chunks;
  const embeddings = await embedBatch(embedInputs, {
    model: "text-embedding-3-small",
  });

  // 6) запись: сначала удаляем прежние чанки этого документа
  await ClientDocChunk.deleteMany({ documentId });

  const docs = [];
  // обычные чанки
  chunks.forEach((content, idx) => {
    const enr = enrichments[idx] || {};

    docs.push({
      clientId: clientObjectId,
      siteId: siteId || null,
      documentId,
      title,
      page: 0,
      section: null,
      chunkIndex: idx,
      isFull: false,
      content,
      embedding: embeddings[idx],
      embeddingSummary: embeddings[idx], 
      tokenCount: content.length,
      source: s3Key || localPath || null,
      semanticSummary: enr.semanticSummary || null,
      chunkType: enr.chunkType || "other",
      tags: Array.isArray(enr.tags) ? enr.tags : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // sentinel-чанк (если есть)
  if (fullSentinel) {
    const enr = fullSentinelEnrichment || {};

    docs.push({
      clientId: clientObjectId,
      siteId: siteId || null,
      documentId,
      title,
      page: 0,
      section: "FULL_DOC",
      chunkIndex: chunks.length,
      isFull: true,
      content: fullSentinel,
      embedding: embeddings[embeddings.length - 1],
      embeddingSummary: embeddings[embeddings.length - 1],
      tokenCount: fullSentinel.length,
      source: s3Key || localPath || null,
      semanticSummary: enr.semanticSummary || null,
      chunkType: enr.chunkType || "other",
      tags: Array.isArray(enr.tags) ? enr.tags : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  if (docs.length) await ClientDocChunk.insertMany(docs);

  // 7) обновим документ
  await ClientDocument.updateOne(
    { _id: documentId },
    {
      $set: {
        pages,
        textPreview: text.slice(0, 1500),
        clientId: clientObjectId,
      },
    } // ← сохраним clientId в документе тоже
  );

  return {
    chunks: docs.length,
    pages,
    smallDocMode: len <= SMALL_DOC_CHARS,
    hasFullSentinel: !!fullSentinel,
  };
}
