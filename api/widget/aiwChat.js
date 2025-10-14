import express from 'express';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';
import { retrieveTopK, buildPrompt } from '../../services/web_crawler/core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const chatRouter = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const cache = new Map(); // простой кеш на процесс

chatRouter.post('/aiw/chat', async (req,res)=>{
  try {
    const siteId = String(req.header('x-aiw-site') || 'demo');
    const { messages = [], meta = {} } = req.body || {};
    const lang = String(meta.lang || 'ru');

    const last = [...messages].reverse().find(m=>m.role==='user');
    const query = (last?.content || '').trim();
    if (!query) return res.json({ reply: lang.startsWith('ru')?'Пустой вопрос':'Empty question' });

    const key = `${siteId}::${query}`;
    const hit = cache.get(key);
    if (hit && Date.now()-hit.ts < 60*60*1000) {
      return res.json({ reply: hit.answer, source:'cache', citations: hit.citations });
    }

    const contexts = await retrieveTopK(siteId, query, { k:5, softLimit:300, minScore:0.18 });

    if (!contexts.length) {
      // fallback без контекста
      const chat = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role:'system', content: lang.startsWith('ru') ? 'Ты ассистент. Отвечай кратко и корректно.' : 'You are a helpful assistant. Be concise and correct.' },
          ...messages.slice(-10)
        ],
        temperature: 0.3
      });
      const reply = chat.choices?.[0]?.message?.content || (lang.startsWith('ru') ? 'Нет данных.' : 'No data.');
      cache.set(key, { answer: reply, ts: Date.now(), citations: [] });
      return res.json({ reply, source:'no-context', citations: [] });
    }

    const prompt = buildPrompt({ query, contexts, lang });
    const chat = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: prompt,
      temperature: 0.2
    });

    const reply = chat.choices?.[0]?.message?.content || (lang.startsWith('ru') ? '…' : '…');
    const citations = contexts.map((c,i)=>({ idx:i+1, url:c.url }));

    cache.set(key, { answer: reply, ts: Date.now(), citations });
    res.json({ reply, source:'rag', citations });
  } catch (e) {
    console.error('[/aiw/chat]', e);
    res.status(500).json({ reply:'⚠️ Error', source:'error' });
  }
});

export default chatRouter;
