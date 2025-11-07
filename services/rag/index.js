// services/rag/index.js
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
  kClient = 6,           // сколько контекстов из клиентских документов
  kWeb = 3,              // сколько контекстов из краулера (опционально)
  includeWeb = true,     // можно выключить если нужен только клиентский RAG
  minTextLen = 25        // отсечём слишком короткие куски
}) {
  const contexts = [];

  // -------- 1) Клиентские документы (MongoDB $text) --------
  // Нужен текстовый индекс: см. ниже раздел "Индекс"
  let chunks = [];
  if (clientId) {
    try {
      chunks = await ClientDocChunk.find(
   { clientId, ...(query ? { $text: { $search: query } } : {}) },
        { score: { $meta: "textScore" } } // добавим поле score
      )
        .sort(query ? { score: { $meta: "textScore" } } : { createdAt: -1 })
        .limit(kClient * 2) // возьмём с запасом, потом профильтруем
        .lean();
    } catch (e) {
      // fallback если по какой-то причине $text не сработал
      const rx = new RegExp(escapeRegExp(query || ""), "i");
      chunks = await ClientDocChunk.find({ clientId, content: rx })
        .sort({ createdAt: -1 })
        .limit(kClient * 2)
        .lean();
    }

    // Подтянем метаданные документов (имя, ссылка и т.п.)
    const docIds = [...new Set(chunks.map(c => String(c.documentId)).filter(Boolean))];
    const docs = docIds.length
      ? await ClientDocument.find({ _id: { $in: docIds } })
          .select("_id originalName publicUrl s3Key mimeType")
          .lean()
      : [];
    const docMap = new Map(docs.map(d => [String(d._id), d]));

    // Нормализуем в формат, который уже понимает buildPrompt/fastAnswer
    const normalizedClient = chunks
      .filter(c => (c.content || "").trim().length >= minTextLen)
      .slice(0, kClient)
      .map((c, i) => {
        const d = c.documentId ? docMap.get(String(c.documentId)) : null;

        // Строим "URL" для цитаты:
        // - при наличии публичной ссылки на документ — используем её
        // - иначе формируем внутреннюю ссылку на API с якорем страницы/чанка
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
          // buildPrompt/fastAnswer обычно смотрят на одно из полей: text | snippet | content
          text: c.content,
      snippet: c.content.slice(0, 500),
          score
        };
      });

    contexts.push(...normalizedClient);
  }

  // -------- 2) Веб-источники (краулер) — опционально --------
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

  // -------- 3) Дедуп, сортировка, усечём до разумного k --------
  const deduped = dedupeByUrl(contexts);
  deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Отдадим сразу «плоский» список
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
 

// добавим #page= / #chunk= — чтобы при клике можно было вернуться к месту
function chunkAnchor(c) {
  // если в чанке есть страница – хорошо, если нет — используем id чанка
  if (c.page != null) return `page=${c.page}`;
  return `chunk=${c._id}`;
}

function addAnchor(url, anchor) {
  try {
    const u = new URL(url);
    if (u.hash) {
      // не перетираем чужой якорь
      return url;
    }
    return `${url}#${anchor}`;
  } catch {
    // для относительных URL (например, /api/...)
    return url.includes("#") ? url : `${url}#${anchor}`;
  }
}
