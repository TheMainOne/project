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

export function buildPrompt({ query, contexts, lang }) {
  // Базовый системный промпт ТОЛЬКО про RAG-правила, без указания языка ответа
  const baseSystem = [
    'You are a retrieval-augmented assistant for this website.',
    'You must answer using ONLY the information from the provided context snippets.',
    'Do NOT invent facts that are not supported by the context.',
    'If the context does not contain the necessary information, explicitly say that you do not know based on the provided context and briefly mention what is missing.',
    'If helpful, you can reference context snippets as [#N], where N is the snippet number.'
  ].join('\n');

  const ctx =
    (contexts || [])
      .map((c, i) => `[#${i + 1}] ${c.text}`)
      .join('\n\n') || '(no relevant context found)';

  return [
    {
      role: 'system',
      content: baseSystem,
    },
    {
      role: 'user',
      content:
`User question:
"""${query}"""

Context snippets:
${ctx}

Using ONLY the context snippets above, answer the user's question.
If the answer is not contained in the context, say that you don't know based on the provided context.`,
    },
  ];
}
