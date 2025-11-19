// services/rag/index.js
import mongoose from "mongoose";
import ClientDocChunk from "../../models/ClientDocChunk.js";
import ClientDocument from "../../models/ClientDocument.js";
// import { retrieveTopK } ... // не нужно здесь



export async function retrieveUnified({
  clientId,
  siteId,
  query,
  kClient = Number(process.env.AIW_KCLIENT || 4),
  kWeb = 0,                 
  includeWeb = false,      
  minTextLen = 20
}) {
  // 1) коэрсим clientId в ObjectId (если возможно)
  let cid = null;
  if (clientId instanceof mongoose.Types.ObjectId) cid = clientId;
  else if (typeof clientId === "string" && mongoose.isValidObjectId(clientId)) {
    cid = new mongoose.Types.ObjectId(clientId);
  }

  const MAX_CTX_CHARS = 3000; // чтобы не слать в промпт огромные тексты

  // 2) базовый фильтр: берём чанки клиента ИЛИ по siteId
  const or = [];
  if (cid)  or.push({ clientId: cid });
  if (siteId) or.push({ siteId });
  if (!or.length) return { contexts: [] };

  const baseFilter = { $or: or };

  // 3) запрос — сначала пробуем RegExp по content/title (НЕ $text)
  //    $text нужен индекс, часто его нет → тишком отдаёт 0. Регексы надёжнее.
  const rx = query ? new RegExp(escapeRegExp(query), "i") : null;

  let chunks = [];
  try {
    chunks = await ClientDocChunk.find(
      rx ? { ...baseFilter, $or: [{ content: rx }, { title: rx }] } : baseFilter
    )
      .sort(rx ? { updatedAt: -1 } : { createdAt: -1 })
      .limit(kClient * 3)
      .lean();
  } catch (e) {
    console.warn("[RAG] chunks find error:", e?.message || e);
    chunks = [];
  }

  // 4) если ничего — возьмём последние чанки клиента/сайта, чтобы хоть что-то было
  if (!chunks.length) {
    chunks = await ClientDocChunk.find(baseFilter)
      .sort({ createdAt: -1 })
      .limit(kClient * 3)
      .lean();
  }

  // 5) подтянем документы для линков
  const docIds = [...new Set(chunks.map(c => c.documentId).filter(Boolean))];
  const docs = docIds.length
    ? await ClientDocument.find({ _id: { $in: docIds } })
        .select("_id originalName publicUrl s3Url s3Key mimeType")
        .lean()
    : [];
  const docMap = new Map(docs.map(d => [String(d._id), d]));

  // 6) нормализация контекстов
 const normalized = chunks
  .filter(c => (c.content || "").trim().length >= minTextLen)
  .map((c) => {
    const d = c.documentId ? docMap.get(String(c.documentId)) : null;

    const baseUrl =
      d?.publicUrl || d?.s3Url ||
      (d?._id ? `/api/client-documents/${String(d._id)}` : "");

    const url = baseUrl ? addAnchor(baseUrl, chunkAnchor(c)) : "";

    const fullText   = c.content || "";
    const trimmedText = fullText.slice(0, MAX_CTX_CHARS); // <-- ограничиваем размер

    return {
      source: "client-doc",
      url,
      title: d?.originalName || c.title || "Client Document",
      text: trimmedText,                    // в промпт уйдёт уже обрезанный текст
      snippet: trimmedText.slice(0, 500),
      score: typeof c.score === "number" ? c.score : (rx ? 0.6 : 0.4)
    };
  });

  // 7) дедуп и сортировка
const deduped = dedupeByUrl(normalized);
deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // 8) маленькая диагностика в лог (поможет, если снова будет 0)
  try {
    console.log("[RAG][unified] q:", JSON.stringify(query),
      "| cid:", cid ? String(cid) : "-",
      "| siteId:", siteId || "-",
      "| rawChunks:", chunks.length,
      "| out:", deduped.length
    );
  } catch {}

return { contexts: deduped.slice(0, kClient) };
}

// ====== helpers (оставь как есть, только убедись что они в файле) ======
function escapeRegExp(s) {
  return (s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function dedupeByUrl(items = []) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.url || it.title || it.text?.slice(0, 64);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
function chunkAnchor(c) {
  if (c.page != null) return `page=${c.page}`;
  return `chunk=${c._id}`;
}
function addAnchor(url, anchor) {
  try {
    const u = new URL(url);
    if (u.hash) return url;
    return `${url}#${anchor}`;
  } catch {
    return url.includes("#") ? url : `${url}#${anchor}`;
  }
}
