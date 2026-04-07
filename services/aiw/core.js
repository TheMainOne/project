// services/aiw/core.js
// Transport-agnostic AIW chat processing pipeline.
// Extracted from api/widget/widget.js so that Telegram, WhatsApp,
// Instagram (and any future channel) can reuse the same RAG + LLM logic.

import "dotenv/config";
import mongoose from "mongoose";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

import AiwSession from "../../models/AiwSession.js";
import AiwMessage from "../../models/AiwMessage.js";
import AiwGap from "../../models/AiwGap.js";
import Lead from "../../models/Lead.js";
import Client from "../../models/Client.js";
import enqueueLeadCreatedNotification from "../notifications/enqueueLeadCreatedNotification.js";
import { hashIp, classifyTopics } from "../../utils/telemetry.js";
import { getWidgetConfigCached } from "../widgetConfig/cache.js";
import { retrieveHybrid } from "../rag/retrieveHybrid.js";
import { classifyRagIntent } from "../rag/intent.js";
import {
  prepareQueryForRag,
  detectLangFromText,
} from "../rag/queryRewrite.js";
import { buildPrompt } from "../rag/buildPrompt.js";

// ======================== Constants ========================

const oai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const COMPLETION_OPTS = {
  max_tokens: 1000,
  temperature: 0.7,
};
const MAX_HISTORY_FOR_LLM = 25;

const AIW_META_TAG = "[AIW_META]";

const MODEL_PRICES = {
  "gpt-5-nano": { in: 0.05 / 1_000_000, out: 0.40 / 1_000_000 },
  "gpt-4o-mini": { in: 0.15 / 1_000_000, out: 0.60 / 1_000_000 },
};

const DEFAULT_SYS_RU = `Ты — бот-ассистент этого сайта. Отвечай кратко и дружелюбно.
- Помогаешь с вопросами о компании, услугах, тарифах, документах и контактах.
- Если информации не хватает, вежливо уточни 1–2 вопроса.
- Считай это согласием ТОЛЬКО если сообщение состоит ТОЛЬКО из короткого подтверждения (например "ок", "да", "давай") и НЕ содержит нового вопроса/темы (нет "?", нет дополнительных фраз).
- Если после "ок" идёт новый вопрос или уточнение — отвечай на новый вопрос.
- Формат: 2–4 коротких предложения.`;

const DEFAULT_SYS_EN = `You are this site's assistant bot. Respond briefly and friendly.
- Help with questions about the company, services, rates, documents, and contacts.
- If information is missing, politely ask 1-2 questions to clarify.
-Treat it as consent ONLY if the message consists of a short confirmation (for example: "ok", "yes", "sure", "let's do it") and contains no new question or topic (no "?", no additional phrases).
-If after "ok" there is a new question, clarification, or any extra content, respond to that new question instead of proceeding with the previously suggested action.
- Format: 2-4 short sentences.`;

const NOCTX_META_CONTRACT = [
  "OUTPUT FORMAT (MANDATORY):",
  "- First, write the normal user-facing answer.",
  "- Then, on the LAST line ONLY, output: [AIW_META]{...single-line JSON...}",
  '- JSON format: {"answerable":true|false,"support":"strong|weak|none","gap_reason":"...","used_context_ids":[],"confidence":0.0,"lead":{"contact":true|false,"email":"","phone":"","handle":"","name":"","confidence":0.0}}',
  "- LEAD: set lead.contact=true ONLY if the USER message contains contact details.",
  "- LEAD: lead.email/phone/handle/name MUST be exact substrings from the user's LAST message (otherwise empty).",
  "- Do NOT output [AIW_META] anywhere except the very last line.",
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
  "- If you do NOT output the [AIW_META] JSON line, your answer is invalid. Always output it.",
].join("\n");

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

// ======================== Utility helpers ========================

function defer(promiseFactory) {
  try {
    Promise.resolve()
      .then(promiseFactory)
      .catch((e) => console.error("[AIW] deferred error:", e?.message || e));
  } catch (e) {
    console.error("[AIW] defer sync error:", e?.message || e);
  }
}

function deferTimed(T, label, promiseFactory) {
  try { T?.mark?.(`${label}_enqueued_at_ms`); } catch {}
  const startedAt = Date.now();
  return defer(async () => {
    const s = Date.now();
    try {
      return await promiseFactory();
    } finally {
      const dur = Date.now() - s;
      const doneAt = Date.now() - startedAt;
      try { T?.set?.(`${label}_dur_ms`, dur); T?.mark?.(`${label}_done_at_ms`); } catch {}
      console.log(`[AIW][perf][${label}] dur_ms=${dur} (defer_done_delta_ms=${doneAt})`);
    }
  });
}

function makeTimer() {
  const t0 = Date.now();
  const marks = Object.create(null);
  return {
    mark(label) { marks[label] = Date.now() - t0; },
    set(label, value) { marks[label] = value; },
    async wrap(label, fn) {
      const s = Date.now();
      try { return await fn(); }
      finally {
        marks[`${label}_dur_ms`] = Date.now() - s;
        marks[`${label}_done_at_ms`] = Date.now() - t0;
      }
    },
    get() { return { ...marks, total: Date.now() - t0 }; },
    t0,
  };
}

function estimateCostUsd(model, inputTokens = 0, outputTokens = 0) {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  return Number((inputTokens * price.in + outputTokens * price.out).toFixed(6));
}

// ======================== Language helpers ========================

export function normalizeLang(code, fallback = "en") {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return fallback;
  return c.split(/[-_]/)[0] || fallback;
}

function langName(code = "en") {
  const c = normalizeLang(code, "en");
  const map = {
    en: "English", ru: "Russian", uk: "Ukrainian", de: "German",
    fr: "French", es: "Spanish", it: "Italian", pl: "Polish",
    pt: "Portuguese", tr: "Turkish", ar: "Arabic", hi: "Hindi",
    zh: "Chinese", ja: "Japanese", ko: "Korean",
  };
  return map[c] || c.toUpperCase();
}

function hasLettersOfLang(text = "", lang = "") {
  const t = String(text || "");
  const l = normalizeLang(lang || "", "");
  if (!t || !l) return false;
  if (l === "ru" || l === "uk") return /[а-яёіїєґ]/i.test(t);
  if (l === "ar") return /[\u0600-\u06FF]/.test(t);
  if (l === "he") return /[\u0590-\u05FF]/.test(t);
  if (l === "zh" || l === "ja" || l === "ko")
    return /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(t);
  return /[a-z]/i.test(t);
}

function isPhoneLikeAnswer(s = "") {
  const t = String(s || "").trim();
  if (t.length < 7 || t.length > 32) return false;
  if (!/^[+\d\s().\-]+$/.test(t)) return false;
  const digits = (t.match(/\d/g) || []).length;
  return digits >= 7;
}

function isShortEntityList(s = "") {
  const t = String(s || "").trim();
  if (!t || t.length > 40) return false;
  const parts = t.split(/[,\u2022/|&+]+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((p) => {
    const w = p.split(/\s+/).filter(Boolean);
    if (w.length > 2 || p.length > 20) return false;
    return /[\p{L}]/u.test(p);
  });
}

function looksLikeEntityAnswer(q = "") {
  const s = String(q || "").trim();
  if (!s) return false;
  if (isPhoneLikeAnswer(s)) return true;
  if (isShortEntityList(s)) return true;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 2) return false;
  if (!/^[\p{L}\p{N}\s@._+#\-\/(),&]+$/u.test(s)) return false;
  return s.length <= 24;
}

function shouldSuppressLangSwitchOnShortAnswer({ rawQuery, currentReplyLang, detectedNow, lastAssistant }) {
  const q = String(rawQuery || "").trim();
  if (!q) return false;
  const cur = normalizeLang(currentReplyLang || "", "");
  const det = normalizeLang(detectedNow || "", cur);
  if (!cur || !det || cur === det) return false;
  if (!looksLikeEntityAnswer(q)) return false;
  const prev = String(lastAssistant?.content || "");
  if (!prev) return false;
  return hasLettersOfLang(prev, cur);
}

// ======================== Meta helpers ========================

function extractAiwMeta(fullText = "") {
  const text = String(fullText || "");
  const tagIdx = text.lastIndexOf(AIW_META_TAG);
  if (tagIdx === -1) return { answerText: text.trimEnd(), meta: null };
  let i = tagIdx + AIW_META_TAG.length;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== "{") return { answerText: text.trimEnd(), meta: null };
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let p = i; p < text.length; p++) {
    const ch = text[p];
    if (inStr) { if (esc) { esc = false; continue; } if (ch === "\\") { esc = true; continue; } if (ch === '"') { inStr = false; } continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { depth++; continue; }
    if (ch === "}") { depth--; if (depth === 0) { end = p; break; } }
  }
  if (end === -1) return { answerText: text.trimEnd(), meta: null };
  let meta = null;
  try { meta = JSON.parse(text.slice(i, end + 1)); } catch { meta = null; }
  const answerText = (text.slice(0, tagIdx) + text.slice(end + 1)).trimEnd();
  return { answerText, meta };
}

function normalizeLeadMeta(lead) {
  const l = lead && typeof lead === "object" ? lead : {};
  const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
  const s = (v, n) => String(v || "").slice(0, n);
  return { contact: l.contact === true, email: s(l.email, 200), phone: s(l.phone, 80), handle: s(l.handle, 120), name: s(l.name, 120), confidence: clamp01(l.confidence) };
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
  if (phoneMatch) { const c = phoneMatch[0]; if ((c.match(/\d/g) || []).length >= 7) phone = c; }
  const handleMatch = t.match(/(?:^|[\s(,[{])(@[A-Za-z0-9._-]{2,})/) || t.match(/(?:t\.me|telegram\.me|wa\.me)\/[^\s/]+/i);
  const handle = handleMatch ? handleMatch[1] || handleMatch[0] : "";
  const nameMatch = t.match(/\b(?:my name is|i am|i'm|this is)\s+([\p{L}][\p{L}'-]{0,40}(?:\s+[\p{L}][\p{L}'-]{0,40})?)/iu);
  const name = nameMatch ? nameMatch[1] : "";
  const hasContact = !!(email || phone || handle);
  return { contact: hasContact, email, phone, handle, name: hasContact ? name : "", confidence: hasContact ? 0.6 : 0 };
}

function metaSaysGap(metaNorm) {
  if (!metaNorm) return false;
  return metaNorm.answerable === false || (metaNorm.support || "none") === "none";
}

function metaToCitations(metaNorm, contexts = []) {
  const ids = (metaNorm?.used_context_ids || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= (contexts?.length || 0));
  return ids.map((id) => contexts[id - 1]?.url).filter(Boolean).slice(0, 5);
}

// ======================== Quality helpers ========================

function quickHeuristicGood({ phase, contexts, reply }) {
  if (!contexts?.length) return { goodAnswer: false, confidence: 0.9, reason: "no-context" };
  const r = (reply || "").toLowerCase();
  const noInfoPatterns = [
    /в контексте нет информации/i, /в базе(?: знаний)? нет информации/i, /в справке не указано/i,
    /в документаци[иія] не указано/i, /не наш[её]л[аи]? (сведени|информац)/i,
    /не (указан[оаы]?|приведён[оаы]?|сообщен[оаы]?|известн[оаы]?)/i,
    /нет (информации|данных) (об|по)/i, /указано только контактн[оеыя] лицо/i,
    /no (information|info) (in|about|on) (our )?(knowledge base|docs?|documentation|database|records)/i,
    /there (is|are) no (information|data) (available )?(on|about)/i,
    /we (do not|don't) have (any )?(information|data) (on|about)/i, /no data (on|about)/i,
    /not (listed|specified|documented) (in|within) (the )?(knowledge base|docs?|documentation|database)/i,
    /not available in (our )?(database|documents|docs|knowledge base)/i,
  ];
  if (noInfoPatterns.some((rx) => rx.test(r))) return { goodAnswer: false, confidence: 0.9, reason: "no-data-in-kb" };
  const badPhrases = [
    "не удалось", "не могу предоставить", "не могу раскрыть", "нет доступа",
    "конфиденциал", "конфиденциально", "конфиденциаль", "не имею доступа",
    "i don't know", "insufficient", "cannot provide", "cannot disclose", "can't share", "confidential",
  ];
  if (badPhrases.some((p) => r.includes(p))) return { goodAnswer: false, confidence: 0.8, reason: "fallback-phrase" };
  if (phase === "rag-extractive") return { goodAnswer: true, confidence: 0.75, reason: "extractive" };
  return null;
}

function quickFlag({ phase, contexts, reply }) {
  return quickHeuristicGood({ phase, contexts, reply }) || { goodAnswer: true, confidence: 0.6, reason: "default" };
}

function buildHeuristicMeta({ reply, userText, contexts, phase }) {
  const quick = quickHeuristicGood({ phase, contexts, reply }) || { goodAnswer: true, confidence: 0.6, reason: "default" };
  const lead = extractLeadFromText(userText);
  const hasContext = Array.isArray(contexts) && contexts.length > 0;
  let answerable = quick.goodAnswer === true;
  let support = "none";
  let gapReason = answerable ? "" : (quick.reason || "heuristic");
  if (phase === "contact") { answerable = true; support = "weak"; gapReason = ""; }
  else if (answerable) { support = hasContext ? "weak" : "none"; }
  return normalizeMeta({ answerable, support, gap_reason: gapReason, used_context_ids: [], confidence: Number.isFinite(quick.confidence) ? quick.confidence : 0.6, lead });
}

// ======================== Logging helpers ========================

function logLLMMessages(tag, msgs = []) {
  try {
    const view = (msgs || []).map((m, i) => {
      const c = String(m?.content ?? "");
      return { i, role: m?.role, len: c.length, head: c.slice(0, 160).replace(/\n/g, "\\n"), ctxMarks: (c.match(/\[#\d+\]/g) || []).length };
    });
    const last = view[view.length - 1];
    if (last) console.log(`[AIW][LLM][${tag}] LAST role=${last.role} len=${last.len} ctxMarks=${last.ctxMarks}`);
  } catch (e) { console.error("[AIW][LLM] logLLMMessages error:", e?.message || e); }
}

function logMetaPresence(tag, fullText) {
  try {
    const s = String(fullText || "");
    const hasTag = s.includes(AIW_META_TAG);
    const { meta } = extractAiwMeta(s);
    console.log(`[AIW][META][presence][${tag}] hasTag=${hasTag} metaParsed=${!!meta} len=${s.length}`);
  } catch (e) {
    console.log(`[AIW][META][presence][${tag}] ERROR`, e?.message || e);
  }
}

function dumpPromptIfDebug({ label, messages, extra = {} }) {
  if (process.env.AIW_DEBUG_PROMPT !== "1") return;
  try {
    const dumpDir = path.join(process.cwd(), ".aiw_debug");
    fs.mkdirSync(dumpDir, { recursive: true });
    const ts = Date.now();
    const safeLabel = String(label || "prompt").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60);
    const dumpPath = path.join(dumpDir, `llm_prompt_dump_${safeLabel}_${ts}.json`);
    fs.writeFileSync(dumpPath, JSON.stringify({ label: safeLabel, ts, model: MODEL, completionOpts: COMPLETION_OPTS, messages, ...extra }, null, 2), "utf8");
    console.log("[AIW] prompt dumped to:", dumpPath);
  } catch (e) { console.warn("[AIW] prompt dump failed:", e?.message || e); }
}

// ======================== Session / Client helpers ========================

function resolveIds({ siteId, sessionId, visitorId, origin }) {
  if (!siteId) {
    try {
      if (origin) { siteId = new URL(origin).hostname.replace(/^www\./, "") || null; }
    } catch {}
  }
  if (!siteId) siteId = "unknown-site";
  const serverGenerated = !sessionId;
  if (!sessionId) sessionId = "sess-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  return { siteId, sessionId, visitorId: visitorId || null, serverGenerated };
}

async function resolveClientIdStrict({ clientId, clientSlug, siteId }) {
  if (clientId && mongoose.isValidObjectId(clientId)) return new mongoose.Types.ObjectId(clientId);
  if (clientSlug) {
    const c = await Client.findOne({ slug: clientSlug }).select("_id").lean();
    if (c?._id) return new mongoose.Types.ObjectId(c._id);
  }
  if (siteId && siteId !== "unknown-site") {
    const c = await Client.findOne({ $or: [{ siteId }, { "sites.siteId": siteId }, { domains: siteId }] }).select("_id").lean();
    if (c?._id) return new mongoose.Types.ObjectId(c._id);
  }
  return null;
}

async function ensureSession(meta, requestContext = {}) {
  try {
    const { siteId, sessionId, visitorId, pageUrl, referrer, utm, tz, lang, clientId } = meta || {};
    const ipHashVal = hashIp(
      requestContext.ip || "0.0.0.0",
      requestContext.userAgent || "unknown",
      siteId || "unknown-site",
    );
    const now = new Date();
    await AiwSession.updateOne(
      { sessionId },
      {
        $setOnInsert: {
          siteId: siteId || "unknown-site", sessionId, visitorId: visitorId || null,
          clientId: clientId || null, pageUrl: pageUrl || null, referrer: referrer || null,
          utm: utm || {}, tz: tz || null, lang: lang || "ru",
          userAgent: requestContext.userAgent || null, ipHash: ipHashVal,
          startedAt: now, replyLang: lang || "ru", langStreak: 0,
          lastDetectedLang: lang || "ru", replyLangUpdatedAt: now,
          topics: [], messagesCount: 0, userMessages: 0, assistantMessages: 0,
        },
        $set: { endedAt: now, ...(clientId ? { clientId } : {}) },
      },
      { upsert: true, setDefaultsOnInsert: true },
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
      siteId: siteId || "unknown-site", clientId: clientId || null,
      sessionId, role: "user", content: String(content).slice(0, 8000), topic: topics[0],
    });
    await AiwSession.updateOne({ sessionId }, {
      $inc: { messagesCount: 1, userMessages: 1 },
      $set: { lastUserQuestion: content, endedAt: new Date(), ...(clientId ? { clientId } : {}) },
      $addToSet: { topics: { $each: topics } },
    });
    console.log("[AIW] logged user msg", doc._id.toString());
  } catch (e) { console.error("[AIW] logUserMessage error", e); }
}

async function logAssistantMessage({ siteId, sessionId, content, latencyMs, clientId, tokensInput, tokensOutput, tokensTotal, costUsd }) {
  try {
    if (content == null) return;
    const topics = classifyTopics(content);
    const doc = await AiwMessage.create({
      siteId: siteId || "unknown-site", clientId: clientId || null,
      sessionId, role: "assistant", content: String(content).slice(0, 200_000), topic: topics[0],
      latencyMs, tokensInput: tokensInput ?? null, tokensOutput: tokensOutput ?? null,
      tokensTotal: tokensTotal ?? null, costUsd: costUsd ?? null,
    });
    await AiwSession.updateOne({ sessionId }, {
      $inc: { messagesCount: 1, assistantMessages: 1 },
      $set: { endedAt: new Date(), ...(clientId ? { clientId } : {}) },
      $addToSet: { topics: { $each: topics } },
    });
    console.log("[AIW] logged assistant msg", doc._id.toString());
  } catch (e) { console.error("[AIW] logAssistantMessage error", e); }
}

// ======================== Prompt helpers ========================

function pickSystemPrompt(cfg, lang = "ru", complex = null) {
  const fromDb = (cfg?.customSystemPrompt || "").trim();
  const base = fromDb || (lang.startsWith("ru") ? DEFAULT_SYS_RU : DEFAULT_SYS_EN);
  let complexBlock = "";
  if (complex?.isComplex) {
    const types = Array.isArray(complex.taskTypes) ? complex.taskTypes : [];
    const lines = [
      "ADDITIONAL RULES FOR COMPLEX QUERIES:",
      "- Assume the question requires careful multi-step reasoning.",
      "- Use only facts and numbers from the provided context. If something is missing, explicitly state what information is missing.",
      "- If you need to make estimates or assumptions, clearly mark them as approximate and do not present them as hard facts.",
    ];
    if (types.includes("numeric_reasoning")) lines.push("- For numeric / budget questions, first reason internally, then output a concise answer. Do NOT invent precise numbers not in the context.");
    if (types.includes("planning")) lines.push("- For planning tasks, structure into clear steps/phases, timelines and priorities. Keep practical and grounded.");
    if (types.includes("comparison")) lines.push("- For comparison tasks, describe key pros/cons and conditions under which each option is better.");
    if (types.includes("multi_step")) lines.push("- For multi-step problems, break down internally but output only a concise, well-structured conclusion.");
    complexBlock = "\n\n" + lines.join("\n");
  }
  return `${base}${complexBlock}`;
}

function defaultNoContextReply(lang = "ru", cfg = {}) {
  const title = (cfg?.widgetTitle || (lang.startsWith("ru") ? "AI-ассистент" : "AI Assistant")).trim();
  const welcome = (cfg?.welcomeMessage || "").trim();
  if (lang.startsWith("ru")) {
    return [welcome || `Привет! Я ${title} этого сайта.`, `Могу помочь с услугами, ценами, документами/FAQ и контактами.`, `С чего начнём?`].filter(Boolean).join(" ");
  }
  return [welcome || `Hi! I'm the site's ${title}.`, `I can help with services, pricing, docs/FAQ, and contacts.`, `What would you like to start with?`].filter(Boolean).join(" ");
}

// ======================== Gap / Lead helpers ========================

async function upsertLeadFromMeta({ metaNorm, siteId, sessionId, visitorId, clientId, userText, replyLang }) {
  try {
    if (!metaNorm?.lead || !siteId || !sessionId) return;
    const lead = metaNorm.lead || {};
    const text = String(userText || "");
    let email = String(lead.email || "").trim();
    let phone = String(lead.phone || "").trim();
    let handle = String(lead.handle || "").trim();
    let name = String(lead.name || "").trim();
    if (email && !text.includes(email)) email = "";
    if (phone && !text.includes(phone)) phone = "";
    if (handle && !text.includes(handle)) handle = "";
    if (name && !text.includes(name)) name = "";
    if (!email && !phone && !handle && !name) return;
    const filter = { siteId, sessionId };
    const existingLead = await Lead.findOne(filter).select({ status: 1, meta: 1, answers: 1 }).lean();
    const hadContactBefore = Boolean(existingLead?.meta?.lead?.contact || existingLead?.answers?.contact?.email || existingLead?.answers?.contact?.phone || existingLead?.answers?.contact?.handle);
    const set = {};
    if (email) { set["answers.contact.email"] = email; set["meta.lead.email"] = email; }
    if (phone) { set["answers.contact.phone"] = phone; set["meta.lead.phone"] = phone; }
    if (handle) { set["answers.contact.handle"] = handle; set["meta.lead.handle"] = handle; }
    if (name) { set["answers.contact.name"] = name; set["meta.lead.name"] = name; }
    set["answers.contact.lang"] = replyLang || null;
    set["meta.lead.contact"] = true;
    const conf = Number(metaNorm.lead?.confidence ?? 0) || 0;
    if (conf > 0) set["meta.lead.confidence"] = conf;
    const insertScaffold = {
      "answers.contact.email": null, "answers.contact.phone": null, "answers.contact.handle": null,
      "answers.contact.name": null, "answers.contact.lang": null, "meta.lead.contact": false,
      "meta.lead.email": null, "meta.lead.phone": null, "meta.lead.handle": null,
      "meta.lead.name": null, "meta.lead.confidence": null,
    };
    for (const k of Object.keys(set)) { if (k in insertScaffold) delete insertScaffold[k]; }
    const update = {
      $setOnInsert: { clientId: clientId || null, siteId, sessionId, visitorId: visitorId || null, status: "new", createdAt: new Date(), ...insertScaffold },
      $set: set, $currentDate: { updatedAt: true },
    };
    await Lead.updateOne(filter, update, { upsert: true });
    const leadDoc = await Lead.findOne(filter).lean();
    const shouldNotify = leadDoc?.status === "new" && (!existingLead || !hadContactBefore);
    if (shouldNotify && leadDoc) await enqueueLeadCreatedNotification({ leadDoc });
    console.log("[AIW][lead] upserted(merge)", { siteId, sessionId, email: !!email, phone: !!phone, handle: !!handle, name: !!name });
  } catch (e) { console.error("[AIW][lead] upsert error:", e?.message || e); }
}

async function logGapFromMetaOnly({ metaNorm, siteId, sessionId, clientId, question, reply, phase, contexts }) {
  if (!metaNorm || !metaSaysGap(metaNorm)) return;
  const normalizedQuestion = (question || "").toLowerCase().trim().replace(/\s+/g, " ");
  if (!normalizedQuestion) return;
  const filter = { siteId: siteId || "UNKNOWN_SITE", sessionId: sessionId || "UNKNOWN_SESSION", normalizedQuestion, resolvedAt: null };
  const update = {
    $setOnInsert: { ...filter, clientId: clientId || null, question, createdAt: new Date(), resolvedAt: null },
    $set: {
      answerPreview: (reply || "").slice(0, 1500), phase: phase || "rag-meta",
      citations: metaToCitations(metaNorm, contexts),
      judge: { goodAnswer: false, confidence: metaNorm.confidence, reason: metaNorm.gap_reason || `support:${metaNorm.support}` },
      lastSeenAt: new Date(), updatedAt: new Date(),
    },
  };
  try { await AiwGap.updateOne(filter, update, { upsert: true }); } catch (e) { console.error("[AiwGap][meta] error:", e?.message || e); }
}

async function repairAiwMeta({ userText, assistantReply, hasContext }) {
  if (!oai) return null;
  try {
    const r = await oai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: META_REPAIR_SYSTEM },
        { role: "user", content: "USER MESSAGE:\n" + String(userText || "").slice(0, 2000) + "\n\nASSISTANT ANSWER:\n" + String(assistantReply || "").slice(0, 2000) + "\n\nCONTEXT PROVIDED: " + (hasContext ? "yes" : "no") },
      ],
      max_tokens: 200, temperature: 0,
    });
    const raw = (r.choices?.[0]?.message?.content || "").trim();
    logMetaPresence("meta-repair", raw);
    const { meta } = extractAiwMeta(raw);
    let parsed = meta;
    if (!parsed && raw.startsWith("{") && raw.endsWith("}")) { try { parsed = JSON.parse(raw); } catch {} }
    return normalizeMeta(parsed);
  } catch (e) { console.error("[AIW][META][repair] error:", e?.message || e); return null; }
}

function scheduleMetaOps({ metaNorm, reply, userText, contexts, phase, siteId, sessionId, visitorId, clientId, replyLang, T }) {
  const fallbackMeta = metaNorm || buildHeuristicMeta({ reply, userText, contexts, phase });
  const hasContext = Array.isArray(contexts) && contexts.length > 0;
  const shouldRepair = !metaNorm && hasContext && phase !== "contact" && !!oai;
  deferTimed(T, "upsertLeadFromMeta", () => upsertLeadFromMeta({ metaNorm: fallbackMeta, siteId, sessionId, visitorId, clientId, userText, replyLang }));
  if (shouldRepair) {
    deferTimed(T, "metaRepair", async () => {
      const repaired = await repairAiwMeta({ userText, assistantReply: reply, hasContext });
      const finalMeta = repaired || fallbackMeta;
      await upsertLeadFromMeta({ metaNorm: finalMeta, siteId, sessionId, visitorId, clientId, userText, replyLang });
      await logGapFromMetaOnly({ metaNorm: finalMeta, siteId, sessionId, clientId, question: userText, reply, phase: "rag-meta", contexts });
    });
  } else {
    deferTimed(T, "logGapFromMetaOnly", () => logGapFromMetaOnly({ metaNorm: fallbackMeta, siteId, sessionId, clientId, question: userText, reply, phase: "rag-meta", contexts }));
  }
  return { metaNorm: fallbackMeta, repairScheduled: shouldRepair };
}

// ======================== LLM call (streaming & non-streaming) ========================

/**
 * Call LLM with optional streaming.
 * If onChunk is provided — streams chunks via callback, stripping [AIW_META].
 * Returns { reply, fullText, usage, metaParsed }.
 */
async function callLLM({ messages, stream, onChunk, isCancelled, replyLang, T }) {
  const cancelled = () => (typeof isCancelled === "function" ? isCancelled() : false);
  let reply = "";
  let fullBuffer = "";
  let usage = null;
  let metaParsed = null;

  if (!oai) {
    const demo = (replyLang || "").startsWith("ru")
      ? "Демо-ответ (нет OPENAI_API_KEY)."
      : "Demo reply (no OPENAI_API_KEY).";
    if (stream && onChunk) onChunk(demo);
    return { reply: demo, fullText: demo, usage: null, metaParsed: null };
  }

  if (stream && onChunk) {
    // ---- STREAMING ----
    T?.mark?.("beforeLLM");
    const completion = await oai.chat.completions.create({
      model: MODEL, messages, stream: true,
      stream_options: { include_usage: true },
      ...COMPLETION_OPTS,
    });

    let outBuffer = "";
    let hold = "";
    let metaStarted = false;

let chunkCount = 0;
for await (const chunk of completion) {
  chunkCount++;
  if (chunkCount <= 3) {
    console.log("[AIW][callLLM] chunk#" + chunkCount, "cancelled:", cancelled(), "piece:", JSON.stringify((chunk.choices?.[0]?.delta?.content || "").slice(0, 40)));
  }
  if (chunk.usage) {
        usage = { input: chunk.usage.prompt_tokens ?? chunk.usage.input_tokens, output: chunk.usage.completion_tokens ?? chunk.usage.output_tokens, total: chunk.usage.total_tokens };
      }
      const piece = chunk.choices?.[0]?.delta?.content || "";
      if (!piece) continue;

      fullBuffer += piece;
      if (metaStarted) continue;

      hold += piece;
      const idx = hold.indexOf(AIW_META_TAG);
      if (idx !== -1) {
        const before = hold.slice(0, idx);
        if (before && !cancelled()) { outBuffer += before; onChunk(before); }
        metaStarted = true;
        hold = "";
        continue;
      }
const HOLD_N = 12;
if (hold.length > HOLD_N) {
  const flush = hold.slice(0, hold.length - HOLD_N);
  hold = hold.slice(hold.length - HOLD_N);
  outBuffer += flush;
  if (!cancelled()) onChunk(flush);
}
    }

    if (!metaStarted && hold) {
      const tail = String(hold).replace(/\s+$/g, "");
      console.log("[AIW][callLLM] flushing tail, len:", tail.length, "cancelled:", cancelled());
      outBuffer += tail;
      if (tail && !cancelled()) onChunk(tail);
    }

    T?.mark?.("afterLLM");
    logMetaPresence("stream", fullBuffer);
    const { meta } = extractAiwMeta(fullBuffer);
    metaParsed = normalizeMeta(meta);
    reply = (outBuffer || "").trim();
  } else {
    // ---- NON-STREAMING ----
    T?.mark?.("beforeLLM");
    const r = await oai.chat.completions.create({ model: MODEL, messages, ...COMPLETION_OPTS });
    T?.mark?.("afterLLM");
    if (r.usage) {
      usage = { input: r.usage.prompt_tokens ?? r.usage.input_tokens, output: r.usage.completion_tokens ?? r.usage.output_tokens, total: r.usage.total_tokens };
    }
    const raw = r.choices?.[0]?.message?.content || "";
    fullBuffer = raw;
    logMetaPresence("json", raw);
    const { answerText, meta } = extractAiwMeta(raw);
    metaParsed = normalizeMeta(meta);
    reply = (answerText || "").trim();
  }

  if (usage) console.log("[AIW][tokens]", { model: MODEL, ...usage });

  console.log("[AIW][callLLM] returning, reply len:", reply.length, "streamed:", !!(stream && onChunk));
  return { reply, fullText: fullBuffer, usage, metaParsed };
}

// ======================== Main: processMessage() ========================

/**
 * Process a chat message through the full AIW pipeline (RAG + LLM).
 * Transport-agnostic — works for web widget, Telegram, WhatsApp, etc.
 *
 * @param {Object} opts
 * @param {Array}  opts.messages        - Chat history [{role, content}]
 * @param {Object} [opts.identity]      - { siteId, sessionId, visitorId, clientId, clientSlug, origin }
 * @param {Object} [opts.meta]          - { lang, pageUrl, referrer, utm, tz }
 * @param {Object} [opts.requestContext]- { ip, userAgent } for session tracking
 * @param {boolean}[opts.stream]        - Client's stream preference (may be overridden by config)
 * @param {Function}[opts.onStreamStart]- () => void, called before first chunk
 * @param {Function}[opts.onChunk]      - (text: string) => void, called for each streamed chunk
 * @param {Function}[opts.isCancelled]  - () => boolean, check if client disconnected
 * @returns {Promise<Object>} Result with reply, citations, source, phase, meta, etc.
 */
export async function processMessage({
  messages: rawMessages = [],
  identity = {},
  meta = {},
  requestContext = {},
  stream: streamPref,
  onStreamStart,
  onChunk,
  isCancelled,
} = {}) {
  const started = Date.now();
  const T = makeTimer();
  T.mark("entered");

  const debug = {};

  try {
    // ====== 1. Sanitize messages ======
    const allowedRoles = new Set(["system", "user", "assistant"]);
    const safeMsgs = (Array.isArray(rawMessages) ? rawMessages : [])
      .filter((m) => m && allowedRoles.has(m.role) && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
      .slice(-30);

    // ====== 2. Resolve IDs ======
    let { siteId, sessionId, visitorId } = resolveIds({
      siteId: identity.siteId,
      sessionId: identity.sessionId,
      visitorId: identity.visitorId,
      origin: identity.origin,
    });

    const lastUserMsg = [...safeMsgs].reverse().find((m) => m.role === "user") || null;
    const rawQueryEarly = (lastUserMsg?.content || "").trim();
    const langEarly = detectLangFromText(rawQueryEarly, meta.lang || "ru");

    // ====== 3. Resolve client & config ======
    const clientId = await T.wrap("resolveClientIdStrict", () =>
      resolveClientIdStrict({ clientId: identity.clientId, clientSlug: identity.clientSlug, siteId }),
    );
    const cfg = await T.wrap("getWidgetConfigCached", () =>
      getWidgetConfigCached({ clientId, siteId }),
    );

    // ====== 4. Determine stream mode ======
    let stream = streamPref;
    if (cfg && typeof cfg.stream === "boolean") stream = cfg.stream;
    else if (typeof stream !== "boolean") stream = true;
    // Only actually stream if caller supports it
    const doStream = stream && typeof onChunk === "function";

    // ====== 5. Ensure session ======
    const metaAll = {
      siteId, sessionId, visitorId, clientId,
      pageUrl: meta.pageUrl || meta.referrer || null,
      referrer: meta.referrer || null,
      utm: meta.utm || {}, tz: meta.tz || null, lang: langEarly,
    };
    await T.wrap("ensureSession", () => ensureSession(metaAll, requestContext));

    // ====== 6. Load session doc for replyLang ======
    const sessionDoc = await AiwSession.findOne({ sessionId })
      .select("replyLang langStreak lastDetectedLang lang replyLangUpdatedAt")
      .lean();
    const uiLang = normalizeLang(meta.lang || sessionDoc?.lang || langEarly || "ru");
    const currentReplyLang = normalizeLang(sessionDoc?.replyLang || uiLang || "ru");

    // ====== 7. Prepare query for RAG ======
    const pq = await T.wrap("prepareQueryForRag", () =>
      prepareQueryForRag({ messages: safeMsgs, metaLang: uiLang, currentReplyLang, oai, rewriteModel: "gpt-4o-mini", maxHistory: MAX_HISTORY_FOR_LLM }),
    );
    const { rawQuery, ragQuery: initialRagQuery, llmQuery: initialLlmQuery, lang, detectedUserLang, lastAssistant, complex, followup, shouldSwitchLang, switchToLang, switchConfidence, switchReason } = pq;
    let query = rawQuery;
    let ragQuery = initialRagQuery;
    let llmQuery = initialLlmQuery;

    // ====== 8. Classify intent ======
    let { intentTypes, intentLabel } = classifyRagIntent(rawQuery, lang);
    debug.intentLabel = intentLabel;

    const isFollowUp = pq.followup?.isFollowUpForRetrieval === true;
    console.log("[AIW][followup]", { rawQuery, isFollowUp, kind: followup?.kind });

    // ====== 9. Language switch logic ======
    const detectedNow0 = normalizeLang(detectedUserLang || uiLang, uiLang);
    let replyLangThisTurn = detectedNow0;
    let persistReplyLang = detectedNow0;
    let langReasonFinal = "detected";

    const LOW_SWITCH_CONF = Number(process.env.AIW_LANG_SWITCH_MIN_CONF || 0.8);
    const confNum = Number(switchConfidence ?? 0) || 0;
    let applySwitch = Boolean(shouldSwitchLang && switchToLang);
    if (applySwitch && switchReason === "weak-evidence" && confNum < LOW_SWITCH_CONF) {
      applySwitch = false;
      langReasonFinal = "weak-evidence_clamped";
    }
    if (applySwitch) {
      const target = normalizeLang(switchToLang, detectedNow0);
      replyLangThisTurn = target;
      persistReplyLang = target;
      langReasonFinal = switchReason || "switch";
    }
    if (!applySwitch && shouldSuppressLangSwitchOnShortAnswer({ rawQuery, currentReplyLang, detectedNow: detectedNow0, lastAssistant })) {
      replyLangThisTurn = currentReplyLang;
      persistReplyLang = currentReplyLang;
      langReasonFinal = "short_entity_followup";
    }

    debug.replyLang = replyLangThisTurn;
    debug.detectedLang = detectedNow0;
    debug.langReason = langReasonFinal;

    // Persist replyLang (async)
    defer(() => AiwSession.updateOne({ sessionId }, {
      $set: { replyLang: persistReplyLang, lastDetectedLang: detectedNow0, langStreak: 0, replyLangUpdatedAt: new Date() },
    }));

    // ====== 10. Log user message ======
    if (query) {
      deferTimed(T, "logUserMessage", () => logUserMessage({ siteId, sessionId, content: query, clientId }));
    }

    // ====== 11. Handle empty query ======
    if (!query) {
      const emptyReply = replyLangThisTurn.startsWith("ru") ? "Пустой вопрос" : "Empty question";
      if (doStream) { onStreamStart?.(); onChunk(emptyReply); }
      return {
        reply: emptyReply, citations: [], source: "empty", phase: "empty",
        meta: null, usage: null, goodAnswer: true, confidence: 0.6,
        replyLang: replyLangThisTurn, sessionId, siteId,
        clientId: clientId ? String(clientId) : null,
        streamed: doStream, timings: T.get(), debug,
      };
    }

    // ====== 12. RAG retrieval ======
    const skipRetrieve = followup?.kind === "contact";
    let retrieveRes = { contexts: [] };

    if (skipRetrieve) {
      debug.retrieveMode = "skip-contact";
    } else {
      retrieveRes = await T.wrap("retrieve", async () => {
        try {
          const kDefault = Number(process.env.AIW_KCLIENT || 12);
          const kFollow = Number(process.env.AIW_KCLIENT_FOLLOWUP || 8);
          const r = await retrieveHybrid({ clientId, siteId, query: ragQuery, intentTypes, k: isFollowUp ? kFollow : kDefault });
          const modeBase = isFollowUp ? "hybrid-followup" : "hybrid";
          debug.retrieveMode = r?.contexts?.length ? modeBase : `${modeBase}-empty`;
          return r || { contexts: [] };
        } catch (e) {
          console.warn("[retrieveHybrid]", e?.message || e);
          debug.retrieveMode = "hybrid-error";
          return { contexts: [] };
        }
      });
    }

    const contexts = retrieveRes.contexts || [];
    debug.contextsCount = contexts.length;
    console.log("[AIW] contexts:", contexts.length);

    // ====== 13. Build LLM messages & call LLM ======
    const sys = pickSystemPrompt(cfg, replyLangThisTurn, complex);
    let phase;
    let source;
    let citations = [];
    let messagesForLLM;

    if (!contexts.length) {
      // ---- No context path ----
      phase = skipRetrieve ? "contact" : "no-context";
      source = skipRetrieve ? "contact-llm" : "no-context-llm";
      const dialogTail = safeMsgs.filter((m) => m.role === "user" || m.role === "assistant").slice(-MAX_HISTORY_FOR_LLM);
      const metaContract = skipRetrieve ? CONTACT_META_CONTRACT : NOCTX_META_CONTRACT;
      messagesForLLM = [
        { role: "system", content: sys },
        { role: "system", content: metaContract },
        { role: "system", content: `IMPORTANT: You MUST answer ONLY in ${replyLangThisTurn}.` },
        ...dialogTail,
      ];
      const lastIsUser = dialogTail.length && dialogTail[dialogTail.length - 1].role === "user";
      if (!lastIsUser || (dialogTail[dialogTail.length - 1].content || "").trim() !== llmQuery.trim()) {
        messagesForLLM.push({ role: "user", content: llmQuery });
      }
    } else {
      // ---- RAG path ----
      phase = "rag";
      source = "rag";
      citations = contexts.map((c, i) => ({ idx: i + 1, url: c.url }));
      T.mark("prePrompt");
      messagesForLLM = buildPrompt({
        system: sys, history: safeMsgs, query: llmQuery,
        contexts, maxHistory: MAX_HISTORY_FOR_LLM, complex, replyLangThisTurn,
      });
      T.mark("buildPrompt");
    }

    dumpPromptIfDebug({ label: phase, messages: messagesForLLM, extra: { phase, siteId, sessionId, clientId: clientId ? String(clientId) : null, contextsCount: contexts.length, intentLabel, isFollowUp, replyLangThisTurn, detectedNow0, langReasonFinal } });
    logLLMMessages(phase, messagesForLLM);

    // ====== 14. Call LLM ======
    if (doStream) onStreamStart?.();

    let llmResult;
    try {
      llmResult = await callLLM({ messages: messagesForLLM, stream: doStream, onChunk, isCancelled, replyLang: replyLangThisTurn, T });
    } catch (e) {
      const errMsg = `⚠️ ${e?.message || "LLM error"}`;
      if (doStream && onChunk) onChunk(errMsg);
      llmResult = { reply: errMsg, fullText: errMsg, usage: null, metaParsed: null };
    }

    let { reply, usage, metaParsed } = llmResult;
    if (!reply) reply = defaultNoContextReply(replyLangThisTurn, cfg);

    // ====== 15. Quality assessment ======
    const quick = quickFlag({ phase, contexts, reply });

    // ====== 16. Schedule meta ops ======
    scheduleMetaOps({
      metaNorm: metaParsed, reply, userText: query, contexts, phase,
      siteId, sessionId, visitorId, clientId, replyLang: replyLangThisTurn, T,
    });

    // ====== 17. Log assistant message ======
    const tokensInput = usage?.input ?? null;
    const tokensOutput = usage?.output ?? null;
    const tokensTotal = usage?.total ?? null;
    const costUsd = estimateCostUsd(MODEL, tokensInput, tokensOutput);

    await logAssistantMessage({
      siteId, sessionId, content: reply, latencyMs: Date.now() - started,
      clientId, tokensInput, tokensOutput, tokensTotal, costUsd,
    });

    // ====== 18. Return result ======
    return {
      reply,
      citations,
      source,
      phase,
      meta: metaParsed,
      usage,
      goodAnswer: quick.goodAnswer,
      confidence: quick.confidence,
      replyLang: replyLangThisTurn,
      sessionId,
      siteId,
      clientId: clientId ? String(clientId) : null,
      streamed: doStream,
      timings: T.get(),
      debug,
    };
  } catch (e) {
    console.error("[AIW][core] processMessage error:", e);
    const errReply = `⚠️ ${e?.message || "Internal error"}`;
    if (typeof onChunk === "function") {
      try { onChunk(errReply); } catch {}
    }
    return {
      reply: errReply, citations: [], source: "error", phase: "error",
      meta: null, usage: null, goodAnswer: false, confidence: 0,
      replyLang: "en", sessionId: identity?.sessionId || "unknown",
      siteId: identity?.siteId || "unknown-site",
      clientId: null, streamed: false, timings: T.get(), debug,
    };
  }
}
