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
import { retrieveHybrid } from '../../services/rag/retrieveHybrid.js';
import { classifyRagIntent } from "../../services/rag/intent.js";
import {
  prepareQueryForRag,
  detectLangFromText,        
} from "../../services/rag/queryRewrite.js";
import { buildPrompt } from '../../services/rag/buildPrompt.js';
import fs from "fs";
import path from "path";

const router = express.Router();

// === Judge helpers (NEW) ===
 
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

function deferTimed(T, label, promiseFactory) {
  // момент постановки в очередь — это важно видеть в X-AIW-Timing
  try { T?.mark?.(`${label}_enqueued_at_ms`); } catch {}

  const startedAt = Date.now();

  return defer(async () => {
    const s = Date.now();
    try {
      return await promiseFactory();
    } finally {
      const dur = Date.now() - s;
      const doneAt = Date.now() - startedAt; // чисто "внутри defer" (не от t0)
      try {
        // duration можно сохранить в таймер (но в headers уже может не попасть)
        T?.set?.(`${label}_dur_ms`, dur);
        T?.mark?.(`${label}_done_at_ms`);
      } catch {}
      console.log(`[AIW][perf][${label}] dur_ms=${dur} (defer_done_delta_ms=${doneAt})`);
    }
  });
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

  // "время от старта запроса"
  function mark(label) {
    marks[label] = Date.now() - t0;
  }

  // "прямо записать значение" (полезно для *_dur_ms)
  function set(label, value) {
    marks[label] = value;
  }

  // измерить duration (ms) выполнения async fn
  async function wrap(label, fn) {
    const s = Date.now();
    try {
      return await fn();
    } finally {
      marks[`${label}_dur_ms`] = Date.now() - s;
      // и момент окончания относительно старта
      marks[`${label}_done_at_ms`] = Date.now() - t0;
    }
  }

  function get() {
    return { ...marks, total: Date.now() - t0 };
  }

  req.__timer = { mark, set, wrap, get, t0 };
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

    if (last) {
      console.log(`[AIW][LLM][${tag}] LAST role=${last.role} len=${last.len} hasQuestionLabel=${last.hasQuestionLabel} hasContextLabel=${last.hasContextLabel} ctxMarks=${last.ctxMarks}`);
    }
  } catch (e) {
    console.error("[AIW][LLM] logLLMMessages error:", e?.message || e);
  }
}

// === AIW_META helpers (NEW) ===
const AIW_META_TAG = "[AIW_META]";

function logMetaPresence(tag, fullText) {
  try {
    const s = String(fullText || "");
    const hasTag = s.includes(AIW_META_TAG);
    const { meta } = extractAiwMeta(s);
    const metaParsed = !!meta;
    console.log(`[AIW][META][presence][${tag}] hasTag=${hasTag} metaParsed=${metaParsed} len=${s.length}`);
    return { hasTag, metaParsed, len: s.length };
  } catch (e) {
    console.log(`[AIW][META][presence][${tag}] ERROR`, e?.message || e);
    return { hasTag: false, metaParsed: false, len: 0 };
  }
}

// Minimal meta contract for NO-CONTEXT (keep it short, but include lead + gap fields)
const NOCTX_META_CONTRACT = [
  "OUTPUT FORMAT (MANDATORY):",
  "- First, write the normal user-facing answer.",
  "- Then, on the LAST line ONLY, output: [AIW_META]{...single-line JSON...}",
  '- JSON format: {"answerable":true|false,"support":"strong|weak|none","gap_reason":"...","used_context_ids":[],"confidence":0.0,"lead":{"contact":true|false,"email":"","phone":"","handle":"","name":"","confidence":0.0}}',
  "- LEAD: set lead.contact=true ONLY if the USER message contains contact details.",
  "- LEAD: lead.email/phone/handle/name MUST be exact substrings from the user's LAST message (otherwise empty).",
  "- Do NOT output [AIW_META] anywhere except the very last line."
].join("\n");

const CONTACT_META_CONTRACT = [
  "OUTPUT FORMAT (MANDATORY):",
  "- First, write the normal user-facing answer.",
  "- Then, on the LAST line ONLY, output: [AIW_META]{...single-line JSON...}",
  '- JSON format: {"answerable":true|false,"support":"strong|weak|none","gap_reason":"...","used_context_ids":[],"confidence":0.0,"lead":{"contact":true|false,"email":"","phone":"","handle":"","name":"","confidence":0.0}}',
  "",
  "CONTACT TURN:",
  "- The user is providing contact details. Thank them, confirm you'll pass it to the team, and optionally ask ONE short clarifying detail (goal/platform) only if helpful.",
  "- Keep it 2-4 sentences. No knowledge base talk.",
  "",
  "- LEAD: set lead.contact=true ONLY if the USER message contains contact details.",
  "- LEAD fields MUST be exact substrings of the user's LAST message.",
  "- Do NOT output [AIW_META] anywhere except the very last line.",
  "- If you do NOT output the [AIW_META] JSON line, your answer is invalid. Always output it."
].join("\n");

function extractAiwMeta(fullText = "") {
  const text = String(fullText || "");
  const tag = AIW_META_TAG || "[AIW_META]";

  // Берём ПОСЛЕДНИЙ тег, чтобы не словить случайное упоминание в тексте
  const tagIdx = text.lastIndexOf(tag);
  if (tagIdx === -1) return { answerText: text.trimEnd(), meta: null };

  // Пропускаем пробелы/переносы после тега
  let i = tagIdx + tag.length;
  while (i < text.length && /\s/.test(text[i])) i++;

  // Дальше должен начаться JSON-объект
  if (text[i] !== "{") return { answerText: text.trimEnd(), meta: null };

  // Ищем конец JSON по балансу фигурных скобок, учитываем строки и экранирование
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;

  for (let p = i; p < text.length; p++) {
    const ch = text[p];

    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = false; continue; }
      continue;
    }

    // вне строки
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { depth++; continue; }
    if (ch === "}") {
      depth--;
      if (depth === 0) { end = p; break; }
      continue;
    }
  }

  if (end === -1) return { answerText: text.trimEnd(), meta: null };

  const jsonStr = text.slice(i, end + 1);

  let meta = null;
  try {
    meta = JSON.parse(jsonStr);
  } catch {
    meta = null;
  }

  // Вырезаем только сам AIW_META-блок из ответа (а вдруг после него что-то ещё есть)
  const before = text.slice(0, tagIdx);
  const after = text.slice(end + 1);
  const answerText = (before + after).trimEnd();

  return { answerText, meta };
}

function normalizeLeadMeta(lead) {
  const l = (lead && typeof lead === "object") ? lead : {};
  const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
  const s = (v, n) => String(v || "").slice(0, n);

  return {
    contact: l.contact === true,
    email: s(l.email, 200),
    phone: s(l.phone, 80),
    handle: s(l.handle, 120),
    name: s(l.name, 120),
    confidence: clamp01(l.confidence),
  };
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== "object") return null;

  return {
    answerable: meta.answerable === true,
    support: String(meta.support || "none"),
    gap_reason: String(meta.gap_reason || "").slice(0, 300),
    used_context_ids: Array.isArray(meta.used_context_ids) ? meta.used_context_ids : [],
    confidence: Math.max(0, Math.min(1, Number(meta.confidence) || 0)),

    lead: normalizeLeadMeta(meta.lead),
  };
}

function extractLeadFromText(text = "") {
  const t = String(text || "");

  const emailMatch = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0] : "";

  const phoneMatch = t.match(/(?:\+?\d[\d\s().\-]{6,}\d)/);
  let phone = "";
  if (phoneMatch) {
    const candidate = phoneMatch[0];
    const digits = (candidate.match(/\d/g) || []).length;
    if (digits >= 7) phone = candidate;
  }

  const handleMatch =
    t.match(/(?:^|[\s(,[{])(@[A-Za-z0-9._-]{2,})/) ||
    t.match(/(?:t\.me|telegram\.me|wa\.me)\/[^\s/]+/i);
  const handle = handleMatch ? handleMatch[1] || handleMatch[0] : "";

  const nameMatch = t.match(/\b(?:my name is|i am|i'm|this is)\s+([\p{L}][\p{L}'-]{0,40}(?:\s+[\p{L}][\p{L}'-]{0,40})?)/iu);
  const name = nameMatch ? nameMatch[1] : "";

  const hasContact = !!(email || phone || handle);

  return {
    contact: hasContact,
    email,
    phone,
    handle,
    name: hasContact ? name : "",
    confidence: hasContact ? 0.6 : 0,
  };
}

function buildHeuristicMeta({ reply, userText, contexts, phase }) {
  const quick = quickHeuristicGood({ phase, contexts, reply })
    || { goodAnswer: true, confidence: 0.6, reason: "default" };
  const lead = extractLeadFromText(userText);
  const hasContext = Array.isArray(contexts) && contexts.length > 0;

  let answerable = quick.goodAnswer === true;
  let support = "none";
  let gapReason = answerable ? "" : (quick.reason || "heuristic");

  if (phase === "contact") {
    answerable = true;
    support = "weak";
    gapReason = "";
  } else if (answerable) {
    support = hasContext ? "weak" : "none";
  }

  const confidence = Number.isFinite(quick.confidence) ? quick.confidence : 0.6;

  return normalizeMeta({
    answerable,
    support,
    gap_reason: gapReason,
    used_context_ids: [],
    confidence,
    lead,
  });
}

const META_REPAIR_SYSTEM = [
  "You are generating AIW_META for logging only.",
  "Return ONLY ONE LINE: [AIW_META]{...valid single-line JSON...}. No other text.",
  'JSON schema: {"answerable":true|false,"support":"strong|weak|none","gap_reason":"...","used_context_ids":[],"confidence":0.0,"lead":{"contact":true|false,"email":"","phone":"","handle":"","name":"","confidence":0.0}}',
  "- If CONTEXT PROVIDED is 'no', set support=none and used_context_ids=[].",
  "- If you cannot be sure which context IDs were used, set used_context_ids=[].",
  "- If the answer lacks enough information, answerable=false, support=none, and set a short gap_reason.",
  "- LEAD fields must be exact substrings from the USER message, otherwise empty.",
  "- Output [AIW_META] on the last line only.",
].join("\n");

async function repairAiwMeta({ userText, assistantReply, hasContext }) {
  if (!oai) return null;

  const safeUser = String(userText || "").slice(0, 2000);
  const safeReply = String(assistantReply || "").slice(0, 2000);
  const ctxFlag = hasContext ? "yes" : "no";

  const messages = [
    { role: "system", content: META_REPAIR_SYSTEM },
    {
      role: "user",
      content:
        "USER MESSAGE:\n" + (safeUser || "(empty)") +
        "\n\nASSISTANT ANSWER:\n" + (safeReply || "(empty)") +
        "\n\nCONTEXT PROVIDED: " + ctxFlag,
    },
  ];

  try {
    const r = await oai.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 200,
      temperature: 0,
    });

    const raw = (r.choices?.[0]?.message?.content || "").trim();
    logMetaPresence("meta-repair", raw);

    const { meta } = extractAiwMeta(raw);
    let parsed = meta;
    if (!parsed && raw.startsWith("{") && raw.endsWith("}")) {
      try {
        parsed = JSON.parse(raw);
      } catch {}
    }

    return normalizeMeta(parsed);
  } catch (e) {
    console.error("[AIW][META][repair] error:", e?.message || e);
    return null;
  }
}

function scheduleMetaOps({
  metaNorm,
  reply,
  userText,
  contexts,
  phase,
  siteId,
  sessionId,
  visitorId,
  clientId,
  replyLang,
  T,
}) {
  const fallbackMeta = metaNorm || buildHeuristicMeta({ reply, userText, contexts, phase });
  const hasContext = Array.isArray(contexts) && contexts.length > 0;
  const shouldRepair = !metaNorm && hasContext && phase !== "contact" && !!oai;

  deferTimed(T, "upsertLeadFromMeta", () => upsertLeadFromMeta({
    metaNorm: fallbackMeta,
    siteId,
    sessionId,
    visitorId,
    clientId,
    userText,
    replyLang,
  }));

  if (shouldRepair) {
    console.log("[AIW][META][repair] scheduled", { phase, hasContext });
    deferTimed(T, "metaRepair", async () => {
      const repaired = await repairAiwMeta({
        userText,
        assistantReply: reply,
        hasContext,
      });
      const finalMeta = repaired || fallbackMeta;

      await upsertLeadFromMeta({
        metaNorm: finalMeta,
        siteId,
        sessionId,
        visitorId,
        clientId,
        userText,
        replyLang,
      });

      await logGapFromMetaOnly({
        metaNorm: finalMeta,
        siteId,
        sessionId,
        clientId,
        question: userText,
        reply,
        phase: "rag-meta",
        contexts,
      });
    });
  } else {
    deferTimed(T, "logGapFromMetaOnly", () => logGapFromMetaOnly({
      metaNorm: fallbackMeta,
      siteId,
      sessionId,
      clientId,
      question: userText,
      reply,
      phase: "rag-meta",
      contexts,
    }));
  }

  return { metaNorm: fallbackMeta, repairScheduled: shouldRepair };
}

async function upsertLeadFromMeta({
  metaNorm,
  siteId,
  sessionId,
  visitorId,
  clientId,
  userText,
  replyLang,
}) {
  try {
    if (!metaNorm?.lead) return;
    if (!siteId || !sessionId) return;

    const lead = metaNorm.lead || {};
    const text = String(userText || "");

    // 1) normalize strings
    let email  = String(lead.email  || "").trim();
    let phone  = String(lead.phone  || "").trim();
    let handle = String(lead.handle || "").trim();
    let name   = String(lead.name   || "").trim();

    // 2) server-check: must be substring of current userText
    if (email  && !text.includes(email))  email = "";
    if (phone  && !text.includes(phone))  phone = "";
    if (handle && !text.includes(handle)) handle = "";
    if (name   && !text.includes(name))   name = "";

    // 3) если в этом сообщении ничего нового — выходим
    // (важно: НЕ трогаем БД, чтобы не перетирать)
    if (!email && !phone && !handle && !name) return;

    const filter = { siteId, sessionId };

    // 4) строим $set только для НЕпустых значений (merge-only)
    const set = {};
    if (email)  set["answers.contact.email"]  = email;
    if (phone)  set["answers.contact.phone"]  = phone;
    if (handle) set["answers.contact.handle"] = handle;
    if (name)   set["answers.contact.name"]   = name;

    // доп. поля, которые безопасно обновлять всегда
    set["answers.contact.lang"] = replyLang || null;

    if (email)  set["meta.lead.email"]  = email;
    if (phone)  set["meta.lead.phone"]  = phone;
    if (handle) set["meta.lead.handle"] = handle;
    if (name)   set["meta.lead.name"]   = name;

    // lead.contact всегда true, если мы что-то поймали сейчас
    set["meta.lead.contact"] = true;

    // confidence: обновляем только если пришло > 0 (не затираем нулём)
    const conf = Number(metaNorm.lead?.confidence ?? 0) || 0;
    if (conf > 0) set["meta.lead.confidence"] = conf;

// --- scaffold (null fields) ONLY on insert, but avoid conflicts with $set ---
const insertScaffold = {
  // answers.contact
  "answers.contact.email":  null,
  "answers.contact.phone":  null,
  "answers.contact.handle": null,
  "answers.contact.name":   null,
  "answers.contact.lang":   null,

  // meta.lead
  "meta.lead.contact":    false,
  "meta.lead.email":      null,
  "meta.lead.phone":      null,
  "meta.lead.handle":     null,
  "meta.lead.name":       null,
  "meta.lead.confidence": null,
};

for (const k of Object.keys(set)) {
  if (k in insertScaffold) delete insertScaffold[k];
}

const update = {
  $setOnInsert: {
    clientId: clientId || null,
    siteId,
    sessionId,
    visitorId: visitorId || null,
    status: "new",
    createdAt: new Date(),

    ...insertScaffold,
  },

  $set: set,
  $currentDate: { updatedAt: true },
};

    await Lead.updateOne(filter, update, { upsert: true });

    console.log("[AIW][lead] upserted(merge)", {
      siteId,
      sessionId,
      email: !!email,
      phone: !!phone,
      handle: !!handle,
      name: !!name,
    });
  } catch (e) {
    console.error("[AIW][lead] upsert error:", e?.message || e);
  }
}


function metaSaysGap(metaNorm) {
  if (!metaNorm) return false;
  if (metaNorm.answerable === false) return true;
  if ((metaNorm.support || "none") === "none") return true;
  return false;
}

function metaToCitations(metaNorm, contexts = []) {
  const ids = (metaNorm?.used_context_ids || [])
    .map(n => Number(n))
    .filter(n => Number.isFinite(n) && n >= 1 && n <= (contexts?.length || 0));

  return ids
    .map(id => contexts[id - 1]?.url)
    .filter(Boolean)
    .slice(0, 5);
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

export async function logGapFromMetaOnly({
  metaNorm,
  siteId,
  sessionId,
  clientId,
  question,
  reply,
  phase,
  contexts,
}) {
  // meta — единственный источник правды
  if (!metaNorm) return;

  const isGap = metaSaysGap(metaNorm);
  if (!isGap) return;

  const normalizedQuestion = (question || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  if (!normalizedQuestion) return;

  const safeSiteId = siteId || "UNKNOWN_SITE";
  const safeSessionId = sessionId || "UNKNOWN_SESSION";

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
      phase: phase || "rag-meta",
      citations: metaToCitations(metaNorm, contexts),
      judge: {
        goodAnswer: false,
        confidence: metaNorm.confidence,
        reason: metaNorm.gap_reason || `support:${metaNorm.support}`,
      },
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    },
  };

  try {
    const updRes = await AiwGap.updateOne(filter, update, { upsert: true });
    console.log("[AiwGap][meta] result:", updRes);
  } catch (e) {
    console.error("[AiwGap][meta] updateOne ERROR:", e?.name, e?.message, e);
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

function dumpPromptIfDebug({ label, messages, req, extra = {} }) {
  if (process.env.AIW_DEBUG_PROMPT !== "1") return;
  try {
    const dumpDir = path.join(process.cwd(), ".aiw_debug");
    fs.mkdirSync(dumpDir, { recursive: true });

    const traceId = req?.__trace?.id ? String(req.__trace.id) : "no-trace";
    const ts = Date.now();

    // безопасное имя
    const safeLabel = String(label || "prompt")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 60);

    const dumpPath = path.join(dumpDir, `llm_prompt_dump_${safeLabel}_${ts}_${traceId}.json`);

    const payload = {
      label: safeLabel,
      ts,
      traceId,
      pid: process.pid,
      port: process.env.PORT || null,
      model: MODEL,
      completionOpts: COMPLETION_OPTS,
      messages,
      ...extra,
    };

    fs.writeFileSync(dumpPath, JSON.stringify(payload, null, 2), "utf8");
    console.log("[AIW] prompt dumped to:", dumpPath);
  } catch (e) {
    console.warn("[AIW] prompt dump failed:", e?.message || e);
  }
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
- Считай это согласием ТОЛЬКО если сообщение состоит ТОЛЬКО из короткого подтверждения (например "ок", "да", "давай") и НЕ содержит нового вопроса/темы (нет "?", нет дополнительных фраз).
- Если после "ок" идёт новый вопрос или уточнение — отвечай на новый вопрос.
- Формат: 2–4 коротких предложения.`;

const DEFAULT_SYS_EN = `You are this site's assistant bot. Respond briefly and friendly.
- Help with questions about the company, services, rates, documents, and contacts.
- If information is missing, politely ask 1-2 questions to clarify.
-Treat it as consent ONLY if the message consists of a short confirmation (for example: "ok", "yes", "sure", "let’s do it") and contains no new question or topic (no “?”, no additional phrases).
-If after "ok" there is a new question, clarification, or any extra content, respond to that new question instead of proceeding with the previously suggested action.
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

// !!This code successfully stopped the responses from randomly switching between languages!!

function pickSystemPrompt(cfg, lang = "ru", complex = null) {
  const fromDb = (cfg?.customSystemPrompt || "").trim();
  const base = fromDb || (lang.startsWith("ru") ? DEFAULT_SYS_RU : DEFAULT_SYS_EN);
  let complexBlock = "";

  const LN = langName(lang);
const langHeader =
`IMPORTANT: You MUST answer ONLY in ${LN}.`;


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

  // return `${langHeader}\n\n${base}${complexBlock}`;
  return `${base}${complexBlock}`;
}


// !!This code successfully stopped the responses from randomly switching between languages!! END

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


const clientId = await T.wrap("resolveClientIdStrict", () => resolveClientIdStrict(req, meta, siteId));
if (clientId) res.setHeader("X-AIW-Client", String(clientId));
const cfg = await T.wrap("getWidgetConfigCached", () => getWidgetConfigCached({ clientId, siteId }));

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
const pq = await T.wrap("prepareQueryForRag", () => prepareQueryForRag({  messages: safeMsgs,
  metaLang: uiLang,
  currentReplyLang,
  oai,
  rewriteModel: "gpt-4o-mini",
  maxHistory: MAX_HISTORY_FOR_LLM }));


const {
  rawQuery,
  ragQuery: initialRagQuery,
  llmQuery: initialLlmQuery,
  lang,
  detectedUserLang,
  lastAssistant,
  complex,
  followup,
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

// follow-up приходит из prepareQueryForRag (LLM judge + fallback)
isFollowUp = pq.followup?.isFollowUpForRetrieval === true;

// полезно для дебага (опционально)
console.log("[AIW][followup]", {
  rawQuery,
  lastAssistant: !!lastAssistant,
  isFollowUp,
  kind: followup?.kind,
  confidence: followup?.confidence,
  reason: followup?.reason,
});

// // ====== replyLang logic (anti short-switch, any language) ======
// const detectedNow0 = normalizeLang(detectedUserLang || uiLang, uiLang);

// let replyLangThisTurn = detectedNow0;
// let persistReplyLang  = detectedNow0;

// let langReasonFinal = "detected";

// // ✅ универсально: короткие “значения” не должны переключать язык диалога
// if (shouldSuppressLangSwitchOnShortAnswer({
//   rawQuery,
//   currentReplyLang,
//   detectedNow: detectedNow0,
//   lastAssistant,
// })) {
//   replyLangThisTurn = currentReplyLang;
//   persistReplyLang  = currentReplyLang;
//   langReasonFinal   = "short_entity_followup";
// }

// res.setHeader("X-AIW-Reply-Lang", replyLangThisTurn);
// res.setHeader("X-AIW-Persist-Reply-Lang", persistReplyLang);
// res.setHeader("X-AIW-Detected-Lang", detectedNow0);
// res.setHeader("X-AIW-Lang-Reason", langReasonFinal);
// res.setHeader("X-AIW-Soft-Override", String(langReasonFinal !== "detected"));

// ====== replyLang logic (apply switch + anti short-switch + clamp weak-evidence) ======
const detectedNow0 = normalizeLang(detectedUserLang || uiLang, uiLang);

let replyLangThisTurn = detectedNow0;
let persistReplyLang  = detectedNow0;
let langReasonFinal   = "detected";

// 0) CLAMP: если switch слабый — не применяем
const LOW_SWITCH_CONF = Number(process.env.AIW_LANG_SWITCH_MIN_CONF || 0.8);
const confNum = Number(switchConfidence ?? 0) || 0;

let applySwitch = Boolean(shouldSwitchLang && switchToLang);

if (applySwitch && (switchReason === "weak-evidence") && confNum < LOW_SWITCH_CONF) {
  applySwitch = false;
  langReasonFinal = "weak-evidence_clamped";
}

// 1) если switch реально применяем — применяем
if (applySwitch) {
  const target = normalizeLang(switchToLang, detectedNow0);
  replyLangThisTurn = target;
  persistReplyLang  = target;
  langReasonFinal   = switchReason || "switch";
}

// 2) короткие “значения” не должны переключать язык
// ВАЖНО: проверяем !applySwitch (а не !shouldSwitchLang),
// чтобы подавление сработало, когда мы "зажали" слабый switch
if (!applySwitch && shouldSuppressLangSwitchOnShortAnswer({
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

// persist (async)
defer(() => AiwSession.updateOne(
  { sessionId },
  {
    $set: {
      replyLang: persistReplyLang,
      lastDetectedLang: detectedNow0,
      langStreak: 0,
      replyLangUpdatedAt: new Date(),
    },
  }
));

    // ====== logUserMessage ======
if (query) {
  deferTimed(T, "logUserMessage", () =>
    logUserMessage({ siteId, sessionId, content: query, clientId })
  );

  // метка, что мы ушли в async
  T.mark("logUserMessage_deferred_at_ms");
  dbMark = "user:~ assistant:-";
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


const skipRetrieve = (followup?.kind === "contact");

// ====== RAG retrieve (HYBRID) ======
let retrieveRes = { contexts: [] };

if (skipRetrieve) {
  // contact turn: don't waste retrieval
  res.setHeader("X-AIW-Retrieve-Mode", "skip-contact");
  retrieveRes = { contexts: [] };
} else {
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
}

const contexts = retrieveRes.contexts || [];

res.setHeader("X-AIW-Contexts", String(contexts.length));
console.log("[AIW] contexts:", contexts.length);
timing.retrieve = T.get().retrieve;


// ====== Нет контекста ======
if (!contexts.length) {
  phase = skipRetrieve ? "contact" : "no-context";
  res.setHeader("X-AIW-Phase", phase);
  setSourceHeaders(res, skipRetrieve ? "contact-llm" : "no-context-llm", []);

  let reply = "";
  let usageInput  = null;
  let usageOutput = null;
  let usageTotal  = null;

  console.log("[LANG][final_decision]", {
  rawQuery,
  uiLang,
  currentReplyLang,
  detectedUserLang,
  detectedNow0,
  shouldSwitchLang,
  switchToLang,
  switchConfidence,
  replyLangThisTurn,
  persistReplyLang,
  langReasonFinal,
});
  const sys = pickSystemPrompt(cfg, replyLangThisTurn, complex);

  // хвост диалога
  const dialogTail = safeMsgs
    .filter(m => m.role === "user" || m.role === "assistant")
    .slice(-MAX_HISTORY_FOR_LLM);

  // гарантируем, что последний месседж – актуальный вопрос пользователя
  const lastIsUser = dialogTail.length && dialogTail[dialogTail.length - 1].role === "user";

let messagesForLLM = [
  { role: "system", content: sys },
  { role: "system", content: skipRetrieve ? CONTACT_META_CONTRACT : NOCTX_META_CONTRACT },
  { role: "system", content: `IMPORTANT: You MUST answer ONLY in ${replyLangThisTurn}.` },
  ...dialogTail,
];


  if (!lastIsUser || (dialogTail[dialogTail.length - 1].content || "").trim() !== llmQuery.trim()) {
    messagesForLLM.push({ role: "user", content: llmQuery });
  }
        
  dumpPromptIfDebug({
  label: skipRetrieve ? "contact_noctx" : "no_context",
  messages: messagesForLLM,
  req,
  extra: {
    phase,
    siteId,
    sessionId,
    clientId: clientId ? String(clientId) : null,
    skipRetrieve: !!skipRetrieve,
    isFollowUp: !!isFollowUp,
    intentLabel: intentLabel || null,
    replyLangThisTurn,
    detectedNow0,
    langReasonFinal,
  }
});

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

    let buffer = "";       // финальный видимый ответ (без meta)
let fullBuffer = "";   // полный текст от LLM (включая meta)
let outBuffer = "";    // что реально отдали пользователю
let hold = "";         // хвост, чтобы ловить [AIW_META] между чанками
let metaStarted = false;
let usage = null;
let metaNorm = null;
let metaParsed = null;

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

       let firstTokenMarked = false;
let firstChunkFlushedMarked = false;

for await (const chunk of completion) {
  if (chunk.usage) {
    usage = {
      input:  chunk.usage.prompt_tokens ?? chunk.usage.input_tokens,
      output: chunk.usage.completion_tokens ?? chunk.usage.output_tokens,
      total:  chunk.usage.total_tokens,
    };
  }

  const piece = chunk.choices?.[0]?.delta?.content || "";
  if (!piece) continue; // ✅ не отмечаем токен на пустых чанках

  if (!firstTokenMarked) { // ✅ первый токен только когда реально пришёл текст
    firstTokenMarked = true;
    T.mark("firstLLMToken");
  }

  fullBuffer += piece;

  if (metaStarted) continue;

  hold += piece;

  const idx = hold.indexOf(AIW_META_TAG);
  if (idx !== -1) {
    const before = hold.slice(0, idx);
    if (before) {
      outBuffer += before;
      if (!clientClosed) {
        res.write(`data:${sseEncode(before)}\n\n`);
        if (!firstChunkFlushedMarked) { // ✅ первый флаш в SSE
          firstChunkFlushedMarked = true;
          T.mark("firstChunkFlushed");
        }
      }
    }
    metaStarted = true;
    hold = "";
    continue;
  }

  const HOLD_N = 64;
  if (hold.length > HOLD_N) {
    const flush = hold.slice(0, hold.length - HOLD_N);
    hold = hold.slice(hold.length - HOLD_N);

    outBuffer += flush;
    if (!clientClosed) {
      res.write(`data:${sseEncode(flush)}\n\n`);
      if (!firstChunkFlushedMarked) {
        firstChunkFlushedMarked = true;
        T.mark("firstChunkFlushed");
      }
    }
  }
}

// финальный хвост (если meta не встретили)
if (!metaStarted && hold) {
  const tail = String(hold).replace(/\s+$/g, "");
  outBuffer += tail;
  if (!clientClosed && tail) {
    res.write(`data:${sseEncode(tail)}\n\n`);
    if (!firstChunkFlushedMarked) {
      firstChunkFlushedMarked = true;
      T.mark("firstChunkFlushed");
    }
  }
}

T.mark("afterLLM"); 
logMetaPresence("no-context-stream", fullBuffer);

const { meta } = extractAiwMeta(fullBuffer);
metaParsed = normalizeMeta(meta);


// финальный видимый ответ (без meta)
buffer = (outBuffer || "").trim();

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

    const metaOps = scheduleMetaOps({
      metaNorm: metaParsed,
      reply,
      userText: query,
      contexts: [],
      phase,
      siteId,
      sessionId,
      visitorId,
      clientId,
      replyLang: replyLangThisTurn,
      T,
    });
    metaNorm = metaOps.metaNorm;

    if (!metaParsed) {
      console.log("[AIW][AIW_META][fallback]", metaNorm);
    } else {
      console.log("[AIW][AIW_META][norm]", metaNorm);
    }

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


    if (!clientClosed) {
      res.write("data: [DONE]\n\n");
      return res.end();
    }
    return; // если клиент закрыл — просто выходим
  }

  // ====== JSON MODE (как было) ======
  // (оставляем не-stream completion)
  let metaParsed = null;
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

const raw = (r.choices?.[0]?.message?.content || "");
logMetaPresence("no-context-json", raw);

const { answerText, meta } = extractAiwMeta(raw);
metaParsed = normalizeMeta(meta);

reply = (answerText || "").trim();
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

  scheduleMetaOps({
    metaNorm: metaParsed,
    reply,
    userText: query,
    contexts: [],
    phase,
    siteId,
    sessionId,
    visitorId,
    clientId,
    replyLang: replyLangThisTurn,
    T,
  });

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

console.log("[LANG][final_decision]", {
  rawQuery,
  uiLang,
  currentReplyLang,
  detectedUserLang,
  detectedNow0,
  shouldSwitchLang,
  switchToLang,
  switchConfidence,
  replyLangThisTurn,
  persistReplyLang,
  langReasonFinal,
});
// если есть кастомный системный промпт — добавим его первым сообщением
const sys = pickSystemPrompt(cfg, replyLangThisTurn, complex);

const prompt = buildPrompt({
  system: sys,
  history: safeMsgs,                
  query: llmQuery,
  contexts,
  maxHistory: MAX_HISTORY_FOR_LLM,
  complex,
  replyLangThisTurn,
});
T.mark("buildPrompt");

// ====== prompt dump (debug only) ======
dumpPromptIfDebug({
  label: "rag",
  messages: prompt,
  req,
  extra: {
    phase,
    siteId,
    sessionId,
    clientId: clientId ? String(clientId) : null,
    contextsCount: contexts?.length || 0,
    intentLabel: intentLabel || null,
    isFollowUp: !!isFollowUp,
  }
});


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

let buffer = "";      // финальный видимый ответ (без meta)
let fullBuffer = "";  // полный текст от LLM (включая meta)
let outBuffer = "";   // что реально отдали пользователю
let hold = "";        // хвост для ловли [AIW_META]
let metaStarted = false;
let metaNorm = null;
let metaParsed = null;

let usage = null;

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


 let firstTokenMarked = false;
let firstChunkFlushedMarked = false;

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

  if (!firstTokenMarked) {
    firstTokenMarked = true;
    T.mark("firstLLMToken");
  }

  fullBuffer += piece;

  if (metaStarted) continue;

  hold += piece;

  const idx = hold.indexOf(AIW_META_TAG);
  if (idx !== -1) {
    const before = hold.slice(0, idx);
    if (before) {
      outBuffer += before;
      if (!clientClosed) {
        res.write(`data:${sseEncode(before)}\n\n`);
        if (!firstChunkFlushedMarked) {
          firstChunkFlushedMarked = true;
          T.mark("firstChunkFlushed");
        }
      }
    }
    metaStarted = true;
    hold = "";
    continue;
  }

  const HOLD_N = 64;
  if (hold.length > HOLD_N) {
    const flush = hold.slice(0, hold.length - HOLD_N);
    hold = hold.slice(hold.length - HOLD_N);

    outBuffer += flush;
    if (!clientClosed) {
      res.write(`data:${sseEncode(flush)}\n\n`);
      if (!firstChunkFlushedMarked) {
        firstChunkFlushedMarked = true;
        T.mark("firstChunkFlushed");
      }
    }
  }
}

if (!metaStarted && hold) {
  const tail = String(hold).replace(/\s+$/g, "");
  outBuffer += tail;
  if (!clientClosed && tail) {
    res.write(`data:${sseEncode(tail)}\n\n`);
    if (!firstChunkFlushedMarked) {
      firstChunkFlushedMarked = true;
      T.mark("firstChunkFlushed");
    }
  }
}

T.mark("afterLLM");

logMetaPresence("rag-stream", fullBuffer);

const { meta } = extractAiwMeta(fullBuffer);
metaParsed = normalizeMeta(meta);

// финальный видимый ответ (без meta)
buffer = (outBuffer || "").trim();

// Логируем токены после завершения стрима
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
      const metaOps = scheduleMetaOps({
        metaNorm: metaParsed,
        reply: buffer,
        userText: query,
        contexts,
        phase,
        siteId,
        sessionId,
        visitorId,
        clientId,
        replyLang: replyLangThisTurn,
        T,
      });
      metaNorm = metaOps.metaNorm;

      if (!metaParsed) {
        console.log("[AIW][AIW_META][fallback]", metaNorm);
      } else {
        console.log("[AIW][AIW_META][norm]", metaNorm);
      }

      let tokensInput  = usage?.input  ?? null;
let tokensOutput = usage?.output ?? null;
let tokensTotal  = usage?.total  ?? null;
const costUsd    = estimateCostUsd(MODEL, tokensInput, tokensOutput);

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
let metaParsed = null;

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

  const raw = completion.choices?.[0]?.message?.content || "";
  logMetaPresence("rag-json", raw);
const { answerText, meta } = extractAiwMeta(raw);
metaParsed = normalizeMeta(meta);

reply = (answerText || "").trim() || reply;
}

scheduleMetaOps({
  metaNorm: metaParsed,
  reply,
  userText: query,
  contexts,
  phase,
  siteId,
  sessionId,
  visitorId,
  clientId,
  replyLang: replyLangThisTurn,
  T,
});
T.mark("afterLLM");
timing.llm = T.get().afterLLM - T.get().beforeLLM;

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
