// api/widget/widget.js
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
import { buildPrompt } from '../../services/rag/buildPrompt.js';
import fs from "fs";
import path from "path";

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

function logLLMMessages(tag, msgs = []) {
  try {
    const view = (msgs || []).map((m, i) => {
      const c = String(m?.content ?? "");
      const hasQ = /(^|\n)\s*Question\s*:/i.test(c);
      const hasCtx = /(^|\n)\s*Context\s*:/i.test(c);
      const ctxMarks = (c.match(/\[#\d+\]/g) || []).length;

      return {
        i,
        role: m?.role,
        len: c.length,
        head: c.slice(0, 160).replace(/\n/g, "\\n"),
        tail: c.slice(-160).replace(/\n/g, "\\n"),
        hasQuestionLabel: hasQ,
        hasContextLabel: hasCtx,
        ctxMarks,
      };
    });

    const last = view[view.length - 1];
    console.log(`[AIW][LLM][${tag}] messages=${view.length}`);
    console.table(view);

    if (last) {
      console.log(`[AIW][LLM][${tag}] LAST role=${last.role} len=${last.len} hasQuestionLabel=${last.hasQuestionLabel} hasContextLabel=${last.hasContextLabel} ctxMarks=${last.ctxMarks}`);
    }
  } catch (e) {
    console.error("[AIW][LLM] logLLMMessages error:", e?.message || e);
  }
}

function normalizeLang(code, fallback = "en") {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return fallback;
  // берём только "en" из "en-US"
  const short = c.split(/[-_]/)[0];
  return short || fallback;
}

function hasLettersOfLang(text = "", lang = "") {
  const t = String(text || "");
  const l = normalizeLang(lang || "", "");
  if (!t || !l) return false;

  // минимально полезные группы (можно расширять)
  if (l === "ru" || l === "uk") return /[а-яёіїєґ]/i.test(t);
  if (l === "ar") return /[\u0600-\u06FF]/.test(t);
  if (l === "he") return /[\u0590-\u05FF]/.test(t);
  if (l === "zh" || l === "ja" || l === "ko") return /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(t);

  // латиница для большинства европейских языков
  return /[a-z]/i.test(t);
}

function isPhoneLikeAnswer(s = "") {
  const t = String(s || "").trim();

  // Разрешаем: +, цифры, пробелы, (), -, .
  // Минимальная длина, чтобы не спутать с "1" / "10"
  if (t.length < 7 || t.length > 32) return false;

  // Только допустимые символы
  if (!/^[+\d\s().\-]+$/.test(t)) return false;

  // Должно быть достаточно цифр (иначе "(---)" пройдет)
  const digits = (t.match(/\d/g) || []).length;
  if (digits < 7) return false;

  return true;
}

function isShortEntityList(s = "") {
  const t = String(s || "").trim();
  if (!t) return false;
  if (t.length > 40) return false;

  // разрешим разделители списков
  const parts = t.split(/[,\u2022/|&+]+/).map(x => x.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false; // 2..4 пункта

  // каждый пункт — 1–2 слова, без “длинных фраз”
return parts.every(p => {
  const w = p.split(/\s+/).filter(Boolean);
  if (w.length > 2 || p.length > 20) return false;
  return /[\p{L}]/u.test(p); // есть буквы
});
}

function looksLikeEntityAnswer(q = "") {
  const s = String(q || "").trim();
  if (!s) return false;

  if (isPhoneLikeAnswer(s)) return true;
  if (isShortEntityList(s)) return true;

  // допускаем пробелы (до 2 слов), но запрещаем “нормальные” фразы с пунктуацией
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 2) return false;

  // типичные "значения": youtube, instagram ads, info@x.com, +1-555..., 10ml, ISO-9001
  const okChars = /^[\p{L}\p{N}\s@._+#\-\/(),&]+$/u.test(s);
  if (!okChars) return false;

  // если слишком длинно — скорее всего это уже фраза
  if (s.length > 24) return false;

  return true;
}

/**
 * True => НЕ переключаем язык (ни this turn, ни persist).
 * Логика: если detectedNow != currentReplyLang,
 * но user ответил очень коротко и похоже на "значение",
 * и предыдущий ассистент явно писал на currentReplyLang.
 */
function shouldSuppressLangSwitchOnShortAnswer({
  rawQuery,
  currentReplyLang,
  detectedNow,
  lastAssistant,
}) {
  const q = String(rawQuery || "").trim();
  if (!q) return false;

  const cur = normalizeLang(currentReplyLang || "", "");
  const det = normalizeLang(detectedNow || "", cur || det);

  if (!cur || !det) return false;
  if (cur === det) return false;

  // короткий entity-like ответ?
  if (!looksLikeEntityAnswer(q)) return false;

  // предыдущий ассистент писал на текущем языке? (приблизительная проверка)
  const prev = String(lastAssistant?.content || "");
  if (!prev) return false;

  // если в предыдущем сообщении нет явных признаков текущего языка — не рискуем
  if (!hasLettersOfLang(prev, cur)) return false;

  return true;
}

function langName(code = "en") {
  const c = normalizeLang(code, "en");
  const map = {
    en: "English",
    ru: "Russian",
    uk: "Ukrainian",
    de: "German",
    fr: "French",
    es: "Spanish",
    it: "Italian",
    pl: "Polish",
    pt: "Portuguese",
    tr: "Turkish",
    ar: "Arabic",
    hi: "Hindi",
    zh: "Chinese",
    ja: "Japanese",
    ko: "Korean",
  };
  return map[c] || c.toUpperCase();
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
resolvedAt: null,
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
          replyLang: lang || "ru",
langStreak: 0,
lastDetectedLang: lang || "ru",
replyLangUpdatedAt: now,
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

function pickSystemPrompt(cfg, lang = "ru", complex = null) {
  const fromDb = (cfg?.customSystemPrompt || "").trim();
  const base = fromDb || (lang.startsWith("ru") ? DEFAULT_SYS_RU : DEFAULT_SYS_EN);
  let complexBlock = "";

  const LN = langName(lang);
const langHeader =
`IMPORTANT: You MUST answer ONLY in ${LN}.
- Always respond in the same language as the user's last message.
- Do not switch languages.`;


  if (complex?.isComplex) {
    const types = Array.isArray(complex.taskTypes) ? complex.taskTypes : [];

    const lines = [
      "ADDITIONAL RULES FOR COMPLEX QUERIES:",
      "- Assume the question requires careful multi-step reasoning.",
      "- Use only facts and numbers from the provided context. If something is missing, explicitly state what information is missing.",
      "- If you need to make estimates or assumptions, clearly mark them as approximate and do not present them as hard facts.",
    ];

    if (types.includes("numeric_reasoning")) {
      lines.push(
        "- For numeric / budget questions (e.g. whether a budget is enough), first reason about the steps internally, then output a concise answer with a short explanation. Do NOT invent precise numbers that are not in the context."
      );
    }
    if (types.includes("planning")) {
      lines.push(
        "- For planning tasks, structure the answer into clear steps/phases, timelines and priorities. Keep the answer practical and grounded in the context."
      );
    }
    if (types.includes("comparison")) {
      lines.push(
        "- For comparison tasks, describe key pros/cons and the conditions under which each option is better, grounding your answer in the context."
      );
    }
    if (types.includes("multi_step")) {
      lines.push(
        "- For multi-step problems, break the problem down internally but output only a concise, well-structured conclusion (no detailed chain-of-thought)."
      );
    }

    complexBlock = "\n\n" + lines.join("\n");
  }

  return `${langHeader}\n\n${base}${complexBlock}`;
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
    let siteId = "unknown-site";
      let sessionId = "unknown-session";
  let visitorId = null;


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
         "X-AIW-Reply-Lang",
"X-AIW-Detected-Lang",
"X-AIW-Lang-Reason",        
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

({ siteId, sessionId, visitorId } = resolveIds(req, meta));

const lastUserMsg = [...safeMsgs].reverse().find(m => m.role === "user") || null;
const rawQueryEarly = (lastUserMsg?.content || "").trim();
const langEarly = detectLangFromText(rawQueryEarly, meta.lang || "ru");


const clientId = await resolveClientIdStrict(req, meta, siteId);
if (clientId) res.setHeader("X-AIW-Client", String(clientId));
const cfg = await getWidgetConfigCached({ clientId, siteId });
const leadCfg = cfg?.leadCapture || {};
// const leadEnabled = Boolean(leadCfg?.enabled);
const leadEnabled = false; // временно отключаем лиды в RAG-ассистенте

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

// (TEMP) intent/followup/query vars будут выставлены после prepareQueryForRag (pq)
let intentTypes = [];
let intentLabel = null;

let query = "";
let ragQuery = "";
let llmQuery = "";

let isFollowUp = false;

const metaAll = {
  siteId,
  sessionId,
  visitorId,
  clientId,    
  pageUrl: meta.pageUrl || meta.referrer || req.headers.referer || null,
  referrer: meta.referrer || null,
  utm: meta.utm || {},
  tz: meta.tz || null,
 lang: langEarly,
};

    // ====== ensureSession ======
    const tEnsure = Date.now();
    await ensureSession(metaAll, req);
// ====== replyLang resolve (NEW) ======
timing.ensure = Date.now() - tEnsure;
T.mark("ensureSession");

// читаем сессию (после ensure)
const sessionDoc = await AiwSession.findOne({ sessionId })
  .select("replyLang langStreak lastDetectedLang lang replyLangUpdatedAt")
  .lean();

const uiLang = normalizeLang(meta.lang || sessionDoc?.lang || langEarly || "ru");
const currentReplyLang = normalizeLang(sessionDoc?.replyLang || uiLang || "ru");

// ====== prepareQueryForRag (ВАЖНО: раньше intent/followup и раньше replyLang hysteresis) ======
const pq = await prepareQueryForRag({
  messages: safeMsgs,
  metaLang: uiLang,
  currentReplyLang,
  oai,
  rewriteModel: "gpt-4o-mini",
  maxHistory: MAX_HISTORY_FOR_LLM,
});


const {
  rawQuery,
  ragQuery: initialRagQuery,
  llmQuery: initialLlmQuery,
  lang,
  detectedUserLang,
  langConfidence,
  requestedReplyLang,
  lastUser,
  lastAssistant,
  complex,
  shouldSwitchLang,
  switchToLang,
  switchConfidence,
  switchEvidence,
  switchReason,
} = pq;

// выставляем query/ragQuery/llmQuery (теперь они точно есть)
query = rawQuery;
ragQuery = initialRagQuery;
llmQuery = initialLlmQuery;

// intent теперь можно считать безопасно
({ intentTypes, intentLabel } = classifyRagIntent(rawQuery, lang));
if (intentLabel) res.setHeader("X-AIW-Intent", intentLabel);

// follow-up теперь можно считать безопасно
isFollowUp = !!lastAssistant && (
  isShortConfirmation(rawQuery) || isExampleFollowup(rawQuery)
);

console.log("[AIW][followup]", {
  rawQuery,
  lastAssistant: !!lastAssistant,
  isShortConfirmation: isShortConfirmation(rawQuery),
  isExampleFollowup: isExampleFollowup(rawQuery),
  isFollowUp
});

// judge объект (у тебя дальше используется)
const judge = shouldSwitchLang
  ? {
      shouldSwitch: true,
      replyLang: normalizeLang(
        switchToLang || detectedUserLang || currentReplyLang,
        currentReplyLang
      ),
      confidence: Number(switchConfidence ?? 0),
      reason: switchReason || "switch",
      evidence: switchEvidence || "",
    }
  : { shouldSwitch: false, replyLang: currentReplyLang, confidence: 0, reason: "no-switch", evidence: "" };

// ====== replyLang logic (anti short-switch, any language) ======
const detectedNow0 = normalizeLang(detectedUserLang || uiLang, uiLang);

let replyLangThisTurn = detectedNow0;
let persistReplyLang  = detectedNow0;

let langReasonFinal = "detected";

// ✅ универсально: короткие “значения” не должны переключать язык диалога
if (shouldSuppressLangSwitchOnShortAnswer({
  rawQuery,
  currentReplyLang,
  detectedNow: detectedNow0,
  lastAssistant,
})) {
  replyLangThisTurn = currentReplyLang;
  persistReplyLang  = currentReplyLang;
  langReasonFinal   = "short_entity_followup";
}

res.setHeader("X-AIW-Reply-Lang", replyLangThisTurn);
res.setHeader("X-AIW-Persist-Reply-Lang", persistReplyLang);
res.setHeader("X-AIW-Detected-Lang", detectedNow0);
res.setHeader("X-AIW-Lang-Reason", langReasonFinal);
res.setHeader("X-AIW-Soft-Override", String(langReasonFinal !== "detected"));

// persist
await AiwSession.updateOne(
  { sessionId },
  {
    $set: {
      replyLang: persistReplyLang,
      lastDetectedLang: detectedNow0,
      langStreak: 0,
      replyLangUpdatedAt: new Date(),
    },
  }
);

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
          reply: replyLangThisTurn.startsWith("ru") ? "Пустой вопрос" : "Empty question",
          source: "empty",
          citations: []
        });
      } else {
        setSSEHeaders(req, res);
        res.write(`data:${sseEncode(replyLangThisTurn.startsWith("ru") ? "Пустой вопрос" : "Empty question")}\n\n`);
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
    lang: replyLangThisTurn,
    siteId,
    sessionId,
    visitorId,
    clientId,
  });

const leadReply =
  combineReplies("", leadMessages) || leadCopy(replyLangThisTurn).askFallback;


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
let retrieveRes = { contexts: [] };

retrieveRes = await T.wrap("retrieve", async () => {
  try {
    const kDefault = Number(process.env.AIW_KCLIENT || 12);
    const kFollow  = Number(process.env.AIW_KCLIENT_FOLLOWUP || 8);

    const k = isFollowUp ? kFollow : kDefault;

    const r = await retrieveHybrid({
      clientId,
      siteId,
      query: ragQuery,      
      intentTypes,
      k,
    });

    console.log("[RAG][retrieve] q=", ragQuery);
    console.log("[RAG][retrieve] got=", r?.contexts?.length || 0);

    const modeBase = isFollowUp ? "hybrid-followup" : "hybrid";
    res.setHeader(
      "X-AIW-Retrieve-Mode",
      r?.contexts?.length ? modeBase : `${modeBase}-empty`
    );

    return r || { contexts: [] };
  } catch (e) {
    console.warn("[retrieveHybrid]", e?.message || e);
    res.setHeader("X-AIW-Retrieve-Mode", isFollowUp ? "hybrid-followup-error" : "hybrid-error");
    return { contexts: [] };
  }
});

const contexts = retrieveRes.contexts || [];

res.setHeader("X-AIW-Contexts", String(contexts.length));
console.log("[AIW] contexts:", contexts.length);
timing.retrieve = T.get().retrieve;


// ====== Нет контекста ======
if (!contexts.length) {
  phase = "no-context";
  res.setHeader("X-AIW-Phase", phase);
  setSourceHeaders(res, "no-context-llm", []);

  let reply = "";
  let usageInput  = null;
  let usageOutput = null;
  let usageTotal  = null;

  const sys = pickSystemPrompt(cfg, replyLangThisTurn, complex);

  // хвост диалога
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

  logLLMMessages("no-context", messagesForLLM);

  console.log("[AIW][no-context] rawQuery:", rawQuery);
  console.log("[AIW][no-context] llmQuery(head):", llmQuery.slice(0, 200).replace(/\n/g, "\\n"));

const quickNoCtx = quickFlag({ phase, contexts: [], reply: "" });
res.setHeader("X-AIW-Good-Answer", String(quickNoCtx.goodAnswer));

  // ====== STREAM MODE ======
  if (stream) {
    setSSEHeaders(req, res);
    res.write(": heartbeat\n\n");
    T.mark("firstByteToClient");

    let clientClosed = false;
    req.on("close", () => { clientClosed = true; });
    req.on("aborted", () => { clientClosed = true; });

    let buffer = "";
    let usage = null;

    if (!oai) {
      const demo = replyLangThisTurn.startsWith("ru")
        ? "Демо-ответ (нет OPENAI_API_KEY)."
        : "Demo reply (no OPENAI_API_KEY).";

      buffer = demo;
      const CH = 24;
      for (let i = 0; i < demo.length && !clientClosed; i += CH) {
        res.write(`data:${sseEncode(demo.slice(i, i + CH))}\n\n`);
      }
    } else {
      try {
        T.mark("beforeLLM");

        const completion = await oai.chat.completions.create({
          model: MODEL,
          messages: messagesForLLM,
          stream: true,
          stream_options: { include_usage: true },
          ...COMPLETION_OPTS,
        });

        let firstChunkSent = false;

        for await (const chunk of completion) {
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

        if (usage) {
          console.log("[AIW][tokens][no-context-stream]", { model: MODEL, ...usage });
        }
      } catch (e) {
        const msg = `⚠️ ${e?.message || "LLM error"}`;
        buffer = msg;
        if (!clientClosed) res.write(`data:${sseEncode(msg)}\n\n`);
      }
    }

    // финальный текст
    reply = (buffer || "").trim();
    if (!reply) reply = defaultNoContextReply(replyLangThisTurn, cfg);

    // usage → отдельные переменные
    usageInput  = usage?.input  ?? null;
    usageOutput = usage?.output ?? null;
    usageTotal  = usage?.total  ?? null;

    const costUsd = estimateCostUsd(MODEL, usageInput, usageOutput);

    await logAssistantMessage({
      siteId,
      sessionId,
      content: reply,
      latencyMs: Date.now() - started,
      clientId,
      tokensInput: usageInput,
      tokensOutput: usageOutput,
      tokensTotal: usageTotal,
      costUsd,
    });

    // deferred judge + gap (как у тебя было)
    defer(async () => {
      const judge = await assessGoodAnswer({
        oai, model: "gpt-5-nano",
        question: query, reply, contexts: [], lang
      });
      const THRESH = Number(process.env.AIW_JUDGE_THRESHOLD || 0.60);
      const hasSupport = false;

      const ans = reply || "";
      const explicitNoInfo = EXPLICIT_NOINFO_RE.test(ans);
      const finalBad =
        explicitNoInfo ||
        (judge?.goodAnswer === false) ||
        (!hasSupport && (judge?.confidence ?? 0) < THRESH);

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

    if (!clientClosed) {
      res.write("data: [DONE]\n\n");
      return res.end();
    }
    return; // если клиент закрыл — просто выходим
  }

  // ====== JSON MODE (как было) ======
  // (оставляем не-stream completion)
  if (oai) {
    try {
      const r = await oai.chat.completions.create({
        model: MODEL,
        messages: messagesForLLM,
        ...COMPLETION_OPTS,
      });

      if (r.usage) {
        usageInput  = r.usage.prompt_tokens     ?? r.usage.input_tokens;
        usageOutput = r.usage.completion_tokens ?? r.usage.output_tokens;
        usageTotal  = r.usage.total_tokens;

        console.log("[AIW][tokens][no-context-json]", {
          model: MODEL,
          input: usageInput,
          output: usageOutput,
          total: usageTotal,
        });
      }

      reply = (r.choices?.[0]?.message?.content || "").trim();
      if (!reply) reply = defaultNoContextReply(replyLangThisTurn, cfg);
    } catch (e) {
      console.error("[AIW] no-context LLM error:", e?.message || e);
      reply = defaultNoContextReply(replyLangThisTurn, cfg);
    }
  } else {
    reply = replyLangThisTurn.startsWith("ru")
      ? "Демо-ответ (нет OPENAI_API_KEY)."
      : "Demo reply (no OPENAI_API_KEY).";
  }

  const costUsd = estimateCostUsd(MODEL, usageInput, usageOutput);

  await logAssistantMessage({
    siteId,
    sessionId,
    content: reply,
    latencyMs: Date.now() - started,
    clientId,
    tokensInput: usageInput,
    tokensOutput: usageOutput,
    tokensTotal: usageTotal,
    costUsd,
  });

  const quick = quickFlag({ phase, contexts: [], reply });
  res.setHeader("X-AIW-Good-Answer", String(quick.goodAnswer));

  setJSONHeaders(req, res);
  return sendJSON(req, res, {
    reply,
    source: "no-context-llm",
    citations: [],
    goodAnswer: quick.goodAnswer,
    confidence: quick.confidence,
  });
}


    // ====== Полноценный RAG через LLM ======
    const citations = contexts.map((c, i) => ({ idx: i + 1, url: c.url }));
    T.mark("prePrompt");
// let prompt = buildPrompt({ query: llmQuery, contexts, lang: replyLangThisTurn, complex });

// если есть кастомный системный промпт — добавим его первым сообщением
const sys = pickSystemPrompt(cfg, replyLangThisTurn, complex);

const prompt = buildPrompt({
  system: sys,
  history: safeMsgs,                
  query: llmQuery,
  contexts,
  maxHistory: MAX_HISTORY_FOR_LLM,
  complex,
});
T.mark("buildPrompt");

// ====== prompt dump (debug only) ======
if (process.env.AIW_DEBUG_PROMPT === "1") {
  try {
    const dumpDir = path.join(process.cwd(), ".aiw_debug");
    fs.mkdirSync(dumpDir, { recursive: true });

    const dumpPath = path.join(dumpDir, `llm_prompt_dump_${Date.now()}.json`);
    fs.writeFileSync(dumpPath, JSON.stringify(prompt, null, 2), "utf8");
    console.log("[AIW] prompt dumped to:", dumpPath);
  } catch (e) {
    console.warn("[AIW] prompt dump failed:", e?.message || e);
  }
}

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
        const demo = replyLangThisTurn.startsWith("ru") ? "Демо-ответ (нет OPENAI_API_KEY)." : "Demo reply (no OPENAI_API_KEY).";
        buffer = demo;
        const CH = 24;
        for (let i = 0; i < demo.length && !clientClosed; i += CH) {
          res.write(`data:${sseEncode(demo.slice(i, i + CH))}\n\n`);
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
        lang: replyLangThisTurn,
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
          lang: replyLangThisTurn,
          siteId,
          sessionId,
          visitorId,
          clientId,
        });

const extraText =
  combineReplies("", extraLeadMessages) || leadCopy(replyLangThisTurn).askFallback;

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
    lang: replyLangThisTurn,
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

let reply = replyLangThisTurn.startsWith("ru") ? "Демо-ответ (нет OPENAI_API_KEY)." : "Demo reply (no OPENAI_API_KEY).";
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
      lang: replyLangThisTurn,
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
    lang: replyLangThisTurn,
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
