// services/rag/retrieveDocs.js
import mongoose from "mongoose";
import ClientDocChunk from "../../models/ClientDocChunk.js";
import OpenAI from "openai";

const oai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function embedQuery(q) {
  const r = await oai.embeddings.create({ model: "text-embedding-3-small", input: q });
  return r.data[0].embedding;
}

export async function retrieveDocsTopK({ clientId, siteId, query, k = 24 }) {
  if (!oai) return { chunks: [], mode: "vector" };
  const qvec = await embedQuery(query);

  // безопасно приведём clientId → ObjectId если валиден
  let clientObjId = null;
  if (clientId && mongoose.isValidObjectId(clientId)) {
    clientObjId = new mongoose.Types.ObjectId(clientId);
  }

  // фильтр в сам $vectorSearch
  const filter = {};
  if (clientObjId) filter.clientId = clientObjId;
  if (siteId) filter.siteId = siteId;

  const pipeline = [
    {
      $vectorSearch: {
        index: "default",             // имя Search Index в Atlas
        path: "embedding",
        queryVector: qvec,
        numCandidates: Math.max(80, k * 3),
        limit: k,
        ...(Object.keys(filter).length ? { filter } : {})
      }
    },
    {
      $project: {
        content: 1, title: 1, page: 1, documentId: 1, siteId: 1, clientId: 1,
        score: { $meta: "searchScore" }
      }
    }
  ];

  const rows = await ClientDocChunk.aggregate(pipeline).exec();

  // MMR (простой, текстовый)
  const MMR_K = Math.min(8, rows.length);
  const selected = [];
  const lambda = 0.7;
  const used = new Set();

  const textKey = x => String(x.content).slice(0, 500).toLowerCase().split(/\W+/);
  while (selected.length < MMR_K) {
    let best = -Infinity, bestIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (used.has(i)) continue;
      const cand = rows[i];
      const relevance = cand.score || 0;
      let diversity = 0;
      if (selected.length) {
        const A = new Set(textKey(cand));
        diversity = Math.max(...selected.map(s => {
          const B = new Set(textKey(s));
          let inter = 0; for (const w of A) if (B.has(w)) inter++;
          return inter / Math.max(1, Math.min(A.size, B.size));
        }));
      }
      const mmr = lambda * relevance - (1 - lambda) * diversity;
      if (mmr > best) { best = mmr; bestIdx = i; }
    }
    if (bestIdx < 0) break;
    used.add(bestIdx);
    selected.push(rows[bestIdx]);
  }

  return {
    mode: "vector",
    chunks: selected.map(r => ({
      id: r._id?.toString(),
      documentId: r.documentId?.toString(),
      title: r.title,
      page: r.page || 0,
      content: r.content,
      score: r.score || 0,
      source: "docs"
    }))
  };
}
