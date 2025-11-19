import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DB = 'materials_reader';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const mongo = new MongoClient(process.env.DATABASE_URL);

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export async function embedQuery(q) {
  const r = await openai.embeddings.create({ model: 'text-embedding-3-small', input: q });
  return r.data[0].embedding;
}

export async function retrieveTopK(siteId, query, { k=5, softLimit=300, minScore=0.18 } = {}) {
  await mongo.connect();
  const col = mongo.db(DB).collection('chunks');

  const candidates = await col.find({ siteId, embedding: { $exists: true } })
    .project({ _id: 0, url: 1, text: 1, embedding: 1 })
    .limit(softLimit)
    .toArray();

  if (!candidates.length) return [];

  const qEmb = await embedQuery(query);
  const scored = candidates.map(c => ({
    url: c.url, text: c.text, score: cosine(qEmb, c.embedding)
  })).sort((a,b) => b.score - a.score);

  return scored.filter(x => x.score >= minScore).slice(0, k);
}

// services/web_crawler/core.js

const MAX_CTX_CHUNKS = Number(process.env.AIW_CTX_MAX_CHUNKS || 4);
const MAX_CTX_CHARS  = Number(process.env.AIW_CTX_MAX_CHARS  || 400);

export function buildPrompt({ query, contexts, lang = "ru" }) {
  const safeContexts = (contexts || [])
    .slice(0, MAX_CTX_CHUNKS)
    .map((c, i) => {
      const text = (c.text || "").replace(/\s+/g, " ").trim();
      const trimmed = text.slice(0, MAX_CTX_CHARS);
      return `[#${i + 1}] ${trimmed}`;
    });

  const ctxBlock = safeContexts.length
    ? safeContexts.join("\n\n")
    : (lang.startsWith("ru")
        ? "Контекст пуст."
        : "Context is empty.");

  return [
    {
      role: "user",
      content:
        (lang.startsWith("ru")
          ? `Вопрос: ${query}\n\nКонтекст:\n${ctxBlock}\n`
          : `Question: ${query}\n\nContext:\n${ctxBlock}\n`)
    }
  ];
}

