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

// export function buildPrompt({ query, contexts, lang = "ru", complex = null }) {
//   const ctx = (contexts || [])
//     .map((c, i) => `[#${i + 1}] ${c.text}`)
//     .join("\n\n");

//   // Доп.подсказка для модели, если вопрос сложный
//   let complexNote = "";
//   if (complex?.isComplex) {
//     complexNote =
//       "The question is classified as complex: provide a carefully reasoned, coherent answer grounded in the context.\n\n";
//   }

//   return [
//     {
//       role: "user",
//       content: `${complexNote}Question: ${query}`,
//     },
//   ];
// }

export function buildPrompt({
  system,              // string (уже выбранный pickSystemPrompt)
  history = [],        // массив {role, content}
  query,               // llmQuery
  contexts = [],       // [{ text, url, ... }]
  maxHistory = 12,
  complex = null,
}) {
  // 1) system
  const systemMsg = { role: "system", content: system || "" };

  // 2) хвост истории (только user/assistant)
  const tail = (history || [])
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-maxHistory);

  // 2.1) дедуп: если последний элемент tail — user и он равен query → убрать
  const cleanedTail = [...tail];
  const lastTail = cleanedTail[cleanedTail.length - 1];
  if (lastTail?.role === "user") {
    const t = lastTail.content.trim();
    const q = (query || "").trim();
    if (t && q && t === q) cleanedTail.pop();
  }

  // 3+4) финальный user: Question + Context
  const ctxBlock = (contexts || [])
    .map((c, i) => `[#${i + 1}] ${(c?.text || "").trim()}`)
    .filter(Boolean)
    .join("\n\n");

  let complexNote = "";
  if (complex?.isComplex) {
    complexNote =
      "The question is classified as complex: provide a carefully reasoned, coherent answer grounded in the context.\n\n";
  }

  const finalUser = {
    role: "user",
    content: [
      complexNote + `Question: ${(query || "").trim()}`,
      ctxBlock ? `Context:\n${ctxBlock}` : "Context:\n(none)",
    ].join("\n\n"),
  };

  return [systemMsg, ...cleanedTail, finalUser];
}