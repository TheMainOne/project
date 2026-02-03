// services/rag/retrieveHybrid.js
import mongoose from "mongoose";
import ClientDocChunk from "../../models/ClientDocChunk.js";
import ClientDocument from "../../models/ClientDocument.js";
import OpenAI from "openai";

const oai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const VECTOR_K = 80;     // сколько кандидатов брать из vector search
const FINAL_K  = 12;     // сколько отдаём в итоге
const SINGLE_DOC_LIMIT = 7; // если все чанки из одного документа

// =============================
// 1. Embed query
// =============================
async function embedQuery(text) {
  if (!oai) return null;
  const r = await oai.embeddings.create({
    model: "text-embedding-3-small",
    input: text
  });
  return r.data[0].embedding;
}

// =============================
// Cosine similarity
// =============================
function cosineSim(a, b) {
  if (!a || !b) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// =============================
// Soft-boost по типу
// =============================
function computeTypeBoost(chunkType, intentTypes) {
  if (!intentTypes?.length) return 0;

  // пример: intent ['contacts'] → повышаем контакты
  if (intentTypes.includes(chunkType)) return 1.0;   // максимальный буст
  return 0.0;
}

// =============================
// Tag boost
// =============================
function computeTagBoost(tags, queryTokens) {
  if (!tags || !tags.length) return 0;
  let score = 0;
  for (const t of tags) {
    if (queryTokens.has(t.toLowerCase())) score += 0.2;
  }
  return Math.min(score, 1.0);
}

async function getActiveDocumentIds({ clientId, siteId }) {
  const filter = {
    isActive: true,
  };

  if (clientId) filter.clientId = clientId;
  else if (siteId) filter.siteId = siteId;

  const docs = await ClientDocument.find(filter).select("_id").lean();
  return docs.map((d) => d._id);
}

// =============================
// Hybrid retriever
// =============================
export async function retrieveHybrid({
  clientId,
  siteId,
  query,
  intentTypes = [],   // ← добавляем классифицированные chunkTypes
  k = FINAL_K
}) {
  if (!oai) return { contexts: [] };

  // 1. Embed query
  const qEmb = await embedQuery(query);
  if (!qEmb) return { contexts: [] };

  // 2. Build $vectorSearch filter
  let cid = null;
  if (clientId && mongoose.isValidObjectId(clientId)) {
    cid = new mongoose.Types.ObjectId(clientId);
  }

  const activeDocumentIds = await getActiveDocumentIds({ clientId: cid, siteId });
  if (!activeDocumentIds.length) return { contexts: [] };

  const filter = {
    documentId: { $in: activeDocumentIds },
  };
  if (cid) filter.clientId = cid;
  // if (siteId) filter.siteId = siteId;

  // 3. Vector search (top 80)
  let vecRows = [];
  try {
    console.log("[RAG][hybrid] scope:", {
      hasClient: Boolean(cid),
      hasSite: Boolean(siteId),
      activeDocs: activeDocumentIds.length
    });
    vecRows = await ClientDocChunk.aggregate([
      {
        $vectorSearch: {
          index: "default",
          path: "embedding",
          queryVector: qEmb,
          numCandidates: VECTOR_K,
          limit: VECTOR_K,
          ...(Object.keys(filter).length ? { filter } : {})
        }
      },
      {
        $project: {
          content: 1,
          title: 1,
          chunkType: 1,
          tags: 1,
          semanticSummary: 1,
          embeddingSummary: 1,
          page: 1,
          documentId: 1,
          score: { $meta: "vectorSearchScore" }
        }
      }
    ]);
  } catch (e) {
    console.error("[RAG][hybrid] vector search error:", e?.message);
    return { contexts: [] };
  }

  if (!vecRows.length) return { contexts: [] };

  // 4. Tokenize query for tagBoost
  const qTokens = new Set(
    query.toLowerCase().split(/\W+/).filter(Boolean)
  );

  // 5. Compute hybrid score
  const enriched = vecRows.map((r) => {
     const baseScore = Number(r.score);
     const safeBaseScore = Number.isFinite(baseScore) ? baseScore : 0;
    // semantic similarity based on summary embedding
    let semSim = 0;
    if (r.embeddingSummary) {
      // embeddingSummary присутствует только если ты добавишь его при ingest
      semSim = cosineSim(qEmb, r.embeddingSummary);
    }

    const typeBoost = computeTypeBoost(r.chunkType, intentTypes);
    const tagBoost = computeTagBoost(r.tags, qTokens);

    const finalScore =
      safeBaseScore * 0.55 +
      typeBoost * 0.20 +
      tagBoost * 0.10 +
      semSim * 0.15;

    return { ...r, finalScore };
  });

  // 6. группируем по documentId
  const groups = new Map();
  for (const row of enriched) {
    const did = row.documentId ? String(row.documentId) : "unknown";
    if (!groups.has(did)) groups.set(did, []);
    groups.get(did).push(row);
  }

  // 7. Если чанков много и один документ → выбираем лучшие 7
  if (groups.size === 1) {
    const onlyKey = [...groups.keys()][0];
    const rows = groups.get(onlyKey);
    rows.sort((a, b) => b.finalScore - a.finalScore);
    const sliced = rows.slice(0, SINGLE_DOC_LIMIT);
    return { contexts: normalizeChunks(sliced) };
  }

  // 8. Multi-doc balancing:
  //    Берём по 1–3 чанка из каждого документа, потом общая сортировка
  const perDoc = [];
  for (const [docId, rows] of groups.entries()) {
    rows.sort((a, b) => b.finalScore - a.finalScore);
    perDoc.push(...rows.slice(0, 3));
  }

  // 9. Общая сортировка и ограничение итоговых контекстов
  perDoc.sort((a, b) => b.finalScore - a.finalScore);
  const finalRows = perDoc.slice(0, k);



  return { contexts: normalizeChunks(finalRows) };
}

// =============================
// Normalize output
// =============================
function normalizeChunks(rows) {
  return rows.map((r) => ({
    source: "client-doc",
    url: r.url || "",       
    title: r.title || "Client Document",
    text: r.content,
    snippet: String(r.content || "").slice(0, 500),
    score: Number.isFinite(r.finalScore) ? r.finalScore : 0
  }));
}
