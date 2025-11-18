// основной код для виджета. Вся логика обработки запросов лежит здесь


// !!!! если изменения вносятся в этот файл, нужно через PuTTY выполнить команду pm2 restart aiw чтобы подхватить изменения!!!!!


import 'dotenv/config';     
import mongoose from "mongoose";
import express from "express";
import OpenAI from "openai";
import AiwSession from "../../models/AiwSession.js";
import AiwMessage from "../../models/AiwMessage.js";
import AiwGap from "../../models/AiwGap.js"; 
import Client from "../../models/Client.js";
import { hashIp, classifyTopics } from "../../utils/telemetry.js";
import { buildPrompt } from "../../services/web_crawler/core.js";
import { retrieveUnified } from "../../services/rag/index.js";
import { getWidgetConfigCached } from '../../services/widgetConfig/cache.js';


const router = express.Router();

// === Judge helpers (NEW) ===
function topCitations(contexts = []) {
  return (contexts || []).map(c => c.url).filter(Boolean).slice(0, 5);
}

// fire-and-forget без падений
function defer(promiseFactory) {
  try {
    Promise.resolve().then(promiseFactory).catch(e => {
      console.error("[AIW] deferred error:", e?.message || e);
    });
  } catch (e) {
    console.error("[AIW] defer sync error:", e?.message || e);
  }
}

function quickFlag({ phase, contexts, reply }) {
  const pre = quickHeuristicGood({ phase, contexts, reply }) 
           || { goodAnswer: true, confidence: 0.6, reason: "default" };
  return pre; // используем для заголовка/поля в ответе
}

// === Timing helpers (ADD) ===
function makeTimer(req) {
  const t0 = Date.now();
  const marks = Object.create(null);
  function mark(label) { marks[label] = Date.now() - t0; }
  async function wrap(label, fn) {
    const s = Date.now(); const r = await fn(); marks[label] = Date.now() - s; return r;
  }
  function get() { return { ...marks, total: Date.now() - t0 }; }
  req.__timer = { mark, wrap, get, t0 };
  return req.__timer;
}

// инициализируем trace (у тебя setDebugHeaders его читает)
router.use((req, _res, next) => {
  req.__trace = { start: Date.now(), id: Math.random().toString(36).slice(2), pid: process.pid, port: process.env.PORT || "" };
  next();
});


// Быстрая эвристика на случай отсутствия ключа или ошибок LLM
function quickHeuristicGood({ phase, contexts, reply }) {
  if (!contexts?.length) return { goodAnswer: false, confidence: 0.9, reason: "no-context" };
  const r = (reply || "").toLowerCase();

 // Явное сообщение, что в базе/контексте нет нужных данных — считаем gap
 const noInfoPatterns = [
   /в контексте нет информации/i,
   /в базе нет информации/i,
   /в справке не указано/i,
   /в документаци[иия] не указано/i,
   /не наш[её]л[аи]? (сведени|информац)/i,
   /не (указан[оаы]?|приведён[оаы]?|сообщен[оаы]?|известн[оаы]?)/i,
   /нет (информации|данных) (об|по)/i,
   /указано только контактн[оеыя] лицо/i
 ];
 if (noInfoPatterns.some(rx => rx.test(r))) {
   return { goodAnswer: false, confidence: 0.9, reason: "no-data-in-kb" };
 }

  const badPhrases = [
   "не удалось",
   "не могу предоставить",
   "не могу раскрыть",
   "нет доступа",
   "конфиденциал",
   "конфиденциально",
   "конфиденциаль",
   "не имею доступа",
   "i don't know",
   "insufficient",
   "cannot provide",
   "cannot disclose",
   "can't share",
   "confidential"
 ];
  if (badPhrases.some(p => r.includes(p))) return { goodAnswer: false, confidence: 0.8, reason: "fallback-phrase" };
  if (phase === "rag-extractive") return { goodAnswer: true, confidence: 0.75, reason: "extractive" };
  return null; // пусть решит модель
}

const EXPLICIT_NOINFO_RE = /(в контексте нет информации|в базе нет информации|в справке не указано|в (предоставленной|загруженн(?:ой|ых)) (базе знаний|документах) нет информации|нет информации о\b|нет данных о\b|no information (in|about) (the )?(knowledge base|docs|documentation)|not available in (our )?(database|documents))/i;

async function assessGoodAnswer({ oai, model, question, reply, contexts, lang }) {
  // 1) эвристика до модели
  const pre = quickHeuristicGood({ phase: null, contexts, reply });
  if (pre) return pre;

  if (!oai) {
    // нет ключа — не тормозим пайплайн
    return { goodAnswer: true, confidence: 0.99, reason: "no-oai" };
  }

  const prompt = [
    { role: "system", content:
`You are a strict QA checker for a retrieval-based assistant.
 Return ONLY valid JSON:
 {"goodAnswer":true|false,"confidence":0..1,"reason":"short text"}

 Rules:
 - "goodAnswer": true if the assistant adequately answers the user's question, with specific statements grounded in the retrieved sources. Minor omissions are acceptable if the main question is answered and grounded.
 - If any requested part is missing, refused, vague, generic, or not grounded in the sources, set goodAnswer=false.
 - Refusals like "cannot provide/disclose", "не могу предоставить/раскрыть" MUST be marked goodAnswer=false.
 - Prefer being strict; if unsure, lean to false.` },
    { role: "user", content:
`Question:
"""${question}"""

Assistant reply:
"""${(reply || "").slice(0, 2000)}"""

Retrieved source URLs:
${topCitations(contexts).join("\n") || "(none)"}

Return JSON only.`}
  ];

  try {
    const r = await oai.chat.completions.create({
      model: "gpt-5-nano",                 // дешёвая/быстрая
      messages: prompt,
      response_format: { type: "json_object" },
      temperature: 0
    });
    const txt = r.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(txt);
    return {
      goodAnswer: !!parsed.goodAnswer,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reason: String(parsed.reason || "")
    };
  } catch (e) {
    // при ошибке — не блокируем ответ
    return { goodAnswer: true, confidence: 0.5, reason: "judge-error" };
  }
}

export async function logGapIfBad({
  goodAnswer,
  confidence,
  reason,
  siteId,
  sessionId,
  clientId,
  question,
  reply,
  phase,
  citations
}) {
  // 1) Коэрсим goodAnswer — "false" (строка) => false, "true" => true
  const isGood = goodAnswer === true || goodAnswer === "true";
  if (isGood) return;

  // 2) Нормализуем вопрос
  const normalizedQuestion = (question || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  if (!normalizedQuestion) return; // пустоту не логируем

  // 3) Безопасные значения. Вариант А: подставляем "UNKNOWN_*"
  const safeSiteId = siteId || "UNKNOWN_SITE";
  const safeSessionId = sessionId || "UNKNOWN_SESSION";

  // Если НЕ хочешь писать мусор без siteId/sessionId — раскомментируй эту «жёсткую» защиту:
  // if (!siteId || !sessionId) return;

  // 4) Аккуратно собираем фильтр и апдейт
  const filter = {
    siteId: safeSiteId,
    sessionId: safeSessionId,
    normalizedQuestion,
    resolvedAt: { $exists: false },
  };

  const update = {
    $setOnInsert: {
      siteId: safeSiteId,
      sessionId: safeSessionId,
      clientId: clientId || null,
      question,
      normalizedQuestion,
      createdAt: new Date(),
      resolvedAt: null,
    },
    $set: {
      answerPreview: (reply || "").slice(0, 1500),
      phase: phase || "judge",
      citations: (Array.isArray(citations) ? citations : [])
        .map(c => (typeof c === "string" ? c : c?.url))
        .filter(Boolean)
        .slice(0, 5),
      judge: { goodAnswer: false, confidence, reason },
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    },
  };

  // 5) Апсерт с ловлей ошибок
  let updRes = null;
  try {
    updRes = await AiwGap.updateOne(filter, update, { upsert: true });
    console.log("[AiwGap] result:", updRes);
  } catch (e) {
    console.error("[AiwGap] updateOne ERROR:", e?.name, e?.message, e);
    return; // на ошибке — просто выходим, чтобы не уронить поток
  }

  // 6) Диагностика результата (используем updRes, а не несуществующий 'result')
  try {
    if (updRes?.upsertedId) {
      console.log("[AiwGap] upserted", updRes.upsertedId);
    } else {
      console.log(
        "[AiwGap] updated existing gap; matched:",
        updRes?.matchedCount,
        "modified:",
        updRes?.modifiedCount
      );
    }
  } catch (_) {
    // не мешаем основному потоку даже если лог сломается
  }
}


async function resolveClientIdStrict(req, meta, siteId) {
  // 1) явный x-aiw-client
  const raw =
    req.header("x-aiw-client") ||
    meta?.clientId ||
    req.body?.clientId ||
    null;

  if (raw && mongoose.isValidObjectId(raw)) {
    return new mongoose.Types.ObjectId(raw);
  }

  // 2) slug → _id
  const slug =
    req.header("x-aiw-client-slug") ||
    meta?.clientSlug ||
    req.body?.clientSlug ||
    null;

  if (slug) {
    const c = await Client.findOne({ slug }).select("_id").lean();
    if (c?._id) return new mongoose.Types.ObjectId(c._id);
  }

  // 3) legacy fallback: попытка найти по siteId (если есть)
  if (siteId && siteId !== "unknown-site") {
    const c = await Client.findOne({
      $or: [{ siteId }, { "sites.siteId": siteId }, { domains: siteId }]
    }).select("_id").lean();
    if (c?._id) return new mongoose.Types.ObjectId(c._id);
  }

  return null;
}

// ============ Конфигурация ============
const oai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;


const MODEL = process.env.OPENAI_MODEL || "gpt-5-nano"; // можно сменить в .env
const CURRENCY = process.env.AIW_CURRENCY || "USD";

const DEFAULT_SYS_RU = `Ты — бот-ассистент этого сайта. Отвечай кратко и дружелюбно.
- Помогаешь с вопросами о компании, услугах, тарифах, документах и контактах.
- Если информации не хватает, вежливо уточни 1–2 вопроса.
- Формат: 2–4 коротких предложения.`;

const DEFAULT_SYS_EN = `You are this website's bot assistant. Be brief and friendly.
- Help with info about the company, services, pricing, docs and contacts.
- If info is missing, politely ask 1–2 clarifying questions.
- Keep answers to 2–4 short sentences.`;

function defaultNoContextReply(lang = "ru", cfg = {}) {
  const title = (cfg?.widgetTitle || (lang.startsWith("ru") ? "AI-ассистент" : "AI Assistant")).trim();
  const welcome = (cfg?.welcomeMessage || "").trim();

  if (lang.startsWith("ru")) {
    const base = `Привет! Я ${title} этого сайта.`;
    const cap  = `Могу помочь с услугами, ценами, документами/FAQ и контактами.`;
    const ask  = `С чего начнём?`;
    return [welcome || base, cap, ask].filter(Boolean).join(" ");
  }
  const base = `Hi! I’m the site’s ${title}.`;
  const cap  = `I can help with services, pricing, docs/FAQ, and contacts.`;
  const ask  = `What would you like to start with?`;
  return [welcome || base, cap, ask].filter(Boolean).join(" ");
}


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

async function resolveClientId(req, meta, siteId) {
  // 1) приоритет: явный clientId из заголовка/боди/меты
  const explicit =
    req.header("x-aiw-client") ||
    meta?.clientId ||
    req.body?.clientId ||
    null;
  if (explicit) return String(explicit);

  // 2) clientSlug (если фронт шлёт слаг)
  const slug =
    req.header("x-aiw-client-slug") ||
    meta?.clientSlug ||
    req.body?.clientSlug ||
    null;
  if (slug) {
    const c = await Client.findOne({ slug }).select("_id").lean();
    if (c?._id) return String(c._id);
  }

  // 3) попытка найти по siteId (гибкий OR под разные варианты схемы)
  if (siteId && siteId !== "unknown-site") {
    const c = await Client.findOne({
      $or: [
        { siteId },                     // если поле единичное
        { "sites.siteId": siteId },     // если массив сайтов
        { domains: siteId },            // если храните домены
      ]
    }).select("_id").lean();
    if (c?._id) return String(c._id);
  }

  return null;
}



async function ensureSession(meta, req) {
  try {
    const { siteId, sessionId, visitorId, pageUrl, referrer, utm, tz, lang, clientId } = meta || {};
    const ipHashVal = hashIp(getIp(req), req.headers["user-agent"], siteId || "unknown-site");
    const now = new Date();

    await AiwSession.updateOne(
      { sessionId },
      {
        $setOnInsert: {
          siteId: siteId || "unknown-site",
          sessionId,
          visitorId: visitorId || null,
          clientId: clientId || null,               // <— NEW
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
        $set: { endedAt: now, ...(clientId ? { clientId } : {}) }, // <— обновляем, если появился
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


async function logUserMessage({ siteId, sessionId, content, clientId }) {
  try {
    if (!content) return;
    const topics = classifyTopics(content);
    const doc = await AiwMessage.create({
      siteId: siteId || "unknown-site",
      clientId: clientId || null,        // <— NEW
      sessionId,
      role: "user",
      content: String(content).slice(0, 8000),
      topic: topics[0],
    });
    await AiwSession.updateOne(
      { sessionId },
      {
        $inc: { messagesCount: 1, userMessages: 1 },
        $set: { lastUserQuestion: content, endedAt: new Date(), ...(clientId ? { clientId } : {}) },
        $addToSet: { topics: { $each: topics } },
      }
    );
    console.log("[AIW] logged user msg", doc._id.toString());
  } catch (e) {
    console.error("[AIW] logUserMessage error", e);
  }
}

async function logAssistantMessage({ siteId, sessionId, content, latencyMs, clientId }) {
  try {
    if (content == null) return;
    const topics = classifyTopics(content);
    const doc = await AiwMessage.create({
      siteId: siteId || "unknown-site",
      clientId: clientId || null,        // <— NEW
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
        $set: { endedAt: new Date(), ...(clientId ? { clientId } : {}) },
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

function sendJSON(req, res, { reply, source, citations = [], goodAnswer, confidence }) {
  setJSONHeaders(req, res);
  setSourceHeaders(res, source, citations);
   const body = { reply, source, citations };
  if (goodAnswer !== undefined) body.goodAnswer = goodAnswer;
  if (confidence !== undefined) body.confidence = confidence;
  return res.status(200).json(body);
}

function pickSystemPrompt(cfg, lang = "ru") {
  const fromDb = (cfg?.customSystemPrompt || "").trim();
  if (fromDb) return fromDb;                       // 1) из БД, если задан
  return lang.startsWith("ru") ? DEFAULT_SYS_RU    // 2) иначе дефолт
                               : DEFAULT_SYS_EN;
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
  const T = makeTimer(req);
T.mark("entered"); // t=0
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
      "X-AIW-Phase","X-AIW-DB","X-AIW-Timing","X-AIW-Good-Answer","X-AIW-Client",
       "X-AIW-WidgetCfg",
         "X-AIW-Contexts",           
  "X-AIW-Retrieve-Mode"       
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
    // const siteId = String(req.header("x-aiw-site") || meta.siteId || "demo");
    // const sessionId = String(req.header("x-aiw-session") || meta.sessionId || "");
    // const visitorId = String(req.header("x-aiw-visitor") || meta.visitorId || "");
    const { siteId, sessionId, visitorId } = resolveIds(req, meta);


    const clientId = await resolveClientIdStrict(req, meta, siteId);
if (clientId) res.setHeader("X-AIW-Client", String(clientId));
    const cfg = await getWidgetConfigCached({ clientId, siteId });

// пригодится для фронта:
if (cfg?._id) res.setHeader("X-AIW-WidgetCfg", String(cfg._id));

    res.setHeader("X-AIW-Resolved-Site", siteId);
    res.setHeader("X-AIW-Resolved-Session", sessionId || "(empty)");

    const metaAll = {
      siteId,
      sessionId,
      visitorId,
        clientId,    
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
    T.mark("ensureSession");


    // ====== извлекаем пользовательский вопрос ======
    const lastUser = [...safeMsgs].reverse().find((m) => m.role === "user");
    const query = (lastUser?.content || "").trim();

    // логируем юзера (не пишем пустоту)
    if (query) {
      await logUserMessage({ siteId, sessionId, content: query, clientId });
      T.mark("logUserMessage");
      dbMark = "user:+ assistant:-";
    }

    if (!query) {
      phase = "empty";
      res.setHeader("X-AIW-Phase", phase);
      res.setHeader("X-AIW-DB", dbMark);
      const timings = T.get();
// добавим производные: buildPromptDur, llmWait, ttfb (time-to-first-byte), firstChunk
const derived = {
  buildPromptDur: (timings.buildPrompt ?? 0) - (timings.prePrompt ?? 0),
  llmWait: (timings.afterLLM ?? 0) - (timings.beforeLLM ?? 0),
  ttfb: timings.firstByteToClient ?? undefined,
  firstChunk: (timings.firstChunkFlushed ?? 0) - (timings.firstByteToClient ?? 0),
};



res.setHeader("X-AIW-Timing", JSON.stringify({
  ...timing,          // твои старые поля для совместимости
  ...timings,         // подробные метки
  ...derived,
  total: timings.total
}));

// опционально красивый серверный лог
console.log("[AIW][timings]", JSON.stringify({
  siteId, sessionId, phase,
  timings: { ...timings, ...derived }
}));

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
console.log("[AIW] clientId:", String(clientId), "query:", query);

// ====== RAG retrieve ======
const retrieveRes = await T.wrap("retrieve", async () => {
  try {
    const r = await retrieveUnified({
      clientId,
      siteId,
      query,
      kClient: Number(process.env.AIW_KCLIENT || 8),
      includeWeb: false,          // только клиентские/локальные источники
    });

    if (r?.contexts?.length) {
      res.setHeader("X-AIW-Retrieve-Mode", "unified");
      return r;
    } else {
      res.setHeader("X-AIW-Retrieve-Mode", "unified-empty");
      return { contexts: [] };
    }
  } catch (e) {
    console.warn("[retrieveUnified]", e?.message || e);
    res.setHeader("X-AIW-Retrieve-Mode", "unified-error");
    return { contexts: [] }; // вообще ничего не нашли / ошибка — пусть будет no-context
  }
});


const contexts = retrieveRes.contexts || [];
res.setHeader("X-AIW-Contexts", String(contexts.length));
console.log("[AIW] contexts:", contexts.length);
timing.retrieve = T.get().retrieve;

//     // ====== Fast extractive ======
//     const fast = tryFastAnswer(query, contexts, lang);
//     if (fast) {
//       phase = "rag-extractive";
//       setSourceHeaders(res, "rag-extractive", fast.citations || []);
//       res.setHeader("X-AIW-Phase", phase);

//       const payload = { reply: fast.reply, citations: fast.citations || [] };
//       await logAssistantMessage({ siteId, sessionId, content: payload.reply, latencyMs: Date.now() - started, clientId });
//       dbMark = "user:+ assistant:+";
//       // === judge & optional gap log (NEW) ===
// const quick = quickFlag({ phase, contexts, reply: payload.reply });
// res.setHeader("X-AIW-Good-Answer", String(quick.goodAnswer)); // быстрый флаг

// defer(async () => {
//   const judge = await assessGoodAnswer({
//     oai, model: "gpt-5-nano",
//     question: query, reply: payload.reply, contexts, lang
//   });
// const THRESH = Number(process.env.AIW_JUDGE_THRESHOLD || 0.60);
//  const hasSupport = ((payload.citations?.length || 0) > 0) || ((contexts?.length || 0) > 0);
//  // Плохо только если судья явно сказал false ИЛИ если нет опоры и низкая уверенность
 
//  const ans = payload.reply || "";
// const explicitNoInfo = /(в контексте нет информации|в базе нет информации|в справке не указано|не (указан|приведён|сообщено|известно)|указано только контактн)/i.test(ans);

// const finalBad = explicitNoInfo || (judge?.goodAnswer === false) || (!hasSupport && (judge?.confidence ?? 0) < THRESH);

//  const reason =
//    explicitNoInfo ? "no-data-in-kb" :
//    (judge?.goodAnswer === false ? (judge?.reason || "judge-false") :
//    (!hasSupport && (judge?.confidence ?? 0) < THRESH ? "low-confidence" : "ok"));


//  await logGapIfBad({
//    goodAnswer: !finalBad,
//    confidence: judge.confidence,
//    reason,
//    siteId, sessionId, clientId, question: query, reply: payload.reply, phase, citations: payload.citations
//  });
// });

//       res.setHeader("X-AIW-DB", dbMark);
//       const timings = T.get();
// // добавим производные: buildPromptDur, llmWait, ttfb (time-to-first-byte), firstChunk
// const derived = {
//   buildPromptDur: (timings.buildPrompt ?? 0) - (timings.prePrompt ?? 0),
//   llmWait: (timings.afterLLM ?? 0) - (timings.beforeLLM ?? 0),
//   ttfb: timings.firstByteToClient ?? undefined,
//   firstChunk: (timings.firstChunkFlushed ?? 0) - (timings.firstByteToClient ?? 0),
// };



// res.setHeader("X-AIW-Timing", JSON.stringify({
//   ...timing,          // твои старые поля для совместимости
//   ...timings,         // подробные метки
//   ...derived,
//   total: timings.total
// }));

// // опционально красивый серверный лог
// console.log("[AIW][timings]", JSON.stringify({
//   siteId, sessionId, phase,
//   timings: { ...timings, ...derived }
// }));

//       if (!stream) {
//         setJSONHeaders(req, res);
// return sendJSON(req, res, { 
//   reply: payload.reply, source: "rag-extractive", citations: payload.citations,
//   goodAnswer: quick.goodAnswer, confidence: quick.confidence
// });
//       } else {
//         setSSEHeaders(req, res);
//         res.write(": heartbeat\n\n");
//           T.mark("firstByteToClient");   
//         const CH = 24;
//         for (let i = 0; i < payload.reply.length; i += CH) {
//           res.write(`data: ${payload.reply.slice(i, i + CH)}\n\n`);
//         }
//         res.write("data: [DONE]\n\n");
//         return res.end();
//       }
//     }

    // ====== Нет контекста ======
if (!contexts.length) {
  phase = "no-context";
  res.setHeader("X-AIW-Phase", phase);
setSourceHeaders(res, "no-context-llm", []);

  // <-- добавлено: если есть модель — отвечаем без RAG
  let reply;
  if (oai) {
    // cfg вы уже получаете раньше через getWidgetConfigCached({ clientId })
const sys = pickSystemPrompt(cfg, lang);
const baseMessages = [
  { role: "system", content: sys },
  { role: "user",   content: query }
];

try {
  const r = await oai.chat.completions.create({
    model: MODEL,
    messages: baseMessages,
  });
  reply = (r.choices?.[0]?.message?.content || "").trim();
  if (!reply) reply = defaultNoContextReply(lang, cfg);
} catch (e) {
  console.error("[AIW] no-context LLM error:", e?.message || e);
  reply = defaultNoContextReply(lang, cfg);
}
  } else {
    reply = lang.startsWith("ru") ? "Демо-ответ (нет OPENAI_API_KEY)." : "Demo reply (no OPENAI_API_KEY).";
  }

  await logAssistantMessage({ siteId, sessionId, content: reply, latencyMs: Date.now() - started, clientId });
 
  // для no-context теперь не помечаем «плохо» — пусть решит судья
  const quick = quickFlag({ phase, contexts: [], reply });
  res.setHeader("X-AIW-Good-Answer", String(quick.goodAnswer));


  defer(async () => {
  const judge = await assessGoodAnswer({
    oai, model: "gpt-5-nano",
    question: query, reply, contexts: [], lang
  });
  const THRESH = Number(process.env.AIW_JUDGE_THRESHOLD || 0.60);
  const hasSupport = false; // нет контекста и нет цитат
  

  const ans = reply || "";
  const explicitNoInfo = EXPLICIT_NOINFO_RE.test(ans);
  const finalBad = explicitNoInfo || (judge?.goodAnswer === false) || (!hasSupport && (judge?.confidence ?? 0) < THRESH);

  const reason =
    explicitNoInfo ? "no-data-in-kb" :
    (judge?.goodAnswer === false ? (judge?.reason || "judge-false") :
    (!hasSupport && (judge?.confidence ?? 0) < THRESH ? "low-confidence" : "ok"));

  await logGapIfBad({
    goodAnswer: !finalBad,
    confidence: judge.confidence,
    reason,
    siteId, sessionId, clientId, question: query, reply, phase: "no-context", citations: []
  });
});

  dbMark = "user:+ assistant:+";
  res.setHeader("X-AIW-DB", dbMark);

  const timings = T.get();
  const derived = {
    buildPromptDur: (timings.buildPrompt ?? 0) - (timings.prePrompt ?? 0),
    llmWait: (timings.afterLLM ?? 0) - (timings.beforeLLM ?? 0),
    ttfb: timings.firstByteToClient ?? undefined,
    firstChunk: (timings.firstChunkFlushed ?? 0) - (timings.firstByteToClient ?? 0),
  };
  res.setHeader("X-AIW-Timing", JSON.stringify({ ...timing, ...timings, ...derived, total: timings.total }));

  if (!stream) {
    setJSONHeaders(req, res);
    return sendJSON(req, res, {
      reply,
      source: "no-context-llm",      // <-- чтобы было видно, что ответ без RAG
      citations: [],
      goodAnswer: quick.goodAnswer,
      confidence: quick.confidence
    });
  } else {
    setSSEHeaders(req, res);
    res.write(": heartbeat\n\n");
    T.mark("firstByteToClient");
    res.write(`data: ${reply}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }
}

    // ====== Полноценный RAG через LLM ======
    const citations = contexts.map((c, i) => ({ idx: i + 1, url: c.url }));
    T.mark("prePrompt");
    // const prompt = buildPrompt({ query, contexts, lang });
    let prompt = buildPrompt({ query, contexts, lang });

// если есть кастомный системный промпт — добавим его первым сообщением

  const sys = pickSystemPrompt(cfg, lang);
  // если buildPrompt где-то добавляет свой system — наш будет иметь приоритет
  prompt = [{ role: "system", content: sys }, ...prompt.filter(m => m.role !== "system")];



    T.mark("buildPrompt"); // длительность = (buildPrompt - prePrompt)

    if (stream) {
      // ---- STREAM (SSE) ----
      phase = "rag";
      res.setHeader("X-AIW-Phase", phase);
      setSourceHeaders(res, "rag", citations);
      setSSEHeaders(req, res);
      res.write(": heartbeat\n\n");
      T.mark("firstByteToClient");  
      const quick = quickFlag({ phase, contexts, reply: "" });
res.setHeader("X-AIW-Good-Answer", String(quick.goodAnswer));

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
 T.mark("beforeLLM");
    const completion = await oai.chat.completions.create({ model: MODEL, messages: prompt });
    T.mark("afterLLM");
    const reply = completion.choices?.[0]?.message?.content?.trim() || "";
    buffer = reply;

    // первая полезная часть ушла клиенту
    res.write(`data: ${reply.slice(0, 24)}\n\n`);
    T.mark("firstChunkFlushed");

    // остаток
    const CH = 24;
    for (let i = 24; i < reply.length && !clientClosed; i += CH) {
      res.write(`data: ${reply.slice(i, i + CH)}\n\n`);
          }
        } catch (e) {
          const msg = `⚠️ ${e?.message || "LLM error"}`;
          buffer = msg;
          if (!clientClosed) res.write(`data: ${msg}\n\n`);
        }
      }

      // лог ассистента и финальные заголовки
      await logAssistantMessage({ siteId, sessionId, content: buffer, latencyMs: Date.now() - started, clientId });
      T.mark("logAssistantMessage");
      dbMark = "user:+ assistant:+";
      res.setHeader("X-AIW-DB", dbMark);
      const timings = T.get();
// добавим производные: buildPromptDur, llmWait, ttfb (time-to-first-byte), firstChunk
const derived = {
  buildPromptDur: (timings.buildPrompt ?? 0) - (timings.prePrompt ?? 0),
  llmWait: (timings.afterLLM ?? 0) - (timings.beforeLLM ?? 0),
  ttfb: timings.firstByteToClient ?? undefined,
  firstChunk: (timings.firstChunkFlushed ?? 0) - (timings.firstByteToClient ?? 0),
};


res.setHeader("X-AIW-Timing", JSON.stringify({
  ...timing,          // твои старые поля для совместимости
  ...timings,         // подробные метки
  ...derived,
  total: timings.total
}));

// опционально красивый серверный лог
console.log("[AIW][timings]", JSON.stringify({
  siteId, sessionId, phase,
  timings: { ...timings, ...derived }
}));

      if (!clientClosed) {
        res.write("data: [DONE]\n\n");
        res.end();
      }

defer(async () => {
  const judge = await assessGoodAnswer({
    oai,
    model: "gpt-5-nano",
    question: query,
    reply: buffer,
    contexts,
    lang,
  });

  const THRESH = Number(process.env.AIW_JUDGE_THRESHOLD || 0.60);

  const ans = buffer || "";
  const explicitNoInfo = EXPLICIT_NOINFO_RE.test(ans);

  let hasSupport =
    (citations?.length || 0) > 0 ||
    (contexts?.length || 0) > 0;

  // если явно сказано, что в базе/документах нет информации — считаем, что опоры нет
  if (explicitNoInfo) {
    hasSupport = false;
  }

  const finalBad =
    explicitNoInfo ||
    (judge?.goodAnswer === false) ||
    (!hasSupport && (judge?.confidence ?? 0) < THRESH);

  const reason =
    explicitNoInfo
      ? "no-data-in-kb"
      : (judge?.goodAnswer === false
          ? (judge?.reason || "judge-false")
          : (!hasSupport && (judge?.confidence ?? 0) < THRESH
              ? "low-confidence"
              : "ok"));

  await logGapIfBad({
    goodAnswer: !finalBad,
    confidence: judge.confidence,
    reason,
    siteId,
    sessionId,
    clientId,
    question: query,
    reply: buffer,
    phase,
    citations,
  });
});


      return;
    } else {
      // ---- JSON ----
      phase = "rag";
      res.setHeader("X-AIW-Phase", phase);
      setSourceHeaders(res, "rag", citations);
T.mark("beforeLLM");
let reply = lang.startsWith("ru") ? "Демо-ответ (нет OPENAI_API_KEY)." : "Demo reply (no OPENAI_API_KEY).";
if (oai) {
  const completion = await oai.chat.completions.create({ model: MODEL, messages: prompt });
  reply = completion.choices?.[0]?.message?.content?.trim() || reply;
}
T.mark("afterLLM");
timing.llm = T.get().afterLLM - T.get().beforeLLM;


      await logAssistantMessage({ siteId, sessionId, content: reply, latencyMs: Date.now() - started, clientId });
      dbMark = "user:+ assistant:+";

      res.setHeader("X-AIW-DB", dbMark);
      const timings = T.get();
// добавим производные: buildPromptDur, llmWait, ttfb (time-to-first-byte), firstChunk
const derived = {
  buildPromptDur: (timings.buildPrompt ?? 0) - (timings.prePrompt ?? 0),
  llmWait: (timings.afterLLM ?? 0) - (timings.beforeLLM ?? 0),
  ttfb: timings.firstByteToClient ?? undefined,
  firstChunk: (timings.firstChunkFlushed ?? 0) - (timings.firstByteToClient ?? 0),
};



res.setHeader("X-AIW-Timing", JSON.stringify({
  ...timing,          // твои старые поля для совместимости
  ...timings,         // подробные метки
  ...derived,
  total: timings.total
}));

// опционально красивый серверный лог
console.log("[AIW][timings]", JSON.stringify({
  siteId, sessionId, phase,
  timings: { ...timings, ...derived }
}));

 setJSONHeaders(req, res);
 const quick = quickFlag({ phase, contexts, reply });
 res.setHeader("X-AIW-Good-Answer", String(quick.goodAnswer));

 defer(async () => {
  const judge = await assessGoodAnswer({
    oai,
    model: "gpt-5-nano",
    question: query,
    reply,
    contexts,
    lang,
  });

  const THRESH = Number(process.env.AIW_JUDGE_THRESHOLD || 0.60);

  const ans = reply || "";
  const explicitNoInfo = EXPLICIT_NOINFO_RE.test(ans);

  let hasSupport =
    (citations?.length || 0) > 0 ||
    (contexts?.length || 0) > 0;

  if (explicitNoInfo) {
    hasSupport = false;
  }

  const finalBad =
    explicitNoInfo ||
    (judge?.goodAnswer === false) ||
    (!hasSupport && (judge?.confidence ?? 0) < THRESH);

  const reason =
    explicitNoInfo
      ? "no-data-in-kb"
      : (judge?.goodAnswer === false
          ? (judge?.reason || "judge-false")
          : (!hasSupport && (judge?.confidence ?? 0) < THRESH
              ? "low-confidence"
              : "ok"));

  await logGapIfBad({
    goodAnswer: !finalBad ? true : false,
    confidence: judge.confidence,
    reason,
    siteId,
    sessionId,
    clientId,
    question: query,
    reply,
    phase,
    citations,
  });
});


 return sendJSON(req, res, {
   reply, source: "rag", citations,
   goodAnswer: quick.goodAnswer, confidence: quick.confidence
 });

    }
  } catch (e) {
    phase = "error";
    res.setHeader("X-AIW-Phase", phase);
    res.setHeader("X-AIW-DB", dbMark);
    const timings = T.get();
// добавим производные: buildPromptDur, llmWait, ttfb (time-to-first-byte), firstChunk
const derived = {
  buildPromptDur: (timings.buildPrompt ?? 0) - (timings.prePrompt ?? 0),
  llmWait: (timings.afterLLM ?? 0) - (timings.beforeLLM ?? 0),
  ttfb: timings.firstByteToClient ?? undefined,
  firstChunk: (timings.firstChunkFlushed ?? 0) - (timings.firstByteToClient ?? 0),
};



res.setHeader("X-AIW-Timing", JSON.stringify({
  ...timing,          // твои старые поля для совместимости
  ...timings,         // подробные метки
  ...derived,
  total: timings.total
}));

// опционально красивый серверный лог
console.log("[AIW][timings]", JSON.stringify({
  siteId, sessionId, phase,
  timings: { ...timings, ...derived }
}));
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
