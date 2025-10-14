import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';
import { MongoClient } from 'mongodb';


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DB_NAME = 'materials_reader'; 

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const mongo = new MongoClient(process.env.DATABASE_URL);

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
}

async function embed(text) {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  return r.data[0].embedding;
}

async function main(siteId = 'demo') {
  console.log('[ENV] MONGODB_URI:', !!process.env.MONGODB_URI ? 'set' : 'MISSING');
  console.log('[ENV] DB_NAME:', DB_NAME);
  console.log('[ENV] OPENAI_API_KEY:', !!process.env.OPENAI_API_KEY ? 'set' : 'MISSING');
  console.log('[INFO] siteId =', siteId);

  await mongo.connect();
  const db = mongo.db(DB_NAME);
  const col = db.collection('chunks');               // коллекция: materials_reader.chunks

  // Индексы (на будущее)
  await col.createIndex({ siteId: 1, updatedAt: -1 });
  await col.createIndex({ siteId: 1, pageId: 1, chunkIndex: 1 });

  // Диагностика
  const total = await col.countDocuments({ siteId });
  const noField = await col.countDocuments({ siteId, embedding: { $exists: false } });
  const isNull  = await col.countDocuments({ siteId, embedding: null });
  console.log(`[INFO] total=${total}, noEmbeddingField=${noField}, embeddingNull=${isNull}`);

  // Берём все без эмбеддингов (нет поля ИЛИ null)
  const cursor = col.find({
    siteId,
    $or: [{ embedding: { $exists: false } }, { embedding: null }]
  }).project({ _id: 1, text: 1 });

  let n = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const t = clean(doc.text);
    if (!t) continue;

    const e = await embed(t);
    await col.updateOne({ _id: doc._id }, { $set: { embedding: e, updatedAt: new Date() } });
    n++;
  }

  console.log(`Embedded ${n} chunk(s) for siteId=${siteId}`);
  await mongo.close();
}

main(process.argv[2]).catch(e => {
  console.error(e);
  process.exit(1);
});
