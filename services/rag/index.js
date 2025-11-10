// services/rag/index.js
import mongoose from "mongoose"; // ← добавлено
import ClientDocChunk from "../../models/ClientDocChunk.js";
import ClientDocument from "../../models/ClientDocument.js";
import { retrieveTopK } from "../web_crawler/core.js";

/**
 * Унифицированный ретрив: сначала клиентские документы (RAG),
 * затем (опционально) сайт-контент из краулера, и объединяем.
 */
export async function retrieveUnified({
  clientId,
  siteId,
  query,
  kClient = 6,
  kWeb = 3,
  includeWeb = true,
  minTextLen = 25
}) {
  const cid =
    clientId instanceof mongoose.Types.ObjectId
      ? clientId
      : (mongoose.isValidObjectId(clientId) ? new mongoose.Types.ObjectId(clientId) : null);

  if (!cid) return { contexts: [] };

  const contexts = [];

  // -------- 1) Клиентские документы (MongoDB $text) --------
  let chunks = [];
  try {
    chunks = await ClientDocChunk.find(
      { clientId: cid, ...(query ? { $text: { $search: query } } : {}) },
      { score: { $meta: "textScore" } }
    )
      .sort(query ? { score: { $meta: "textScore" } } : { createdAt: -1 })
      .limit(kClient * 2)
      .lean();
  } catch (e) {
    const rx = new RegExp(escapeRegExp(query || ""), "i");
    chunks = await ClientDocChunk.find({ clientId: cid, content: rx })
      .sort({ createdAt: -1 })
      .limit(kClient * 2)
      .lean();
  }

  const docIds = [...new Set(chunks.map(c => c.documentId).filter(Boolean))];
  const docs = docIds.length
    ? await ClientDocument.find({ _id: { $in: docIds } })
        .select("_id originalName publicUrl s3Key mimeType")
        .lean()
    : [];
  const docMap = new Map(docs.map(d => [String(d._id), d]));

  const normalizedClient = chunks
    .filter(c => (c.content || "").trim().length >= minTextLen)
    .slice(0, kClient)
    .map((c) => {
      const d = c.documentId ? docMap.get(String(c.documentId)) : null;
      const url =
        d?.publicUrl
          ? addAnchor(d.publicUrl, chunkAnchor(c))
          : `/api/client-documents/${String(c.documentId)}?chunk=${c._id}`;

      const title = d?.originalName || c.title || "Client Document";
      const score = typeof c.score === "number" ? c.score : 0.5;

      return {
        source: "client-doc",
        url,
        title,
        text: c.content,
        snippet: c.content.slice(0, 500),
        score
      };
    });

  contexts.push(...normalizedClient);

  // -------- 2) Веб-источники (краулер) — опционально --------
  // (оставляю закомментированным, как в твоем коде)
  // if (includeWeb && siteId && siteId !== "unknown-site") {
  //   try {
  //     const web = await retrieveTopK(siteId, query, { k: kWeb, softLimit: 300, minScore: 0.18 });
  //     const normalizedWeb = (web || []).map(w => ({
  //       source: "web",
  //       url: w.url,
  //       title: w.title || "Page",
  //       text: w.text || w.snippet || "",
  //       snippet: w.snippet || (w.text || "").slice(0, 500),
  //       score: w.score ?? 0.4
  //     }));
  //     contexts.push(...normalizedWeb);
  //   } catch (e) {
  //     console.error("[RAG] retrieveTopK error:", e?.message || e);
  //   }
  // }

  const deduped = dedupeByUrl(contexts);
  deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return { contexts: deduped.slice(0, kClient + (includeWeb ? kWeb : 0)) };
}

// ====== helpers ======
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
