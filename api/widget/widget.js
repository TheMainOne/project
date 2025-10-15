// основной код для виджета. Вся логика обработки запросов лежит здесь
import 'dotenv/config';     
import express from "express";
import OpenAI from "openai";

import { retrieveTopK } from "../../services/web_crawler/core.js";
// import { tryFastAnswer } from '../../services/web_crawler/fastAnswer.js';

const router = express.Router();

// ============ Конфигурация ============
const oai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;


const MODEL = process.env.OPENAI_MODEL || "gpt-5-nano"; // можно сменить в .env
const CURRENCY = process.env.AIW_CURRENCY || "USD";

// === Simple in-process cache (NEW) ===
const ANSWER_TTL_MS = 60 * 60 * 1000;
const cache = new Map(); // key -> { ts, reply, citations }
function getFromCache(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > ANSWER_TTL_MS) { cache.delete(key); return null; }
  return v;
}
function putToCache(key, payload) { cache.set(key, { ...payload, ts: Date.now() }); }

// === Headers helpers (NEW) ===
function setSSEHeaders(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}
function setJSONHeaders(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}

// ставим служебные заголовки, чтобы фронт мог понять тип ответа и источники в SSE
function setSourceHeaders(res, source, citations = []) {
  try {
    res.setHeader("X-AIW-Source", source);
    res.setHeader("X-AIW-Citations-Count", String(citations.length || 0));
  } catch {}
}


// Опционально: прайсинг/бандлы из .env (JSON)
// пример: AIW_PLANS='[{"name":"Growth","users":10,"price":299}]'
function loadPlans() {
  try {
    return JSON.parse(process.env.AIW_PLANS || "[]");
  } catch {
    return [];
  }
}

function sendJSON(req, res, { reply, source, citations = [] }) {
  setJSONHeaders(req, res);
  setSourceHeaders(res, source, citations);
  return res.status(200).json({ reply, source, citations });
}

function buildSystemPrompt() {
  const plans = loadPlans();
  const plansText = plans.length
    ? plans
        .map(
          (p) =>
            `• ${p.name} — ${p.users || "n/a"} users — ${p.price} ${CURRENCY}/month`
        )
        .join("\n")
    : "• Growth Plan — 10 users — 299 USD/month\n• Annual discount — 20%";

  return [
    "You are a friendly, concise sales assistant for our website widget.",
    "Answer about pricing, product bundles, demos, and FAQs.",
    "Use the pricing context below if relevant. If information is missing, say so briefly.",
    "",
    "Pricing Context:",
    plansText,
    "",
    `Always use ${CURRENCY}. Keep answers short and skimmable.`,
  ].join("\n");
}

// Нормализуем входные сообщения (безопасность, длина)
function sanitizeMessages(messages = []) {
  const allowedRoles = new Set(["system", "user", "assistant"]);
  const trimmed = ("" + (messages?.length ? "" : "")).length; // noop, просто защитный трюк от undefined
  const arr = Array.isArray(messages) ? messages : [];
  const safe = arr
    .filter((m) => m && allowedRoles.has(m.role) && typeof m.content === "string")
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 4000), // ограничим длину
    }));
  // ограничим историю до последних 30
  return safe.slice(-30);
}

// Фолбэк-ответ, если нет ключа
function fallbackReply(messages = []) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const q = lastUser?.content || "—";
  return [
    `You asked: "${q}"`,
    "",
    "Demo reply (no OPENAI_API_KEY configured).",
    "For 10 users: Growth Plan — $299/month. Annual discount — 20%.",
  ].join("\n");
}
const BUILD_TAG = "aiw-widget@rag-1.0.3";

router.use((req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === "object") {
      if (!("source" in body)) body.source = "unknown";
      if (!("citations" in body)) body.citations = [];
    }
    return origJson(body);
  };
  next();
});
// ============ Маршрут /chat ============
router.post("/chat", async (req, res) => {
  try {
    res.setHeader("X-AIW-Build", BUILD_TAG);
    const { messages = [], stream = true, meta = {} } = req.body || {};
    const allowedRoles = new Set(["system", "user", "assistant"]);
    const safeMsgs = (Array.isArray(messages) ? messages : [])
      .filter((m) => m && allowedRoles.has(m.role) && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
      .slice(-30);

    // NEW: язык и siteId
    const lang = String(meta.lang || "ru");
    const siteId = String(req.header("x-aiw-site") || "demo");

    const lastUser = [...safeMsgs].reverse().find((m) => m.role === "user");
    const query = (lastUser?.content || "").trim();

    if (!query) {
      if (!stream) {
        setJSONHeaders(req, res);
        return sendJSON(req, res, { reply: lang.startsWith("ru") ? "Пустой вопрос" : "Empty question", source: "empty", citations: [] });
      }
      setSSEHeaders(req, res);
      res.write(`data: ${lang.startsWith("ru") ? "Пустой вопрос" : "Empty question"}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    // === 0) CACHE (NEW)
    const cacheKey = `${siteId}::${lang}::${query}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      setSourceHeaders(res, "cache", cached.citations || []);
      if (!stream) {
        setJSONHeaders(req, res);
        return sendJSON(req, res, { reply: cached.reply, source: "cache", citations: cached.citations || [] });
      }
      setSSEHeaders(req, res);
      res.write(": heartbeat\n\n");
      const CH = 24;
      for (let i = 0; i < cached.reply.length; i += CH) {
        res.write(`data: ${cached.reply.slice(i, i + CH)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      return res.end();
    }
const contextsRaw = await retrieveTopK(siteId, query, { k: 5, softLimit: 300, minScore: 0.18 });

// 2) Фильтруем + ужимаем контекст, чтобы не жечь токены
function condenseText(t, limit = 500) {
  t = (t || '').replace(/\s+/g, ' ').trim();
  if (t.length <= limit) return t;
  const head = t.slice(0, Math.floor(limit * 0.7));
  const tail = t.slice(-Math.floor(limit * 0.3));
  return `${head} … ${tail}`;
}

const topScore = contextsRaw[0]?.score ?? 0;
const gate = Math.max(0.18, Math.min(0.28, topScore - 0.06));
const contexts = contextsRaw
  .filter(c => (c.score ?? 0) >= gate)
  .slice(0, 3)
  .map(c => ({ ...c, text: condenseText(c.text, 500) }));

// 3) Строгий промпт: отвечаем только по контексту (но всегда через LLM)
function buildStrictPrompt({ query, contexts, lang="ru" }) {
  const RULES_RU = `Ты ассистент сайта. Формируй красивый, краткий ответ ТОЛЬКО по приведённым фрагментам (Контекст).
Если факта нет в Контексте — ответь кратко: «Недостаточно данных».
Формат: 2–4 буллета или 2–4 предложения. Без домыслов. Цены — с валютой ровно как в Контексте.`;

  const RULES_EN = `You are a site assistant. Write a clean, concise answer ONLY from the provided snippets (Context).
If information is missing, say “Not enough data”.
Use 2–4 bullets or sentences. No speculation. Keep currency exactly as in Context.`;

  const rules = lang.startsWith('ru') ? RULES_RU : RULES_EN;
  const ctx = contexts.map((c,i)=>`[${i+1}] (${c.url}) ${c.text}`).join('\n\n');

  return [
    { role: "system", content: rules },
    { role: "user", content: lang.startsWith('ru')
        ? `Вопрос: ${query}\n\nКонтекст:\n${ctx || '—'}\n\nОтвет:`
        : `Question: ${query}\n\nContext:\n${ctx || '—'}\n\nAnswer:` }
  ];
}

// 4) Подбор модели: дешёвая для коротких, средняя — для длинных
function pickModel(query, contexts) {
  const len = (query||'').length + contexts.reduce((n,c)=>n + (c.text||'').length, 0);
  if (len < 1200) return process.env.OPENAI_CHEAP_MODEL || 'gpt-5-nano';
  return process.env.OPENAI_MID_MODEL || 'gpt-4o-mini';
}

const citations = contexts.map((c,i)=>({ idx: i+1, url: c.url }));
const prompt = buildStrictPrompt({ query, contexts, lang });
const modelToUse = pickModel(query, contexts);

// 5) Если нет ключа — всё равно «красиво» отвечаем мок-LLM
if (!oai) {
  const reply = lang.startsWith('ru')
    ? (contexts.length ? 'Демо-ответ (нет OPENAI_API_KEY).' : 'Недостаточно данных.')
    : (contexts.length ? 'Demo reply (no OPENAI_API_KEY).' : 'Not enough data.');
  const payload = { reply, citations };
  putToCache(cacheKey, payload);
  if (!stream) return sendJSON(req, res, { ...payload, source: contexts.length ? 'rag-llm' : 'llm-no-context' });
  setSSEHeaders(req, res); res.write(": heartbeat\n\n");
  const CH=24; for (let i=0;i<reply.length;i+=CH) res.write(`data: ${reply.slice(i,i+CH)}\n\n`);
  res.write("data: [DONE]\n\n"); return res.end();
}

// 6) LLM всегда формирует финальный ответ (stream=false у фронта)
const completion = await oai.chat.completions.create({
  model: modelToUse,
  messages: prompt,
  temperature: 0.15,
  top_p: 0.9,
  max_tokens: 320
});

const reply = completion.choices?.[0]?.message?.content?.trim() || (lang.startsWith('ru') ? '…' : '…');
const payload = { reply, citations };
putToCache(cacheKey, payload);

// JSON-ответ с источником
setSourceHeaders(res, contexts.length ? "rag-llm" : "llm-no-context", citations);
return sendJSON(req, res, { ...payload, source: contexts.length ? "rag-llm" : "llm-no-context" });

    // ——— режимы: STREAM vs JSON ———
    if (stream) {
      // STREAM (SSE)
        // важно: сначала источник/ссылки, потом — SSE заголовки/флаш
  setSourceHeaders(res, "rag", citations);
  setSSEHeaders(req, res);
      res.write(": heartbeat\n\n");

      let clientClosed = false;
      const endSafely = () => { if (!clientClosed) { clientClosed = true; try { res.end(); } catch {} } };
      req.on("close", endSafely); req.on("aborted", endSafely);

      let gotAnyToken = false;
      const controller = new AbortController();
      const timer = setTimeout(() => { if (!gotAnyToken) controller.abort(); }, 5000);

      try {
        const response = await oai.chat.completions.create({
          model: MODEL,
          messages: prompt, // ВАЖНО: используем RAG-промпт
          stream: true,
          signal: controller.signal,
        });
        for await (const chunk of response) {
          if (clientClosed) break;
          const c = chunk?.choices?.[0];
          const delta = c?.delta?.content ?? c?.message?.content ?? "";
          if (delta) { gotAnyToken = true; res.write(`data: ${delta}\n\n`); }
          if (c?.finish_reason) break;
        }
      } catch (_) {
        // если abort по таймауту — ниже fallback
      } finally {
        clearTimeout(timer);
      }

      if (!clientClosed && !gotAnyToken) {
        try {
          const full = await oai.chat.completions.create({ model: MODEL, messages: prompt });
          const reply = full.choices?.[0]?.message?.content?.trim() || "…";
          const CH = 24;
          for (let i = 0; i < reply.length && !clientClosed; i += CH) {
            res.write(`data: ${reply.slice(i, i + CH)}\n\n`);
          }
        } catch (e) {
          if (!clientClosed) res.write(`data: ⚠️ ${e?.message || "LLM error"}\n\n`);
        }
      }

      if (!clientClosed) { res.write("data: [DONE]\n\n"); res.end(); }
      // кешируем факт ответа
      putToCache(cacheKey, { reply: "(streamed)", citations });
      return;
    } else {
      // JSON
      const completion = await oai.chat.completions.create({ model: MODEL, messages: prompt });
      const reply = completion.choices?.[0]?.message?.content?.trim() || "";
      const payload = { reply, citations };
      putToCache(cacheKey, payload);
      setJSONHeaders(req, res);
      setSourceHeaders(res, "rag", citations);
      return sendJSON(req, res, { reply: payload.reply, source: "rag", citations });
    }
  } catch (e) {
    console.error("AIW /chat error:", e);
    if (!res.headersSent) return res.status(500).json({ error: "Internal error" });
    try { res.write(`data: ⚠️ Internal error\n\n`); res.write("data: [DONE]\n\n"); res.end(); } catch {}
  }
});
router.options("/chat", (req, res) => res.sendStatus(204));
router.get("/ping", (req, res) => res.json({ ok: true, t: Date.now() }));

// for testing purpose
router.get("/sse-test", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write(": hello\n\n"); // комментарий — чтобы клиент сразу «увидел» поток

  let i = 0;
  const timer = setInterval(() => {
    i += 1;
    res.write(`data: tick ${i}\n\n`);
    if (i >= 5) {
      clearInterval(timer);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }, 500);
});


export default router;
