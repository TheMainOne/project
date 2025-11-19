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

export function buildPrompt({ query, contexts, lang='ru' }) {
  const intro = lang.startsWith('ru')
    ? 'Ты ассистент сайта. Отвечай кратко и строго по данному контексту.'
    : 'You are the site assistant. Answer concisely and stick to the provided context.';
  const rules = lang.startsWith('ru')
    ? 'Правила:\n- Используй только факты из контекста. Не выдумывай.\n- Если инфы нет — честно скажи, чего не хватает.\n- При необходимости ссылайся на кусочки как [#N].'
    : 'Rules:\n- Use only facts from the context. Do not invent.\n- If info is missing, state what is missing.\n- Cite snippets as [#N] if helpful.';
  const ctx = contexts.map((c,i)=>`[#${i+1}] ${c.text}`).join('\n\n');
  return [
    { role:'system', content:`${intro}\n\n${rules}` },
    { role:'user',   content:`Question: ${query}\n\nContext:\n${ctx}\n` }
  ];
}
