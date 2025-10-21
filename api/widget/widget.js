// основной код для виджета. Вся логика обработки запросов лежит здесь
import 'dotenv/config';     
import express from "express";
import OpenAI from "openai";
import AiwSession from "../../models/AiwSession.js";
import AiwMessage from "../../models/AiwMessage.js";
import { hashIp, classifyTopics } from "../../utils/telemetry.js";
import { retrieveTopK, buildPrompt } from "../../services/web_crawler/core.js";
import { tryFastAnswer } from '../../services/web_crawler/fastAnswer.js';

const router = express.Router();

// ============ Конфигурация ============
const oai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;


const MODEL = process.env.OPENAI_MODEL || "gpt-5-nano"; // можно сменить в .env
const CURRENCY = process.env.AIW_CURRENCY || "USD";

// === Logging helpers (Mongo) ===
function getIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
         req.socket?.remoteAddress || req.ip;
}

async function ensureSession(meta, req) {
  const { siteId, sessionId, visitorId, pageUrl, referrer, utm, tz, lang } = meta || {};
  if (!siteId || !sessionId) {
    console.warn("[AIW] ensureSession skipped: missing ids", { siteId, sessionId });
    return null;
  }

  const ipHashVal = hashIp(getIp(req), req.headers["user-agent"], siteId);

  // upsert вместо find+create — надёжнее при параллельных запросах
  const now = new Date();
  await AiwSession.updateOne(
    { sessionId },
    {
      $setOnInsert: {
        siteId, sessionId, visitorId,
        pageUrl: pageUrl || null,
        referrer: referrer || null,
        utm: utm || {},
        tz: tz || null,
        lang: lang || "ru",
        userAgent: req.headers["user-agent"] || null,
        ipHash: ipHashVal,
        startedAt: now,
        topics: [],
        messagesCount: 0,
        userMessages: 0,
        assistantMessages: 0,
      },
      $set: { endedAt: now }, // обновляем "последнюю активность"
    },
    { upsert: true }
  ).catch(e => console.error("[AIW] ensureSession updateOne error", e));

  return { sessionId };
}


async function logUserMessage({ siteId, sessionId, content }) {
  if (!siteId || !sessionId || !content) {
    console.warn("[AIW] skip logUserMessage", { siteId, sessionId, contentLen: (content||"").length });
    return;
  }
  try {
    const topics = classifyTopics(content);
    const doc = await AiwMessage.create({
      siteId, sessionId, role: "user",
      content: String(content).slice(0, 8000),
      topic: topics[0],
    });
    await AiwSession.updateOne(
      { sessionId },
      {
        $inc: { messagesCount: 1, userMessages: 1 },
        $set: { lastUserQuestion: content, endedAt: new Date() },
        $addToSet: { topics: { $each: topics } },
      }
    );
    console.log("[AIW] logged user msg", doc._id.toString());
  } catch (e) {
    console.error("[AIW] logUserMessage error", e);
  }
}

async function logAssistantMessage({ siteId, sessionId, content, latencyMs }) {
  if (!siteId || !sessionId || content == null) {
    console.warn("[AIW] skip logAssistantMessage", { siteId, sessionId, contentLen: content==null? null : String(content).length });
    return;
  }
  try {
    const topics = classifyTopics(content);
    const doc = await AiwMessage.create({
      siteId, sessionId, role: "assistant",
      content: String(content).slice(0, 200_000),
      topic: topics[0],
      latencyMs,
    });
    await AiwSession.updateOne(
      { sessionId },
      {
        $inc: { messagesCount: 1, assistantMessages: 1 },
        $set: { endedAt: new Date() },
        $addToSet: { topics: { $each: topics } },
      }
    );
    console.log("[AIW] logged assistant msg", doc._id.toString());
  } catch (e) {
    console.error("[AIW] logAssistantMessage error", e);
  }
}



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

// Считываем мету, которую шлёт виджет (Patch C у тебя уже стоит)
const lang = String(meta.lang || "ru");
const siteId = String(req.header("x-aiw-site") || meta.siteId || "demo");
const sessionId = String(req.header("x-aiw-session") || meta.sessionId || "");
const visitorId = String(req.header("x-aiw-visitor") || meta.visitorId || "");
console.log("[AIW] meta", { siteId, sessionId, visitorId: !!visitorId, lang, pageUrl: meta.pageUrl, referrer: meta.referrer || req.headers.referer });

const metaAll = {
  siteId,
  sessionId,
  visitorId,
  pageUrl: meta.pageUrl || meta.referrer || req.headers.referer || null,
  referrer: meta.referrer || null,
  utm: meta.utm || {},
  tz: meta.tz || null,
  lang,
};

// гарантируем наличие записи сессии
const ses = await ensureSession(metaAll, req);


    const lastUser = [...safeMsgs].reverse().find((m) => m.role === "user");
    const query = (lastUser?.content || "").trim();
    await logUserMessage({ siteId, sessionId, content: query });
const t0 = Date.now(); // замерим задержку до ответа ассистента

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
    await logAssistantMessage({ siteId, sessionId, content: cached.reply, latencyMs: Date.now() - t0 });
    return sendJSON(req, res, { reply: cached.reply, source: "cache", citations: cached.citations || [] });
  }
  setSSEHeaders(req, res);
  res.write(": heartbeat\n\n");
  const CH = 24;
  for (let i = 0; i < cached.reply.length; i += CH) {
    res.write(`data: ${cached.reply.slice(i, i + CH)}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  await logAssistantMessage({ siteId, sessionId, content: cached.reply, latencyMs: Date.now() - t0 });
  return res.end();
}


    // === 1) RAG retrieve (NEW)
    const contexts = await retrieveTopK(siteId, query, { k: 5, softLimit: 300, minScore: 0.18 });

    // === 2) Fast path без LLM (NEW)
    const fast = tryFastAnswer(query, contexts, lang);
    if (fast) {
      const payload = { reply: fast.reply, citations: fast.citations || [] };
      await logAssistantMessage({ siteId, sessionId, content: payload.reply, latencyMs: Date.now() - t0 });
      putToCache(cacheKey, payload);
      setSourceHeaders(res, "rag-extractive", payload.citations);
      if (!stream) {
        setJSONHeaders(req, res);
        return sendJSON(req, res, { reply: payload.reply, source: "rag-extractive", citations: payload.citations });
      }
      setSSEHeaders(req, res);
      res.write(": heartbeat\n\n");
      const CH = 24;
      for (let i = 0; i < payload.reply.length; i += CH) {
        res.write(`data: ${payload.reply.slice(i, i + CH)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    // === 3) Нет контекста — честный ответ (NEW)
if (!contexts.length) {
  const reply = oai
    ? (lang.startsWith("ru") ? "Недостаточно данных в базе для точного ответа." : "Not enough data in the knowledge base.")
    : (lang.startsWith("ru") ? `Вы спросили: "${query}"\n\nДемо-ответ (нет OPENAI_API_KEY).` : `You asked: "${query}"\n\nDemo reply (no OPENAI_API_KEY).`);
  const payload = { reply, citations: [] };
  putToCache(cacheKey, payload);
  setSourceHeaders(res, "no-context", []);
  if (!stream) {
    setJSONHeaders(req, res);
    await logAssistantMessage({ siteId, sessionId, content: payload.reply, latencyMs: Date.now() - t0 });
    return sendJSON(req, res, { reply: payload.reply, source: "no-context", citations: [] });
  }
  setSSEHeaders(req, res);
  res.write(`data: ${reply}\n\n`);
  res.write("data: [DONE]\n\n");
  await logAssistantMessage({ siteId, sessionId, content: payload.reply, latencyMs: Date.now() - t0 });
  return res.end();
}


    // === 4) LLM с RAG-контекстом (NEW)
    const prompt = buildPrompt({ query, contexts, lang });
    const citations = contexts.map((c, i) => ({ idx: i + 1, url: c.url }));

if (!oai) {
  const reply = (lang.startsWith("ru")
    ? `Демо-ответ (нет OPENAI_API_KEY).`
    : `Demo reply (no OPENAI_API_KEY).`);

  const payload = { reply, citations };
  await logAssistantMessage({ siteId, sessionId, content: reply, latencyMs: Date.now() - t0 });

  putToCache(cacheKey, payload);
  setSourceHeaders(res, "rag", citations);

  if (!stream) {
    setJSONHeaders(req, res);
    return sendJSON(req, res, { reply: payload.reply, source: "rag", citations });
  }

  setSSEHeaders(req, res);
  res.write(": heartbeat\n\n");
  const CH = 24;
  for (let i = 0; i < reply.length; i += CH) {
    res.write(`data: ${reply.slice(i, i + CH)}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  return res.end();
}


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
          stream: false,
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
      await logAssistantMessage({ siteId, sessionId, content: reply, latencyMs: Date.now() - t0 });
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
router.get("/chat-debug-write", async (req, res) => {
  try {
    const sessionId = "debug-" + Date.now();
    const a = await AiwSession.create({ siteId: "debug-site", sessionId, startedAt: new Date() });
    const b = await AiwMessage.create({ siteId: "debug-site", sessionId, role: "assistant", content: "hello debug" });
    res.json({ ok: true, sessionId, a: a._id.toString(), b: b._id.toString() });
  } catch (e) {
    console.error("debug-write error", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

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
