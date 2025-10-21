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

function resolveIds(req, meta = {}) {
  // siteId: берём из заголовка/меты/тела, иначе — из Origin/Referer хоста, иначе — fallback
  const rawSite =
    req.header("x-aiw-site") ||
    meta.siteId ||
    req.body?.siteId ||
    null;

  let siteId = rawSite;
  try {
    if (!siteId) {
      const origin = req.headers.origin || req.headers.referer || "";
      if (origin) {
        const h = new URL(origin).hostname.replace(/^www\./, "");
        siteId = h || null;
      }
    }
  } catch {}
  if (!siteId) siteId = "unknown-site";

  // sessionId: берём из заголовка/меты/тела; если нет — генерим
  let sessionId =
    req.header("x-aiw-session") ||
    meta.sessionId ||
    req.body?.sessionId ||
    null;

  const serverGenerated = !sessionId;
  if (!sessionId) {
    sessionId = "sess-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  const visitorId = req.header("x-aiw-visitor") || meta.visitorId || null;

  return { siteId, sessionId, visitorId, serverGenerated };
}


async function ensureSession(meta, req) {
  try {
    const { siteId, sessionId, visitorId, pageUrl, referrer, utm, tz, lang } = meta || {};
    const ipHashVal = hashIp(getIp(req), req.headers["user-agent"], siteId || "unknown-site");

    const now = new Date();
    await AiwSession.updateOne(
      { sessionId },
      {
        $setOnInsert: {
          siteId: siteId || "unknown-site",
          sessionId,
          visitorId: visitorId || null,
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
        $set: { endedAt: now },
      },
      { upsert: true }
    );
    return { sessionId };
  } catch (e) {
    console.error("[AIW] ensureSession error", e);
    return null;
  }
}

function setDebugHeaders(req, res, dbg = {}) {
  try {
    const t = Date.now() - (req.__trace?.start || Date.now());
    res.setHeader("X-AIW-Build", BUILD_TAG);
    res.setHeader("X-AIW-Trace", req.__trace?.id || "");
    res.setHeader("X-AIW-Proc", `pid:${req.__trace?.pid}|port:${req.__trace?.port}`);
    res.setHeader("X-AIW-Route", `${req.baseUrl || ""}${req.route?.path || req.originalUrl || ""}`);
    if (dbg.siteId)    res.setHeader("X-AIW-Resolved-Site", dbg.siteId);
    if (dbg.sessionId) res.setHeader("X-AIW-Resolved-Session", dbg.sessionId);
    if (dbg.handler)   res.setHeader("X-AIW-Handler", dbg.handler);
    if (dbg.phase)     res.setHeader("X-AIW-Phase", dbg.phase);           // cache | rag | rag-extractive | no-context | empty
    if (dbg.db)        res.setHeader("X-AIW-DB", dbg.db);                 // user:+ assistant:+ / -
    if (dbg.timing)    res.setHeader("X-AIW-Timing", JSON.stringify(dbg.timing)); // {retrieve:12, oai:45, total:60}
    if (req.query.debug === "1" || req.headers["x-aiw-debug"] === "1") {
      // Разрешим отдавать расширенные заголовки в браузер
      res.setHeader("Access-Control-Expose-Headers",
        "X-AIW-Build, X-AIW-Source, X-AIW-Citations-Count, X-AIW-Trace, X-AIW-Proc, X-AIW-Route, X-AIW-Resolved-Site, X-AIW-Resolved-Session, X-AIW-Handler, X-AIW-Phase, X-AIW-Timing, X-AIW-DB"
      );
    }
  } catch {}
}


async function logUserMessage({ siteId, sessionId, content }) {
  try {
    if (!content) return; // логично не писать пустоту
    const topics = classifyTopics(content);
    const doc = await AiwMessage.create({
      siteId: siteId || "unknown-site",
      sessionId,
      role: "user",
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
  try {
    if (content == null) return;
    const topics = classifyTopics(content);
    const doc = await AiwMessage.create({
      siteId: siteId || "unknown-site",
      sessionId,
      role: "assistant",
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
  const started = Date.now();
  let timing = {};
  let dbMark = "user:- assistant:-";
  let phase = "unknown";

  try {
    // ====== Базовые заголовки/метки для дебага ======
    res.setHeader("X-AIW-Build", BUILD_TAG);
    res.setHeader("X-AIW-Handler", "aiwChat/chat");

    // Разрешим браузеру видеть все наши debug-заголовки
    const expose = [
      "X-AIW-Build","X-AIW-Source","X-AIW-Citations-Count",
      "X-AIW-Handler","X-AIW-Resolved-Site","X-AIW-Resolved-Session",
      "X-AIW-Phase","X-AIW-DB","X-AIW-Timing"
    ].join(", ");
    const existingExpose = res.getHeader("Access-Control-Expose-Headers");
    res.setHeader(
      "Access-Control-Expose-Headers",
      existingExpose ? (existingExpose + ", " + expose) : expose
    );

    // ====== Чтение входа (как в твоём коде) ======
    const { messages = [], stream = true, meta = {} } = req.body || {};
    const allowedRoles = new Set(["system", "user", "assistant"]);
    const safeMsgs = (Array.isArray(messages) ? messages : [])
      .filter((m) => m && allowedRoles.has(m.role) && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
      .slice(-30);

    const lang = String(meta.lang || "ru");
    const siteId = String(req.header("x-aiw-site") || meta.siteId || "demo");
    const sessionId = String(req.header("x-aiw-session") || meta.sessionId || "");
    const visitorId = String(req.header("x-aiw-visitor") || meta.visitorId || "");

    res.setHeader("X-AIW-Resolved-Site", siteId);
    res.setHeader("X-AIW-Resolved-Session", sessionId || "(empty)");

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

    // ====== ensureSession ======
    const tEnsure = Date.now();
    await ensureSession(metaAll, req);
    timing.ensure = Date.now() - tEnsure;

    // ====== извлекаем пользовательский вопрос ======
    const lastUser = [...safeMsgs].reverse().find((m) => m.role === "user");
    const query = (lastUser?.content || "").trim();

    // логируем юзера (не пишем пустоту)
    if (query) {
      await logUserMessage({ siteId, sessionId, content: query });
      dbMark = "user:+ assistant:-";
    }

    if (!query) {
      phase = "empty";
      res.setHeader("X-AIW-Phase", phase);
      res.setHeader("X-AIW-DB", dbMark);
      res.setHeader("X-AIW-Timing", JSON.stringify({ ...timing, total: Date.now() - started }));

      if (!stream) {
        setJSONHeaders(req, res);
        return sendJSON(req, res, {
          reply: lang.startsWith("ru") ? "Пустой вопрос" : "Empty question",
          source: "empty",
          citations: []
        });
      } else {
        setSSEHeaders(req, res);
        res.write(`data: ${lang.startsWith("ru") ? "Пустой вопрос" : "Empty question"}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      }
    }

    // ====== RAG retrieve ======
    const tRetrieve = Date.now();
    const contexts = await retrieveTopK(siteId, query, { k: 5, softLimit: 300, minScore: 0.18 });
    timing.retrieve = Date.now() - tRetrieve;

    // ====== Fast extractive ======
    const fast = tryFastAnswer(query, contexts, lang);
    if (fast) {
      phase = "rag-extractive";
      setSourceHeaders(res, "rag-extractive", fast.citations || []);
      res.setHeader("X-AIW-Phase", phase);

      const payload = { reply: fast.reply, citations: fast.citations || [] };
      await logAssistantMessage({ siteId, sessionId, content: payload.reply, latencyMs: Date.now() - started });
      dbMark = "user:+ assistant:+";

      res.setHeader("X-AIW-DB", dbMark);
      res.setHeader("X-AIW-Timing", JSON.stringify({ ...timing, total: Date.now() - started }));

      if (!stream) {
        setJSONHeaders(req, res);
        return sendJSON(req, res, { reply: payload.reply, source: "rag-extractive", citations: payload.citations });
      } else {
        setSSEHeaders(req, res);
        res.write(": heartbeat\n\n");
        const CH = 24;
        for (let i = 0; i < payload.reply.length; i += CH) {
          res.write(`data: ${payload.reply.slice(i, i + CH)}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        return res.end();
      }
    }

    // ====== Нет контекста ======
    if (!contexts.length) {
      phase = "no-context";
      res.setHeader("X-AIW-Phase", phase);
      setSourceHeaders(res, "no-context", []);

      const reply = oai
        ? (lang.startsWith("ru")
          ? "Недостаточно данных в базе для точного ответа."
          : "Not enough data in the knowledge base.")
        : (lang.startsWith("ru")
          ? `Демо-ответ (нет OPENAI_API_KEY).`
          : `Demo reply (no OPENAI_API_KEY).`);

      await logAssistantMessage({ siteId, sessionId, content: reply, latencyMs: Date.now() - started });
      dbMark = "user:+ assistant:+";

      res.setHeader("X-AIW-DB", dbMark);
      res.setHeader("X-AIW-Timing", JSON.stringify({ ...timing, total: Date.now() - started }));

      if (!stream) {
        setJSONHeaders(req, res);
        return sendJSON(req, res, { reply, source: "no-context", citations: [] });
      } else {
        setSSEHeaders(req, res);
        res.write(`data: ${reply}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      }
    }

    // ====== Полноценный RAG через LLM ======
    const citations = contexts.map((c, i) => ({ idx: i + 1, url: c.url }));
    const prompt = buildPrompt({ query, contexts, lang });

    if (stream) {
      // ---- STREAM (SSE) ----
      phase = "rag";
      res.setHeader("X-AIW-Phase", phase);
      setSourceHeaders(res, "rag", citations);
      setSSEHeaders(req, res);
      res.write(": heartbeat\n\n");

      let clientClosed = false;
      req.on("close", () => { clientClosed = true; });
      req.on("aborted", () => { clientClosed = true; });

      let buffer = "";
      if (!oai) {
        const demo = lang.startsWith("ru") ? "Демо-ответ (нет OPENAI_API_KEY)." : "Demo reply (no OPENAI_API_KEY).";
        buffer = demo;
        const CH = 24;
        for (let i = 0; i < demo.length && !clientClosed; i += CH) {
          res.write(`data: ${demo.slice(i, i + CH)}\n\n`);
        }
      } else {
        try {
          // здесь можно включить реальный стрим; у тебя сейчас синхронный вариант
          const completion = await oai.chat.completions.create({ model: MODEL, messages: prompt });
          const reply = completion.choices?.[0]?.message?.content?.trim() || "";
          buffer = reply;
          const CH = 24;
          for (let i = 0; i < reply.length && !clientClosed; i += CH) {
            res.write(`data: ${reply.slice(i, i + CH)}\n\n`);
          }
        } catch (e) {
          const msg = `⚠️ ${e?.message || "LLM error"}`;
          buffer = msg;
          if (!clientClosed) res.write(`data: ${msg}\n\n`);
        }
      }

      // лог ассистента и финальные заголовки
      await logAssistantMessage({ siteId, sessionId, content: buffer, latencyMs: Date.now() - started });
      dbMark = "user:+ assistant:+";
      res.setHeader("X-AIW-DB", dbMark);
      res.setHeader("X-AIW-Timing", JSON.stringify({ ...timing, total: Date.now() - started }));

      if (!clientClosed) {
        res.write("data: [DONE]\n\n");
        res.end();
      }
      return;
    } else {
      // ---- JSON ----
      phase = "rag";
      res.setHeader("X-AIW-Phase", phase);
      setSourceHeaders(res, "rag", citations);

      const tLLM = Date.now();
      let reply = lang.startsWith("ru") ? "Демо-ответ (нет OPENAI_API_KEY)." : "Demo reply (no OPENAI_API_KEY).";
      if (oai) {
        const completion = await oai.chat.completions.create({ model: MODEL, messages: prompt });
        reply = completion.choices?.[0]?.message?.content?.trim() || reply;
      }
      timing.llm = Date.now() - tLLM;

      await logAssistantMessage({ siteId, sessionId, content: reply, latencyMs: Date.now() - started });
      dbMark = "user:+ assistant:+";

      res.setHeader("X-AIW-DB", dbMark);
      res.setHeader("X-AIW-Timing", JSON.stringify({ ...timing, total: Date.now() - started }));

      setJSONHeaders(req, res);
      return sendJSON(req, res, { reply, source: "rag", citations });
    }
  } catch (e) {
    phase = "error";
    res.setHeader("X-AIW-Phase", phase);
    res.setHeader("X-AIW-DB", dbMark);
    res.setHeader("X-AIW-Timing", JSON.stringify({ ...timing, total: Date.now() - started }));
    console.error("AIW /chat error:", e);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: String(e) });
    }
    try {
      res.write(`data: ⚠️ Internal error\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } catch {}
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
