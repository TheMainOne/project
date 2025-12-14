// services/rag/retrieveHybrid.js
import mongoose from "mongoose";
import ClientDocChunk from "../../models/ClientDocChunk.js";
import OpenAI from "openai";

const oai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const VECTOR_K = 80;     // сколько кандидатов брать из vector search
const FINAL_K  = 12;     // сколько отдаём в итоге
const SINGLE_DOC_LIMIT = 7; // если все чанки из одного документа
const MMR_LAMBDA = Number(0.75);  // 0.7–0.85
const MMR_POOL   = Number(40);    // rerank pool перед MMR

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


async function summarizeQueryForEmbedding(query) {
  if (!oai) return null;

  const q = String(query || "").trim();
  if (!q) return "";

  // короткие запросы не трогаем
  if (q.length <= 80) return q;

  try {
    const res = await oai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.0,
      messages: [
        {
          role: "system",
          content:
            "Rewrite the user's query as a short search intent (max 12 words). No extra text.",
        },
        { role: "user", content: q },
      ],
    });

    const s = (res.choices[0]?.message?.content || "").trim();
    return s || q;
  } catch (e) {
    // fallback на исходный query
    return q;
  }
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

function minmaxNormalize(values) {
  if (!values.length) return { min: 0, max: 1 };
  let min = Infinity, max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  if (min === max) return { min, max: min + 1e-9 };
  return { min, max };
}

function norm01(x, min, max) {
  return (x - min) / ((max - min) || 1);
}

// cosine -1..1 -> 0..1
function cosineTo01(c) {
  return (c + 1) / 2;
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

function vecSim(a, b) {
  return cosineSim(a, b);
}

function pickVector(row) {
  // для разнообразия лучше summary-embedding; если нет — embedding
  return row.embeddingSummary?.length ? row.embeddingSummary
       : row.embedding?.length ? row.embedding
       : null;
}

// MMR: выбираем k документов из pool (уже отсортированного по finalScore)
function mmrSelect(rows, k, lambda = 0.75) {
  const selected = [];
  const selectedIdx = new Set();

  // заранее подготовим векторы
  const vectors = rows.map(pickVector);

  while (selected.length < k && selected.length < rows.length) {
    let bestI = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < rows.length; i++) {
      if (selectedIdx.has(i)) continue;

      const relevance = rows[i].finalScore; // уже хороший скор

      // diversity penalty = max similarity to selected
      let maxSim = 0;
      const vi = vectors[i];
      if (vi && selected.length) {
        for (const s of selected) {
          const vj = vectors[s.__idx];
          if (!vj) continue;
          const sim = vecSim(vi, vj);
          if (sim > maxSim) maxSim = sim;
        }
      }

      const mmrScore = (lambda * relevance) - ((1 - lambda) * maxSim);
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestI = i;
      }
    }

    if (bestI === -1) break;
    const item = { ...rows[bestI], __idx: bestI };
    selected.push(item);
    selectedIdx.add(bestI);
  }

  // уберём служебное поле
  return selected.map(({ __idx, ...rest }) => rest);
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

// query summary embedding (для сравнения с embeddingSummary)
const qSummaryText = await summarizeQueryForEmbedding(query);
const qSumEmb = await embedQuery(qSummaryText || query);
// если вдруг что-то пошло не так — fallback на qEmb
const qSumEmbSafe = qSumEmb?.length ? qSumEmb : qEmb;


  // 2. Build $vectorSearch filter
  let cid = null;
  if (clientId && mongoose.isValidObjectId(clientId)) {
    cid = new mongoose.Types.ObjectId(clientId);
  }

  const filter = {};
  if (cid) filter.clientId = cid;
  // if (siteId) filter.siteId = siteId;

  // 3. Vector search (top 80)
  let vecRows = [];
  try {
      console.log("[RAG][hybrid] filter:", filter);
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
          embedding: 1,      
          embeddingSummary: 1,
          page: 1,
          documentId: 1,
          score: { $meta: "searchScore" }
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

  // 5) Compute rerank score (0.7 / 0.3 + boosts), с нормализацией
  const scoreStats = minmaxNormalize(vecRows.map(r => Number(r.score || 0)));

  const enriched = vecRows.map((r) => {
    const baseScoreNorm = norm01(Number(r.score || 0), scoreStats.min, scoreStats.max);

    // summary similarity: если embeddingSummary есть — используем его, иначе fallback на embedding
    let semSim01 = 0;
const hasSum = r.embeddingSummary?.length;
const v = hasSum ? r.embeddingSummary : (r.embedding?.length ? r.embedding : null);

if (v) {
  // если сравниваем с embeddingSummary — используем qSumEmbSafe, иначе qEmb
  const qVec = hasSum ? qSumEmbSafe : qEmb;
  const cos = cosineSim(qVec, v);
  semSim01 = cosineTo01(cos);
}


    const typeBoost = computeTypeBoost(r.chunkType, intentTypes);   // 0..1
    const tagBoost  = computeTagBoost(r.tags, qTokens);             // 0..1

    // 0.7/0.3 + boosts
    // boosts делаем мягкими, чтобы не ломали ранжирование
const finalScore =
  (baseScoreNorm * 0.68) +
  (semSim01      * 0.28) +
  (typeBoost     * 0.03) +
  (tagBoost      * 0.01);

    return { ...r, baseScoreNorm, semSim01, finalScore };
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
const mmrPool = rows.slice(0, Math.max(SINGLE_DOC_LIMIT, MMR_POOL));
const sliced = mmrSelect(mmrPool, SINGLE_DOC_LIMIT, MMR_LAMBDA);
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

// 🔥 MMR: берём top-pool и выбираем k разнообразных
const pool = perDoc.slice(0, Math.max(k, MMR_POOL));
const finalRows = mmrSelect(pool, k, MMR_LAMBDA);

return { contexts: normalizeChunks(finalRows) };
}

// =============================
// Normalize output
// =============================
function normalizeChunks(rows) {
  return rows.map((r) => ({
    source: "client-doc",
    url: "",
    title: r.title || "Client Document",
    text: r.content,
    snippet: String(r.content || "").slice(0, 500),
    score: r.finalScore
  }));
}
