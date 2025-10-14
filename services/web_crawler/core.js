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

function condenseText(t, limit = 400) {
  t = (t || '').replace(/\s+/g, ' ').trim();
  if (t.length <= limit) return t;
  // грубо: берём начало и конец — часто там хедеры/цены/выводы
  const head = t.slice(0, Math.floor(limit * 0.7));
  const tail = t.slice(-Math.floor(limit * 0.3));
  return `${head} … ${tail}`;
}

const compact = filtered.map(c => ({
  ...c,
  text: condenseText(c.text, 500) // режем каждый чанк
}));

// services/web_crawler/core.js
export function buildPrompt({ query, contexts, lang="ru" }) {
  const intro = lang.startsWith("ru")
    ? `Ты ассистент сайта. Отвечай ТОЛЬКО по приведённым фрагментам (Контекст). 
Если информации нет — честно скажи «Недостаточно данных». 
Требования:
- Кратко (2–4 пункта или 2–4 предложения).
- Без воды, без мысли вслух.
- Не добавляй фактов вне Контекста.
- Если спрашивают цену/тарифы — перечисли их чётко, с валютой (если есть в Контексте).
- Если ответ частичный — явно укажи, чего нет в Контексте.
В конце, если уместно, предложи 1 короткое следующее действие (например: “Нужна демо?”).`
    : `You are a site assistant. Answer ONLY from the provided snippets (Context).
If missing, say “Not enough data”. Requirements:
- Concise (2–4 bullets or 2–4 sentences).
- No fluff. 
- No facts outside Context.
- For pricing, list clearly with currency if present.
- If partial, say what's missing.
Optionally end with one short CTA.`;

  const ctx = contexts.map((c,i)=>`[${i+1}] ${c.text}`).join('\n\n');

  const messages = [
    { role: "system", content: intro },
    { role: "user", content: (lang.startsWith("ru")
        ? `Вопрос: ${query}\n\nКонтекст:\n${ctx}\n\nОтвет:`
        : `Question: ${query}\n\nContext:\n${ctx}\n\nAnswer:`)
    }
  ];
  return messages;
}

