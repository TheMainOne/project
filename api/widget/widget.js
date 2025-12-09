// The main code for the widget. All request processing logic is located here.
import 'dotenv/config';     
import mongoose from "mongoose";
import express from "express";
import OpenAI from "openai";
import AiwSession from "../../models/AiwSession.js";
import AiwMessage from "../../models/AiwMessage.js";
import AiwGap from "../../models/AiwGap.js"; 
import Lead from "../../models/Lead.js";
import Client from "../../models/Client.js";
import { hashIp, classifyTopics } from "../../utils/telemetry.js";
import { buildPrompt } from "../../services/web_crawler/core.js";
import { getWidgetConfigCached } from '../../services/widgetConfig/cache.js';
import { detectLeadIntent } from "../../services/lead/intent.js";
import { retrieveHybrid } from '../../services/rag/retrieveHybrid.js';
import { classifyRagIntent } from "../../services/rag/intent.js";
import {
  hasLeadActions,
  leadStateMachine,
  normalizeLeadState,
  normalizeAnswers,
  shouldSuppressLead,
} from "../../services/lead/stateMachine.js";
import {
  prepareQueryForRag,
  detectLangFromText,      
  isShortConfirmation,    
  isExampleFollowup,      
} from "../../services/rag/queryRewrite.js";

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
   // RU
   /в контексте нет информации/i,
   /в базе(?: знаний)? нет информации/i,
   /в справке не указано/i,
   /в документаци[иия] не указано/i,
   /не наш[её]л[аи]? (сведени|информац)/i,
   /не (указан[оаы]?|приведён[оаы]?|сообщен[оаы]?|известн[оаы]?)/i,
   /нет (информации|данных) (об|по)/i,
   /указано только контактн[оеыя] лицо/i,

   // EN
   /no (information|info) (in|about|on) (our )?(knowledge base|docs?|documentation|database|records)/i,
   /there (is|are) no (information|data) (available )?(on|about)/i,
   /we (do not|don't) have (any )?(information|data) (on|about)/i,
   /no data (on|about)/i,
   /not (listed|specified|documented) (in|within) (the )?(knowledge base|docs?|documentation|database)/i,
   /not available in (our )?(database|documents|docs|knowledge base)/i,
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

function sseEncode(str = "") {
  return String(str)
    .replace(/\r/g, "")   // убираем \r
    .replace(/\n/g, "\\n"); // \n → \n (двойной бэкслеш)
}

const EXPLICIT_NOINFO_RE = /(в контексте нет информации|в базе(?: знаний)? нет информации|в справке не указано|в (предоставленной|загруженн(?:ой|ых)) (базе знаний|документах) нет информации|нет информации о\b|нет данных о\b|no (information|info) (in|about|on) (our )?(knowledge base|docs?|documentation|database|records)|there (is|are) no (information|data) (available )?(on|about)|not (listed|specified|documented) (in|within) (the )?(knowledge base|docs?|documentation|database)|we (do not|don't) have (any )?(information|data) (on|about)|no data (on|about)|not available in (our )?(database|documents|docs|knowledge base))/i;
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
      model: "gpt-5-nano",                 // дешёвая/быстрая - можно протестировать другие модели gpt-5-nano
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


const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // самая быстрая по скорости ответа gpt-4o-mini
const COMPLETION_OPTS = {
  // max_completion_tokens: 1000, //for gpt-5-mini
  max_tokens: 1000,
  temperature: 0.7,
};
const CURRENCY = process.env.AIW_CURRENCY || "USD";
const MAX_HISTORY_FOR_LLM = 25;

const MODEL_PRICES = {
  "gpt-5-nano": {
    in: 0.05 / 1_000_000,
    out: 0.40 / 1_000_000,
  },
  "gpt-4o-mini": {
    in: 0.15 / 1_000_000,   // $0.15 за 1M input
    out: 0.60 / 1_000_000,  // $0.60 за 1M output
  },
};

function estimateCostUsd(model, inputTokens = 0, outputTokens = 0) {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  const costIn  = inputTokens  * price.in;
  const costOut = outputTokens * price.out;
  return Number((costIn + costOut).toFixed(6));  // до 6 знаков после запятой
}

const DEFAULT_SYS_RU = `Ты — бот-ассистент этого сайта. Отвечай кратко и дружелюбно.
- Помогаешь с вопросами о компании, услугах, тарифах, документах и контактах.
- Если информации не хватает, вежливо уточни 1–2 вопроса.
- Если пользователь отвечает коротко вроде "да", "давай", "ок", "go", "let's do it" на твоё предложение (например, подготовить быстрый расчёт цены), считай это согласием и продолжай именно эту инициативу: задай уточняющие вопросы, чтобы выполнить предложенное действие.
- Формат: 2–4 коротких предложения.`;

const DEFAULT_SYS_EN = `You are this site's assistant bot. Respond briefly and friendly.
- Help with questions about the company, services, rates, documents, and contacts.
- If information is missing, politely ask 1-2 questions to clarify.
- If the user responds briefly to your suggestion (e.g., prepare a quick price quote) with a simple "yes," "ok," "go," or "let's do it," consider it consent and continue with that specific initiative: ask clarifying questions to complete the suggested action.
- Format: 2-4 short sentences.`;

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
       { upsert: true, setDefaultsOnInsert: true }
    );
    return { sessionId };
  } catch (e) {
    console.error("[AIW] ensureSession error", e);
    return null;
  }
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


async function logAssistantMessage({
  siteId,
  sessionId,
  content,
  latencyMs,
  clientId,
  tokensInput,
  tokensOutput,
  tokensTotal,
  costUsd,
}) {
  try {
    if (content == null) return;
    const topics = classifyTopics(content);
    const doc = await AiwMessage.create({
      siteId: siteId || "unknown-site",
      clientId: clientId || null,
      sessionId,
      role: "assistant",
      content: String(content).slice(0, 200_000),
      topic: topics[0],
      latencyMs,

      // 👇 новые поля
      tokensInput:  tokensInput  ?? null,
      tokensOutput: tokensOutput ?? null,
      tokensTotal:  tokensTotal  ?? null,
      costUsd:      costUsd      ?? null,
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
  // если заголовки уже ушли — ничего не делаем
  if (res.headersSent) return;

  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

function setJSONHeaders(req, res) {
  // защита от повторного вызова после отправки SSE/JSON
  if (res.headersSent) return;

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

function leadCopy(lang = "ru") {
  const isRu = lang?.startsWith("ru");
  return {
    softPrompt: isRu
      ? "Если хотите, я могу передать ваши контакты нашей команде. Оставите имя и email?"
      : "If you’d like, I can pass your contact details to our team. Would you like to leave your name and email?",
    startCapture: isRu
      ? "Отлично! Давайте соберём пару деталей, чтобы мы могли с вами связаться."
      : "Great! Let me collect a couple of details so our team can reach out to you.",
    thankYou: isRu
      ? "Спасибо! Мы получили ваши данные и скоро свяжемся."
      : "Thank you! We’ve received your details and will contact you soon.",
    askFallback: isRu ? "Уточните, пожалуйста:" : "Please specify:",
  };
}

function pickLeadQuestion(step = {}, lang = "ru") {
  if (!step) return null;
  const isRu = lang?.startsWith("ru");
  return (
    (isRu && (step.label?.ru || step.placeholder?.ru)) ||
    step.label?.en ||
    step.placeholder?.en ||
    (isRu ? "Уточните, пожалуйста:" : "Please specify:")
  );
}

async function processLeadActions({
  actions = [],
  leadCfg = {},
  leadState = {},
  lang = "ru",
  siteId,
  sessionId,
  visitorId,
  clientId,
}) {
  const copy = leadCopy(lang);
  const steps = leadCfg?.steps || [];
  const messages = [];
  let captureReason = null;

  for (const act of actions) {
    switch (act.type) {
      case "show_soft_prompt":
        messages.push(copy.softPrompt);
        break;
      case "start_capture":
        captureReason = act.reason || captureReason;
        messages.push(copy.startCapture);
        break;
      case "ask_next_question": {
        const step = steps[leadState.currentStepIndex] || null;
        const q = pickLeadQuestion(step, lang) || copy.askFallback;
        messages.push(q);
        break;
      }
      case "finish_capture": {
        messages.push(copy.thankYou);
        await Lead.create({
          clientId: clientId || null,
          siteId: siteId || null,
          sessionId: sessionId || null,
          visitorId: visitorId || null,
          answers: normalizeAnswers(leadState.answers),
          meta: { lang, trigger: leadState.trigger || null, },
        });
        break;
      }
         case "suppress": {
        // 🔽 новый кейс для отрицательного ответа
        if (lang.startsWith("ru")) {
          messages.push("Хорошо, не буду передавать ваши контакты. Если передумаете — просто напишите, что хотите оставить имя и email.");
        } else {
          messages.push("Got it, I won’t pass your contact details. If you change your mind, just let me know you’d like to leave your name and email.");
        }
        break;
      }
      default:
        break;
    }
  }

  return messages;
}

function combineReplies(base, extras = []) {
  return [base, ...(extras || [])].filter(Boolean).join("\n\n");
}



// !!This code successfully stopped the responses from randomly switching between languages!!

function pickSystemPrompt(cfg, lang = "ru") {
  const fromDb = (cfg?.customSystemPrompt || "").trim();
  const base = fromDb || (lang.startsWith("ru") ? DEFAULT_SYS_RU : DEFAULT_SYS_EN);

  // 🔒 Жёсткий язык для этой конкретной беседы
  const langHeader = lang.startsWith("ru")
    ? `IMPORTANT: For this conversation you MUST answer ONLY in Russian.
- The user interface language is Russian.
- Even if the system prompt or examples contain English or other languages, you MUST respond in Russian only.
- Never reply in English unless explicitly asked to translate.`
    : `IMPORTANT: For this conversation you MUST answer ONLY in English.
- The user interface language is English.
- Even if the system prompt or examples contain Russian or other languages, you MUST respond in English only.
- Never reply in Russian unless explicitly asked to translate.`;

  return `${langHeader}\n\n${base}`;
}

// !!This code successfully stopped the responses from randomly switching between languages!! END

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
let { messages = [], stream, meta = {} } = req.body || {};
//          ^^^^^  ← убрали дефолт true здесь

const allowedRoles = new Set(["system", "user", "assistant"]);
const safeMsgs = (Array.isArray(messages) ? messages : [])
  .filter((m) => m && allowedRoles.has(m.role) && typeof m.content === "string")
  .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
  .slice(-30);

const { siteId, sessionId, visitorId } = resolveIds(req, meta);

const clientId = await resolveClientIdStrict(req, meta, siteId);
if (clientId) res.setHeader("X-AIW-Client", String(clientId));
const cfg = await getWidgetConfigCached({ clientId, siteId });
const leadCfg = cfg?.leadCapture || {};
const leadEnabled = Boolean(leadCfg?.enabled);

// 👇 НОВОЕ: приоритет за cfg.stream
if (cfg && typeof cfg.stream === "boolean") {
  stream = cfg.stream;
} else if (typeof stream !== "boolean") {
  // если фронт ничего не прислал — по умолчанию true
  stream = true;
}

if (cfg?._id) res.setHeader("X-AIW-WidgetCfg", String(cfg._id));


    res.setHeader("X-AIW-Resolved-Site", siteId);
    res.setHeader("X-AIW-Resolved-Session", sessionId || "(empty)");

    // ====== извлекаем пользовательский вопрос + подготовка для RAG/LLM ======
const {
  rawQuery,
  ragQuery: initialRagQuery,
  llmQuery: initialLlmQuery,
  lang,
  lastUser,
  lastAssistant,
} = await prepareQueryForRag({
  messages: safeMsgs,
  metaLang: meta.lang || "ru",
  oai,
  rewriteModel: "gpt-4o-mini",
  maxHistory: MAX_HISTORY_FOR_LLM,
});

// === RAG intent classification (для chunkType-boost) ===
const { intentTypes, intentLabel } = classifyRagIntent(rawQuery, lang);
// чтобы можно было дебажить в DevTools
if (intentLabel) {
  res.setHeader("X-AIW-Intent", intentLabel);
}

let query    = rawQuery;
let ragQuery = initialRagQuery;
let llmQuery = initialLlmQuery;


// const lastUser = [...safeMsgs].reverse().find((m) => m.role === "user");
// const lastAssistant = [...safeMsgs].reverse().find((m) => m.role === "assistant");

// let query = (lastUser?.content || "").trim();   // это для логов / judge
// let ragQuery = query;                           // это будем слать в retrieve

// // если пользовательский ответ очень короткий, подмешиваем предыдущий ассистентский текст
// if (ragQuery.length < 20 && lastAssistant) {
//   ragQuery = `${lastAssistant.content}\n\nUser follow-up: ${query}`;
// }

// // ---- NEW: нормализация коротких подтверждений ("yes", "да", "ок" и т.п.) ----
// const rawQuery = query;   // то, что реально написал пользователь
// let llmQuery = query;     // то, что пойдёт в buildPrompt / no-context LLM

// function detectLangFromText(text, fallback = "ru") {
//   const t = (text || "").toLowerCase();
//   if (/[а-яё]/i.test(t)) return "ru";   // есть кириллица
//   if (/[a-z]/i.test(t)) return "en";   // есть латиница
//   return fallback;                     // иначе доверяем fallback (из меты/конфига)
// }

// const uiLang = String(meta.lang || "ru");
// const lang   = detectLangFromText(query, uiLang);

// function isShortConfirmation(text) {
//   const q = (text || "").trim().toLowerCase();
//   if (!q) return false;

//   const variants = [
//     // EN
//     "yes", "yep", "yeah", "sure",
//     "ok", "okay",
//     "go", "let's go", "let's do it",

//     // RU
//     "да", "ага", "угу",
//     "ок", "окей",
//     "давай", "поехали", "го"
//   ];

//   return variants.some(w =>
//     q === w ||
//     q.startsWith(w + "!") ||
//     q.startsWith(w + ".") ||
//     q.startsWith(w + ",")
//   );
// }

// function isExampleFollowup(text = "") {
//   const t = text.trim().toLowerCase();
//   if (!t) return false;

//   // 1) Точные однословные запросы типа "пример", "examples"
//   const singleWords = [
//     "пример",
//     "примеры",
//     "примерчик",
//     "example",
//     "examples",
//     "use case",
//     "use cases",
//   ];
//   if (singleWords.includes(t)) return true;

//   // 2) Типичные фразы RU/EN
//   const phrases = [
//     // RU
//     "дай пример",
//     "дай примеры",
//     "можно пример",
//     "можно примеры",
//     "приведи пример",
//     "приведи примеры",
//     "какие примеры",
//     "несколько примеров",
//     "типичные примеры",
//     "типичные кейсы",
//     "реальные кейсы",
//     "реальные примеры",
//     "примеры кейсов",
//     "примеры случаев",
//     "в каких случаях",
//     "в каких ситуациях",

//     // EN
//     "give me an example",
//     "give me some examples",
//     "give examples",
//     "any examples",
//     "some examples",
//     "for example",
//     "for instance",
//     "show me an example",
//     "show me examples",
//     "use case",
//     "use cases",
//     "typical cases",
//     "typical scenarios",
//     "real cases",
//     "real examples",
//     "sample campaign",
//     "sample scenario",
//   ];
//   if (phrases.some(p => t.includes(p))) return true;

//   // 3) Короткие вопросы, где явно фигрутируют "пример/примеры/examples/cases"
//   if (t.length <= 80 && /пример|примеры|примеров|examples?|use cases?|cases?|scenarios?/.test(t)) {
//     return true;
//   }

//   return false;
// }

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


if (isShortConfirmation(query) && lastAssistant) {
  llmQuery =
    `The user replied "${rawQuery}" as a short confirmation and wants you to PROCEED ` +
    `with your previous suggestion.\n\n` +
    `Your previous message was:\n"""${lastAssistant.content}"""\n\n` +
    `IMPORTANT:
  - Do NOT repeat the same campaign descriptions again.
  - Assume the user already knows what you wrote before.
  - Take the NEXT logical step of that suggestion.
  - Either ask 1–2 clarifying questions about their goals/budget/niche,
    or propose a concrete next action (e.g. "let's estimate a test campaign for your game").`;
}

if (isExampleFollowup(query) && lastAssistant) {
  llmQuery =
    `The user is asking for examples of what you suggested earlier.\n` +
    `Previous assistant message:\n"""${lastAssistant.content}"""\n` +
    `Original user question: "${rawQuery}".\n` +
    `Please give examples or describe typical cases, based ONLY on CONTEXT.\n` +
    `Answer in the same language as the user's question.`;
}

    // ====== ensureSession ======
    const tEnsure = Date.now();
    await ensureSession(metaAll, req);
    timing.ensure = Date.now() - tEnsure;
    T.mark("ensureSession");

// ====== Lead state ======
let leadState = normalizeLeadState();
let leadActions = [];
let leadStateChanged = false;

// важно: запоминаем состояние ДО обработки текущего сообщения
let leadSuppressedBefore = false;

if (leadEnabled) {
  const sessionDoc = await AiwSession.findOne({ sessionId }).lean();
  leadState = normalizeLeadState(sessionDoc?.leadState);

  leadSuppressedBefore = shouldSuppressLead(leadState);
  const forceProcess = leadState.status === "capturing";

  // если лида ещё не «задушили» ИЛИ уже идёт захват — обрабатываем сообщение
  if ((forceProcess || !leadSuppressedBefore) && query) {
    const userSm = leadStateMachine({
      leadState,
      leadCfg,
      event: { type: "user_message", userText: query },
    });
    leadState = userSm.nextState;
    leadActions.push(...userSm.actions);
    leadStateChanged = true;
  }
}

// состояние ПОСЛЕ обработки текущего сообщения
const leadSuppressed = shouldSuppressLead(leadState);

// действия, относящиеся к самой форме лида (а не просто мягкому предложению)
// const leadCaptureActions = (leadActions || []).filter((a) =>
//   ["start_capture", "ask_next_question", "finish_capture"].includes(a.type)
// );
const leadFlowActions = (leadActions || []).filter((a) =>
  ["start_capture", "ask_next_question", "finish_capture", "suppress"].includes(a.type)
);

// есть ли сейчас «жёсткий» лид-флоу (форма) для этой реплики
  const hasLeadFlow =
  leadEnabled && !leadSuppressedBefore && hasLeadActions(leadFlowActions);

    // ====== logUserMessage ======
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

    // ====== Lead capture short-circuit ======
if (hasLeadFlow) {
  const leadMessages = await processLeadActions({
    // передаём ВСЕ действия этого шага:
    // start_capture / ask_next_question / finish_capture
    // (show_soft_prompt сюда никогда не попадёт)
    actions: leadActions,
    leadCfg,
    leadState,
    lang,
    siteId,
    sessionId,
    visitorId,
    clientId,
  });

  const leadReply =
    combineReplies("", leadMessages) || leadCopy(lang).askFallback;

  phase = "lead-capture";
  res.setHeader("X-AIW-Phase", phase);
  setSourceHeaders(res, "lead-capture", []);

  if (leadEnabled && leadStateChanged) {
    await AiwSession.updateOne({ sessionId }, { $set: { leadState } });
  }

  await logAssistantMessage({
    siteId,
    sessionId,
    content: leadReply,
    latencyMs: Date.now() - started,
    clientId,
  });

  dbMark = "user:+ assistant:+";
  res.setHeader("X-AIW-DB", dbMark);

  const timings = T.get();
  const derived = {
    buildPromptDur: (timings.buildPrompt ?? 0) - (timings.prePrompt ?? 0),
    llmWait: (timings.afterLLM ?? 0) - (timings.beforeLLM ?? 0),
    ttfb: timings.firstByteToClient ?? undefined,
    firstChunk:
      (timings.firstChunkFlushed ?? 0) - (timings.firstByteToClient ?? 0),
  };
  res.setHeader(
    "X-AIW-Timing",
    JSON.stringify({ ...timing, ...timings, ...derived, total: timings.total })
  );

  // уважаем stream, как и раньше
  if (!stream) {
    setJSONHeaders(req, res);
    return sendJSON(req, res, {
      reply: leadReply,
      source: "lead-capture",
      citations: [],
    });
  } else {
    setSSEHeaders(req, res);
    res.write(": heartbeat\n\n");
    T.mark("firstByteToClient");

    const CH = 12; // длина одного «токена» для эффекта печати
    for (let i = 0; i < leadReply.length; i += CH) {
      const chunk = leadReply.slice(i, i + CH);
      res.write(`data:${sseEncode(chunk)}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    return res.end();
  }
}



// ====== RAG retrieve (HYBRID) ======
const retrieveRes = await T.wrap("retrieve", async () => {
  try {
    const r = await retrieveHybrid({
      clientId,
      siteId,
      query: ragQuery,      // уже переписанный через prepareQueryForRag
      intentTypes,          // ["contacts", "services", ...]
      k: Number(process.env.AIW_KCLIENT || 12),
    });

    if (r?.contexts?.length) {
      res.setHeader("X-AIW-Retrieve-Mode", "hybrid");
      return r;
    } else {
      res.setHeader("X-AIW-Retrieve-Mode", "hybrid-empty");
      return { contexts: [] };
    }
  } catch (e) {
    console.warn("[retrieveHybrid]", e?.message || e);
    res.setHeader("X-AIW-Retrieve-Mode", "hybrid-error");
    return { contexts: [] };
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
  let usageInput  = null;
let usageOutput = null;
let usageTotal  = null;

  if (oai) {
    // cfg вы уже получаете раньше через getWidgetConfigCached({ clientId })
const sys = pickSystemPrompt(cfg, lang);

// берём хвост диалога для LLM (user + assistant)
const dialogTail = safeMsgs
  .filter(m => m.role === "user" || m.role === "assistant")
  .slice(-MAX_HISTORY_FOR_LLM);

// гарантируем, что последний месседж – актуальный вопрос пользователя
const lastIsUser = dialogTail.length && dialogTail[dialogTail.length - 1].role === "user";
let messagesForLLM = [
  { role: "system", content: sys },
  ...dialogTail,
];

if (!lastIsUser || (dialogTail[dialogTail.length - 1].content || "").trim() !== llmQuery.trim()) {
  messagesForLLM.push({ role: "user", content: llmQuery });
}


try {
const r = await oai.chat.completions.create({
  model: MODEL,
  messages: messagesForLLM,
  ...COMPLETION_OPTS,
});

  // ЛОГИ ТОКЕНОВ
 if (r.usage) {
    usageInput  = r.usage.prompt_tokens     ?? r.usage.input_tokens;
    usageOutput = r.usage.completion_tokens ?? r.usage.output_tokens;
    usageTotal  = r.usage.total_tokens;

    console.log("[AIW][tokens][no-context]", {
      model: MODEL,
      input:  usageInput,
      output: usageOutput,
      total:  usageTotal,
    });
  }

  reply = (r.choices?.[0]?.message?.content || "").trim();
  if (!reply) reply = defaultNoContextReply(lang, cfg);
} catch (e) {
  console.error("[AIW] no-context LLM error:", e?.message || e);
  reply = defaultNoContextReply(lang, cfg);
}
  } else {
    reply = lang.startsWith("ru") ? "Демо-ответ (нет OPENAI_API_KEY)." : "Demo reply (no OPENAI_API_KEY).";
  }

  if (leadEnabled && !leadSuppressed) {
  const intent = await detectLeadIntent({ oai, messages: safeMsgs.slice(-8), lang });
  const llmSm = leadStateMachine({
    leadState,
    leadCfg,
    event: { type: "llm_signal", leadIntent: intent.leadIntent, confidence: intent.confidence },
  });
  leadState = llmSm.nextState;
  leadActions.push(...llmSm.actions);
  leadStateChanged = true;

  if (hasLeadActions(leadActions)) {
    const leadMessages = await processLeadActions({
      actions: leadActions,
      leadCfg,
      leadState,
      lang,
      siteId,
      sessionId,
      visitorId,
      clientId,
    });

    reply = combineReplies(reply, leadMessages);
  }
}
if (leadEnabled && leadStateChanged) {
  await AiwSession.updateOne(
    { sessionId },
    { $set: { leadState } }
  );
}

const costUsd = estimateCostUsd(MODEL, usageInput, usageOutput);

await logAssistantMessage({
  siteId,
  sessionId,
  content: reply,
  latencyMs: Date.now() - started,
  clientId,
  tokensInput:  usageInput,
  tokensOutput: usageOutput,
  tokensTotal:  usageTotal,
  costUsd,
});

 
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
    res.write(`data:${sseEncode(reply)}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }
}

    // ====== Полноценный RAG через LLM ======
    const citations = contexts.map((c, i) => ({ idx: i + 1, url: c.url }));
    T.mark("prePrompt");
    // const prompt = buildPrompt({ query, contexts, lang });
    let prompt = buildPrompt({ query: llmQuery, contexts, lang });

// если есть кастомный системный промпт — добавим его первым сообщением

  const sys = pickSystemPrompt(cfg, lang);
  // если buildPrompt где-то добавляет свой system — наш будет иметь приоритет
  prompt = [{ role: "system", content: sys }, ...prompt.filter(m => m.role !== "system")];
// ---- ДОБАВЛЯЕМ ИСТОРИЮ ДИАЛОГА ДЛЯ LLM ----

// хвост диалога (user + assistant)
const dialogTail = safeMsgs
  .filter(m => m.role === "user" || m.role === "assistant")
  .slice(-MAX_HISTORY_FOR_LLM);

// чтобы не дублировать последний вопрос пользователя (из dialogTail)
// и тот, который buildPrompt уже включил в свой user-message,
// можно убрать из хвоста последний user с тем же текстом:
const lastUserContent = (lastUser?.content || "").trim();

const dialogWithoutLastUser = dialogTail.filter(m =>
  !(m.role === "user" && m.content.trim() === lastUserContent)
);

// сейчас prompt = [ system, ...rest ]
const [systemMsg, ...restPrompt] = prompt;

// окончательный промпт:
prompt = [
  systemMsg,
  ...dialogWithoutLastUser,
  ...restPrompt,
];

    T.mark("buildPrompt"); // длительность = (buildPrompt - prePrompt)

    // 🔍 DEBUG: смотрим, что реально уходит в OpenAI (RAG-ветка)
console.log(
  "[AIW][debug] promptForLLM",
  prompt.map((m, i) => ({
    i,
    role: m.role,
    len: m.content.length,
    // preview: m.content.slice(0, 120),
        preview: m.content,
  }))
);

if (stream) {
  // ---- STREAM (SSE) ----
  phase = "rag";
  res.setHeader("X-AIW-Phase", phase);
  setSourceHeaders(res, "rag", citations);

  // ✅ ставим флаг качества ДО начала SSE
  const quick = quickFlag({ phase, contexts, reply: "" });
  res.setHeader("X-AIW-Good-Answer", String(quick.goodAnswer));

  // только после этого открываем SSE-поток
  setSSEHeaders(req, res);
  res.write(": heartbeat\n\n");
  T.mark("firstByteToClient");

      let clientClosed = false;
      req.on("close", () => { clientClosed = true; });
      req.on("aborted", () => { clientClosed = true; });

      let buffer = "";
            let usage = null; // 
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

      // 🔥 СТРИМ ИЗ OPENAI
const completion = await oai.chat.completions.create({
  model: MODEL,
  messages: prompt,
  stream: true,
  stream_options: { include_usage: true },
  ...COMPLETION_OPTS,
});


      let firstChunkSent = false;



for await (const chunk of completion) {
  // 👇 если в чанке есть usage — сохраняем
  if (chunk.usage) {
    usage = {
      input:  chunk.usage.prompt_tokens ?? chunk.usage.input_tokens,
      output: chunk.usage.completion_tokens ?? chunk.usage.output_tokens,
      total:  chunk.usage.total_tokens,
    };
  }

  const piece = chunk.choices?.[0]?.delta?.content || "";
  if (!piece) continue;

  buffer += piece;

  if (!clientClosed) {
    res.write(`data:${sseEncode(piece)}\n\n`);

    if (!firstChunkSent) {
      firstChunkSent = true;
      T.mark("firstChunkFlushed");
    }
  }
}

T.mark("afterLLM");

// 👇 Логируем токены после завершения стрима
if (usage) {
  console.log("[AIW][tokens][rag-stream]", {
    model: MODEL,
    ...usage,
  });
}
        } catch (e) {
          const msg = `⚠️ ${e?.message || "LLM error"}`;
          buffer = msg;
            if (!clientClosed) res.write(`data:${sseEncode(msg)}\n\n`);
        }
      }

      // лог ассистента и финальные заголовки
      let tokensInput  = usage?.input  ?? null;
let tokensOutput = usage?.output ?? null;
let tokensTotal  = usage?.total  ?? null;
const costUsd    = estimateCostUsd(MODEL, tokensInput, tokensOutput);




 // 🔥 LEAD: llm_signal + обработка действий прямо в SSE-ветке
  let extraLeadMessages = [];
  if (leadEnabled && !leadSuppressed) {
    try {
      const intent = await detectLeadIntent({
        oai,
        messages: safeMsgs.slice(-8),
        lang,
      });

      const llmSm = leadStateMachine({
        leadState,
        leadCfg,
        event: {
          type: "llm_signal",
          leadIntent: intent.leadIntent,
          confidence: intent.confidence,
        },
      });

      leadState = llmSm.nextState;
      leadActions.push(...llmSm.actions);
      leadStateChanged = true;

      if (hasLeadActions(leadActions)) {
        extraLeadMessages = await processLeadActions({
          actions: leadActions,
          leadCfg,
          leadState,
          lang,
          siteId,
          sessionId,
          visitorId,
          clientId,
        });

        const extraText =
          combineReplies("", extraLeadMessages) || leadCopy(lang).askFallback;

        // добавим лид-хвост к ответу (для логов)
        buffer = combineReplies(buffer, extraLeadMessages);

        // и досольём его в SSE как отдельный chunk
        if (!clientClosed && extraText) {
          res.write(`data:${sseEncode("\n\n" + extraText)}\n\n`);
        }
      }

      if (leadEnabled && leadStateChanged) {
        await AiwSession.updateOne(
          { sessionId },
          { $set: { leadState } }
        );
      }
    } catch (e) {
      console.error("[AIW][lead][stream] error:", e?.message || e);
    }
  }

await logAssistantMessage({
  siteId,
  sessionId,
  content: buffer,
  latencyMs: Date.now() - started,
  clientId,
  tokensInput,
  tokensOutput,
  tokensTotal,
  costUsd,
});

      T.mark("logAssistantMessage");
      dbMark = "user:+ assistant:+";
      const timings = T.get();
// добавим производные: buildPromptDur, llmWait, ttfb (time-to-first-byte), firstChunk
const derived = {
  buildPromptDur: (timings.buildPrompt ?? 0) - (timings.prePrompt ?? 0),
  llmWait: (timings.afterLLM ?? 0) - (timings.beforeLLM ?? 0),
  ttfb: timings.firstByteToClient ?? undefined,
  firstChunk: (timings.firstChunkFlushed ?? 0) - (timings.firstByteToClient ?? 0),
};


      // ⚠️ ВАЖНО: заголовки ставим только если они ещё не отправлены
      if (!res.headersSent) {
        res.setHeader("X-AIW-DB", dbMark);
        res.setHeader("X-AIW-Timing", JSON.stringify({
          ...timing,
          ...timings,
          ...derived,
          total: timings.total
        }));
      }


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
let usageInput  = null;
let usageOutput = null;
let usageTotal  = null;

if (oai) {
const completion = await oai.chat.completions.create({
  model: MODEL,
  messages: prompt,
  ...COMPLETION_OPTS,
});

  // ЛОГИ ТОКЕНОВ
 if (completion.usage) {
    usageInput  = completion.usage.prompt_tokens     ?? completion.usage.input_tokens;
    usageOutput = completion.usage.completion_tokens ?? completion.usage.output_tokens;
    usageTotal  = completion.usage.total_tokens;

    console.log("[AIW][tokens][rag-json]", {
      model: MODEL,
      input:  usageInput,
      output: usageOutput,
      total:  usageTotal,
    });
  }

  reply = completion.choices?.[0]?.message?.content?.trim() || reply;
}
T.mark("afterLLM");
timing.llm = T.get().afterLLM - T.get().beforeLLM;

if (leadEnabled && !leadSuppressed) {
  const intent = await detectLeadIntent({ oai, messages: safeMsgs.slice(-8), lang });
  const llmSm = leadStateMachine({
    leadState,
    leadCfg,
    event: { type: "llm_signal", leadIntent: intent.leadIntent, confidence: intent.confidence },
  });
  leadState = llmSm.nextState;
  leadActions.push(...llmSm.actions);
  leadStateChanged = true;

  if (hasLeadActions(leadActions)) {
    const leadMessages = await processLeadActions({
      actions: leadActions,
      leadCfg,
      leadState,
      lang,
      siteId,
      sessionId,
      visitorId,
      clientId,
    });

    reply = combineReplies(reply, leadMessages);
  }
}


const costUsd = estimateCostUsd(MODEL, usageInput, usageOutput);

await logAssistantMessage({
  siteId,
  sessionId,
  content: reply,
  latencyMs: Date.now() - started,
  clientId,
  tokensInput:  usageInput,
  tokensOutput: usageOutput,
  tokensTotal:  usageTotal,
  costUsd,
});

  if (leadEnabled && leadStateChanged) {
        await AiwSession.updateOne({ sessionId }, { $set: { leadState } });
      }


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
    const alreadySent = res.headersSent;
    phase = "error";

    const timings = T.get();
    const derived = {
      buildPromptDur: (timings.buildPrompt ?? 0) - (timings.prePrompt ?? 0),
      llmWait: (timings.afterLLM ?? 0) - (timings.beforeLLM ?? 0),
      ttfb: timings.firstByteToClient ?? undefined,
      firstChunk: (timings.firstChunkFlushed ?? 0) - (timings.firstByteToClient ?? 0),
    };

    if (!alreadySent) {
      // заголовки ещё НЕ отправлены → можно безопасно их ставить и вернуть JSON
      res.setHeader("X-AIW-Phase", phase);
      res.setHeader("X-AIW-DB", dbMark);
      res.setHeader("X-AIW-Timing", JSON.stringify({
        ...timing,
        ...timings,
        ...derived,
        total: timings.total
      }));

      console.log("[AIW][timings]", JSON.stringify({
        siteId, sessionId, phase,
        timings: { ...timings, ...derived }
      }));
      console.error("AIW /chat error:", e);

      return res.status(500).json({ ok: false, error: String(e) });
    }

    // сюда попадаем, если уже начался SSE-стрим (мы уже делали setSSEHeaders + write)
    console.error("AIW /chat error after headers sent:", e);

    try {
     res.write(`data:⚠️ Internal error\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } catch {
      // тут уже вообще ничего не делаем
    }
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
    res.write(`data:tick ${i}\n\n`);
    if (i >= 5) {
      clearInterval(timer);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }, 500);
});


export default router;
