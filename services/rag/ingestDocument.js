// services/rag/ingestDocument.js
import fs from "fs/promises";
import { gunzipSync } from "zlib";
import path from "path";
import OpenAI from "openai";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"; // правильная сборка для Node
import ClientDocument from "../../models/ClientDocument.js";
import ClientDocChunk from "../../models/ClientDocChunk.js";

// Если есть готовый клиент S3 — оставляем импорт как есть.
// Для v2 будет s3.getObject(...).promise(), для v3 — s3.send(new GetObjectCommand(...))
import s3 from "../amazon/s3Client.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";

// =================== OpenAI ===================
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
    // AWS SDK v2
    if (s3 && typeof s3.getObject === "function") {
      const resp =
        (await s3.getObject({ Bucket: s3Bucket, Key: s3Key }).promise?.()) ||
        (await s3.getObject({ Bucket: s3Bucket, Key: s3Key })); // обёрнутые клиенты
      const body = resp.Body;
      return Buffer.isBuffer(body) ? body : await streamToBuffer(body);
    }
    // AWS SDK v3
    if (s3 && typeof s3.send === "function") {
      const resp = await s3.send(new GetObjectCommand({ Bucket: s3Bucket, Key: s3Key }));
      const body = resp.Body;
      return Buffer.isBuffer(body) ? body : await streamToBuffer(body);
    }
    // Кастомный helper (если есть)
    if (s3 && typeof s3.getObjectBuffer === "function") {
      return await s3.getObjectBuffer({ Bucket: s3Bucket, Key: s3Key });
    }
    throw new Error("Unsupported S3 client: no getObject/send/getObjectBuffer");
  }

  if (localPath) return await fs.readFile(localPath);

  throw new Error("No source provided: either {s3Bucket,s3Key} or localPath is required");
}

function extFrom({ mimeType, localPath, s3Key }) {
  const name = localPath || s3Key || "";
  return path.extname(name).toLowerCase();
}

// =================== Parsing ===================
async function parsePDFBuffer(buffer) {
  // pdfjs в Node требует Uint8Array с корректными offset/length
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
    const text = content.items.map(it => it.str || "").join(" ").replace(/\s+/g, " ").trim();
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
  // remove UTF-8 BOM
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s;
}

async function parseByBuffer({ buffer, mimeType, ext }) {
  // PDF
  if (mimeType?.includes("pdf") || ext === ".pdf") {
    return await parsePDFBuffer(buffer);
  }

  // DOCX
  if (mimeType?.includes("word") || ext === ".docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: value || "", pages: 0 };
  }

  // XLSX/XLS → сводим в текст
  if (
    ext === ".xlsx" || ext === ".xls" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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

  // TXT / явные текстовые форматы
  const isTextMime = typeof mimeType === "string" && /^text\//i.test(mimeType);
  const isTextExt = [".txt", ".md", ".csv", ".log"].includes(ext);
  if (isTextMime || isTextExt || !mimeType) {
    // если вдруг в S3 лежит gzipped-текст — распакуем
    const gzHeader = Buffer.isBuffer(buffer) ? buffer.slice(0, 2) : Buffer.from(buffer).slice(0, 2);
    const looksGzip = gzHeader.length === 2 && gzHeader[0] === 0x1f && gzHeader[1] === 0x8b;
    const decoded = looksGzip ? gunzipSync(Buffer.from(buffer)) : buffer;
    return { text: bufferToUtf8(decoded), pages: 0 };
  }

  // Фолбэк: пробуем как UTF-8
  return { text: bufferToUtf8(buffer), pages: 0 };
}

// =================== Text normalize + FULL chunking (без потерь) ===================
function normalizeText(raw) {
  return String(raw || "")
    .replace(/\r/g, "\n")
    .replace(/\t+/g, " ")
    .replace(/[ \u00A0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Полный чанкер с перекрытием:
 * - идём по тексту окнами chunkSize
 * - стараемся заканчивать на границе предложения/строки (если рядом)
 * - перекрытие overlap, чтобы не терять смысл на стыках
 */
export function splitIntoChunksFull(text, {
  chunkSize = 1400,
  overlap   = 200,
  normalize = true
} = {}) {
  let s = text || "";
  if (normalize) {
    s = s.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  const chunks = [];
  let i = 0;
  while (i < s.length) {
    const end = Math.min(i + chunkSize, s.length);
    let slice = s.slice(i, end);

    // стараемся закончить на границе предложения/пункта, если недалеко
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
    i = (best > i ? best : end) - overlap; // шаг назад на overlap
    if (i < 0) i = 0;
  }
  return chunks.filter(Boolean);
}

// =================== Embeddings ===================
async function embedBatch(texts, { model = "text-embedding-3-small", retries = 3 } = {}) {
  if (!oai) throw new Error("OPENAI_API_KEY not configured");

  const MAX_PER_REQ = 64;
  const all = [];
  let attempt = 0;

  while (attempt <= retries) {
    try {
      for (let i = 0; i < texts.length; i += MAX_PER_REQ) {
        const part = texts.slice(i, i + MAX_PER_REQ);
        const res = await oai.embeddings.create({ model, input: part });
        all.push(...res.data.map(d => d.embedding));
      }
      return all;
    } catch (e) {
      attempt += 1;
      if (attempt > retries) throw e;
      await new Promise(r => setTimeout(r, 300 * attempt));
    }
  }
  return all;
}

// =================== Main ===================
/**
 * Ингест документа:
 * - читает из S3 или диска
 * - парсит в текст (PDF/Word/Excel/TXT)
 * - нормализует и бьёт на чанки с перекрытием (без потерь)
 * - делает эмбеддинги
 * - сохраняет в ClientDocChunk, обновляет ClientDocument
 */
export async function ingestDocument({
  clientId,
  siteId,
  documentId,
  title,
  // источник:
  localPath,    // опционально
  s3Key,        // опционально
  s3Bucket,     // опционально
  // метаданные:
  mimeType,     // желательно передавать
}) {
  // 1) читаем
  const buffer = await readSource({ localPath, s3Bucket, s3Key });

  // 2) парсим
  const ext = extFrom({ mimeType, localPath, s3Key });
  const parsed = await parseByBuffer({ buffer, mimeType, ext });
  const text = normalizeText(parsed.text);
  const pages = parsed.pages || 0;

  if (!text) {
    await ClientDocument.updateOne(
      { _id: documentId },
      { $set: { pages: 0, textPreview: "" } }
    );
    return { chunks: 0, pages: 0 };
  }

  // 3) Чанкируем ПОЛНОСТЬЮ, без отбрасывания хвостов
  const chunks = splitIntoChunksFull(text, {
    chunkSize: 1400,
    overlap: 200,
    normalize: false
  });

  // 4) Эмбеддинги
  const embeddings = await embedBatch(chunks, { model: "text-embedding-3-small" });

  // 5) Запись чанков (сначала удаляем старые этого документа)
  await ClientDocChunk.deleteMany({ documentId });

  const docs = chunks.map((content, idx) => ({
    clientId,
    siteId: siteId || null,
    documentId,
    title,
    page: 0,                // если нужна разметка по страницам — добавь сюда
    section: null,
    chunkIndex: idx,
    content,                // <— ключевое поле
    embedding: embeddings[idx],
    tokenCount: content.length,
    source: s3Key || localPath || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  if (docs.length) await ClientDocChunk.insertMany(docs);

  // 6) обновим документ
  await ClientDocument.updateOne(
    { _id: documentId },
    { $set: { pages, textPreview: text.slice(0, 1500) } }
  );

  return { chunks: docs.length, pages };
}
