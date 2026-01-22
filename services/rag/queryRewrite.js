// services/rag/queryRewrite.js

/**
 * Очень простая эвристика языка: RU/EN/UK.
 * Если нужно — можно заменить на franc/lingua потом.
 */
export function detectLangFromText(text, fallback = "ru") {
  const t = (text || "").toLowerCase();

  // украинские специфические буквы
  if (/[іїєґ]/i.test(t)) return "uk";

  if (/[а-яё]/i.test(t)) return "ru";
  if (/[a-z]/i.test(t)) return "en";
  return fallback;
}


export function isShortConfirmation(text) {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return false;

  // если есть вопросительный знак — это почти всегда НЕ ack
  if (q.includes("?")) return false;

  // убираем только завершающую пунктуацию (но НЕ запятые внутри)
  const cleaned = q.replace(/[!.…]+$/g, "").trim();

  // ВАЖНО: ack должен быть "вся строка = ack", а не "начинается с ack"
  const ACK = new Set([
    // RU
    "да", "ага", "ок", "оки", "хорошо", "ладно", "давай", "поехали",
    // EN
    "yes", "yep", "yeah", "ok", "okay", "sure", "go", "let's go", "lets go"
  ]);

  if (ACK.has(cleaned)) return true;

  // Допускаем супер-короткие сочетания типа "ок давай" / "да ок" (2 слова)
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) {
    const joined = parts.join(" ");
    const ALLOW_2 = new Set([
      "ок давай", "да ок", "давай ок", "ok go", "ok sure"
    ]);
    if (ALLOW_2.has(joined)) return true;
  }

  return false;
}

export function isExampleFollowup(text = "") {
  const t = text.trim().toLowerCase();
  if (!t) return false;

  // 1) Однословные
  const singleWords = [
    "пример",
    "примеры",
    "примерчик",
    "example",
    "examples",
    "use case",
    "use cases",
  ];
  if (singleWords.includes(t)) return true;

  // 2) Типичные фразы
  const phrases = [
    // RU
    "дай пример",
    "дай примеры",
    "можно пример",
    "можно примеры",
    "приведи пример",
    "приведи примеры",
    "какие примеры",
    "несколько примеров",
    "типичные примеры",
    "типичные кейсы",
    "реальные кейсы",
    "реальные примеры",
    "примеры кейсов",
    "примеры случаев",
    "в каких случаях",
    "в каких ситуациях",

    // EN
    "give me an example",
    "give me some examples",
    "give examples",
    "any examples",
    "some examples",
    "show me an example",
    "show me examples",
    "use case",
    "use cases",
    "typical cases",
    "typical scenarios",
    "real cases",
    "real examples",
    "sample campaign",
    "sample scenario",
  ];
  if (phrases.some((p) => t.includes(p))) return true;

  // 3) Короткие вопросы с ключевыми словами
  if (
    t.length <= 80 &&
    /пример|примеры|примеров|examples?|use cases?|cases?|scenarios?/.test(t)
  ) {
    return true;
  }

  return false;
}

function extractEmailFromText(s = "") {
  const t = String(s || "");
  const m = t.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return m ? m[0] : "";
}

function extractPhoneFromText(s = "") {
  const t = String(s || "");
  // ловим “телефон внутри фразы”
  const m = t.match(/(\+?\d[\d\s().\-]{6,}\d)/);
  if (!m) return "";
  const cand = m[1].trim();
  const digits = (cand.match(/\d/g) || []).length;
  if (digits < 7) return "";
  if (cand.length > 40) return "";
  return cand;
}

function hasContactHint(s = "") {
  return !!(extractEmailFromText(s) || extractPhoneFromText(s));
}

function normalizeForContains(s = "") {
  return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}

function containsNormalized(haystack, needle) {
  const h = normalizeForContains(haystack);
  const n = normalizeForContains(needle);
  return !!n && h.includes(n);
}

export function countWords(text = "") {
  const t = String(text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function stripForAnchor(s = "") {
  return String(s || "")
    .replace(/```[\s\S]*?```/g, " ")     // code blocks
    .replace(/`([^`]+)`/g, "$1")         // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // bold
    .replace(/\*([^*]+)\*/g, "$1")       // italic
    .replace(/\s+/g, " ")
    .trim();
}

function buildAssistantAnchor(lastAssistantText = "", maxLen = 220) {
  const t = stripForAnchor(lastAssistantText);
  if (!t) return "";
  // берем 1-2 первые фразы (по точке/вопросу/восклицанию)
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const anchor = (parts.slice(0, 2).join(" ") || t).trim();
  return anchor.length > maxLen ? anchor.slice(0, maxLen).trim() : anchor;
}

function isShortChoiceAnswer(rawQuery = "", lastAssistantText = "") {
  const q = String(rawQuery || "").trim();
  if (!q) return false;

  // если вопросительный знак — это уже не "ответ-выбор"
  if (q.includes("?")) return false;

  // слишком длинно — не choice
  if (countWords(q) > 6) return false;

  // должно быть похоже на перечисление/варианты
  const looksLikeList = /,|\/|;|\n/.test(q) || countWords(q) >= 2;
  if (!looksLikeList) return false;

  // у ассистента должен быть явный вопрос/выбор
  const a = String(lastAssistantText || "");
  const assistantAsks = /\?\s*$|\?\s*\n/.test(a) || /какой|какая|какие|choose|which|what.*(platform|channel)/i.test(a);
  if (!assistantAsks) return false;

  return true;
}


function safeBlock(s="") {
  return String(s).replace(/"""/g, '"""'); 
}

function normalizeLang(code, fallback = "en") {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return fallback;
  const short = c.split(/[-_]/)[0];
  return short || fallback;
}

async function rewriteAndClassifyQuery({
  oai,
  model,
  rawQuery,      // исходный текст пользователя
  ragQueryBase,  // базовый текст для переписывания (может уже быть модифицирован)
  history = [],
  lastAssistantText = "",
  lang = "en",
  targetLang = "en",
  currentReplyLang = null,  
}) {

const fallback = {
  searchQuery: ragQueryBase || rawQuery || "",
  isComplex: false,
  taskTypes: ["other"],
  detectedUserLang: lang || "en",
  confidence: 0.0,
  requestedReplyLang: null,
  requestedEvidence: null,
  reason: "uncertain",

  // ✅ решение о переключении replyLang
  shouldSwitch: false,
  replyLang: null,
  switchConfidence: 0.0,
  switchEvidence: null,
  switchReason: "uncertain",

  // ✅ follow-up decision 
  followupKind: "none",
  isFollowUpForRetrieval: false,
  followupConfidence: 0.0,
  followupReason: "fallback",
};




  if (!oai) return fallback;
  if (!rawQuery) return fallback;

  // очень длинные запросы не переписываем, чтобы не жечь токены
  if (rawQuery.length > 800) return fallback;

const systemPrompt =
  `You help a retrieval-augmented assistant.\n` +
  `Return ONLY valid JSON with this exact shape:\n` +
  `{\n` +
  `  "searchQuery": "string",\n` +
  `  "isComplex": true|false,\n` +
  `  "taskTypes": ["numeric_reasoning"|"planning"|"comparison"|"multi_step"|"other"],\n` +
  `  "detectedUserLang": "string",\n` +
  `  "confidence": 0.0,\n` +
  `  "requestedReplyLang": "string|null",\n` +
  `  "requestedEvidence": "string|null",\n` +
  `  "reason": "explicit_request"|"detected"|"uncertain",\n` +
  `  "shouldSwitch": true|false,\n` +
  `  "replyLang": "string|null",\n` +
  `  "switchConfidence": 0.0,\n` +
  `  "switchEvidence": null,\n` +
  `  "switchReason": "explicit_request"|"clear_other_language"|"uncertain",\n` +
  `  "followupKind": "ack|examples|clarify|entity|new_question|contact|none",\n` +
  `  "isFollowUpForRetrieval": true|false,\n` +
  `  "followupConfidence": 0.0,\n` +
  `  "followupReason": "string"\n` +
  `}\n\n` +
  `CRITICAL RULES:\n` +
  `- Determine detectedUserLang, requestedReplyLang, and switching fields using ONLY the user's LAST message (rawQuery). Ignore history for language.\n` +
  `- You may use history ONLY to create a better searchQuery.\n` +
  `- requestedReplyLang must be set ONLY if rawQuery explicitly asks to reply in a language.\n` +
  `- If requestedReplyLang is set, requestedEvidence MUST be an exact short substring taken from rawQuery proving the request.\n` +
  `- shouldSwitch is about changing the assistant's persistent reply language for future messages.\n` +
  `- Only set shouldSwitch=true if user clearly writes in another language OR explicitly asks to switch language.\n` +
  `- If shouldSwitch=true, replyLang MUST be ISO-639-1 ("en","ru","de"...).\n` +
  `- If shouldSwitch=true, switchEvidence MUST be an exact substring from rawQuery (5–30 chars) that proves it.\n` +
  `- If unsure, set shouldSwitch=false and switchReason="uncertain".\n` +
  `- searchQuery must be a concise standalone query in ${targetLang.toUpperCase()}.\n` +
  `- Output JSON only.\n` +
  `- followupKind/isFollowUpForRetrieval: decide using rawQuery + LAST_ASSISTANT only (if provided).\n` +
  `- isFollowUpForRetrieval=true ONLY when the user is responding to the assistant's prior question/request with a short answer/choice/confirmation.\n` +
  `- If rawQuery contains email/phone -> followupKind="contact" and isFollowUpForRetrieval=false.\n` +
  `- If user introduces a new question/topic -> followupKind="new_question" and isFollowUpForRetrieval=false.\n` +
  `- If unsure -> followupKind="none", isFollowUpForRetrieval=false.\n`;


  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6),
{
  role: "user",
  content:
  `currentReplyLang="${currentReplyLang || targetLang}"\n` + 
  `User last question (language: ${lang}):\n` +
  `"""${safeBlock(rawQuery)}"""\n\n` +
`LAST_ASSISTANT (may be empty):\n` +
`"""${safeBlock(lastAssistantText || history?.slice(-6).reverse().find(m => m.role === "assistant")?.content || "")}"""\n\n` +
  `Base query text for search rewriting (may contain extra hints):\n` +
  `"""${safeBlock(ragQueryBase || rawQuery)}"""\n\n` +
  `Return ONLY the JSON object.`,
},

  ];

  try {
    const r = await oai.chat.completions.create({
      model,
      messages,
      // temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const txt = r.choices?.[0]?.message?.content?.trim() || "";
    if (!txt) return fallback;

    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch {
      return fallback;
    }

console.log("[RAG][rewrite][llm_lang_fields]", {
  rawQuery: String(rawQuery || "").slice(0, 140),

  // what model returned
  detectedUserLang: parsed?.detectedUserLang,
  requestedReplyLang: parsed?.requestedReplyLang,
  requestedEvidence: parsed?.requestedEvidence,
  reason: parsed?.reason,

  shouldSwitch: parsed?.shouldSwitch,
  replyLang: parsed?.replyLang,
  switchConfidence: parsed?.switchConfidence,
  switchEvidence: parsed?.switchEvidence,
  switchReason: parsed?.switchReason,

  // optional
  keys: Object.keys(parsed || {}).sort(),
});



const searchQuery = String(parsed.searchQuery || fallback.searchQuery);
const isComplex = Boolean(parsed.isComplex);
const taskTypes = Array.isArray(parsed.taskTypes) && parsed.taskTypes.length
  ? parsed.taskTypes.map(String)
  : ["other"];
const followupKind = String(parsed.followupKind || fallback.followupKind);
const isFollowUpForRetrieval = parsed.isFollowUpForRetrieval === true;
const followupConfidence = Math.max(0, Math.min(1, Number(parsed.followupConfidence) || 0));
const followupReason = String(parsed.followupReason || fallback.followupReason);

let followupKindSafe = followupKind;
let isFollowUpForRetrievalSafe = isFollowUpForRetrieval;

// hard rules on server side
if (hasContactHint(rawQuery)) {
  followupKindSafe = "contact";
  isFollowUpForRetrievalSafe = false;
}
if (!lastAssistantText) {
  // без lastAssistant follow-up retrieval смысла нет
  if (followupKindSafe !== "contact") followupKindSafe = "none";
  isFollowUpForRetrievalSafe = false;
}

const detectedUserLang = String(parsed.detectedUserLang || fallback.detectedUserLang).toLowerCase();
const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));

let reason = String(parsed.reason || fallback.reason);
let requestedReplyLang = null;
let requestedEvidence = null;
reason = "detected"; 

// ✅ switch fields
let shouldSwitch = Boolean(parsed.shouldSwitch);
let replyLang =
  parsed.replyLang == null ? null : String(parsed.replyLang).toLowerCase();
let switchConfidence = Math.max(0, Math.min(1, Number(parsed.switchConfidence) || 0));
let switchEvidence =
  parsed.switchEvidence == null ? null : String(parsed.switchEvidence);
let switchReason = String(parsed.switchReason || fallback.switchReason);

// ✅ server-side validation (switchEvidence must be substring if shouldSwitch)
if (shouldSwitch) {
  if (!replyLang) replyLang = detectedUserLang;
  replyLang = normalizeLang(replyLang, detectedUserLang);

  if (!switchEvidence || !containsNormalized(rawQuery, switchEvidence)) {
    // не рубим в ноль: понижаем confidence, но оставляем возможность streak
    switchConfidence = Math.min(switchConfidence || 0.55, 0.55);
    switchReason = "weak-evidence";
  }
  // clamp evidence length (чтобы модель не выдавала огромные куски)
  if (switchEvidence && switchEvidence.length > 60) {
    switchEvidence = switchEvidence.slice(0, 60);
  }
} else {
  replyLang = null;
  switchEvidence = null;
  switchConfidence = 0.0;
}

return {
  searchQuery,
  isComplex,
  taskTypes,
  detectedUserLang,
  confidence,
  requestedReplyLang,
  requestedEvidence,
  reason,

  shouldSwitch,
  replyLang,
  switchConfidence,
  switchEvidence,
  switchReason,
followupKind: followupKindSafe,
isFollowUpForRetrieval: isFollowUpForRetrievalSafe,
followupConfidence,
followupReason,
};
  } catch (e) {
    console.error("[RAG] rewriteAndClassifyQuery error:", e?.message || e);
    return fallback;
  }
}

async function judgeFollowupLLM({
  oai,
  model,
  rawQuery,
  lastAssistantText,
  lastUserText,
  metaLang,
  currentReplyLang,
}) {
  const q = String(rawQuery || "").trim();
  const a = String(lastAssistantText || "").trim();
  const u = String(lastUserText || "").trim();

  // 0) Hard guardrail: contact => not follow-up for retrieval
  if (hasContactHint(q)) {
    return {
      kind: "contact",
      isFollowUpForRetrieval: false,
      confidence: 0.95,
      reason: "contact_hint",
    };
  }

  // 1) Если ассистента до этого не было — точно не follow-up
  if (!a) {
    return {
      kind: "none",
      isFollowUpForRetrieval: false,
      confidence: 0.9,
      reason: "no_last_assistant",
    };
  }

  // 2) Fallback эвристики (быстро и бесплатно)
  // (оставляем как запасной парашют)
  if (isShortConfirmation(q)) {
    return {
      kind: "ack",
      isFollowUpForRetrieval: true,
      confidence: 0.85,
      reason: "heuristic_ack",
    };
  }
  if (isExampleFollowup(q)) {
    return {
      kind: "examples",
      isFollowUpForRetrieval: true,
      confidence: 0.75,
      reason: "heuristic_examples",
    };
  }

  // 3) Если нет OpenAI — возвращаем “обычное”
  if (!oai) {
    return {
      kind: "none",
      isFollowUpForRetrieval: false,
      confidence: 0.6,
      reason: "no_oai",
    };
  }

  // 4) LLM judge (короткий, JSON-only)
  const system = [
    "You are a classifier for chat follow-ups for RAG retrieval.",
    "Return ONLY a valid JSON object. No markdown. No extra text.",
    "Decide if the user's last message is a follow-up to the assistant's last message.",
    "We care about retrieval behavior:",
    "- Follow-up for retrieval ONLY when the user is providing a short answer/choice/confirmation to the assistant's prior question or request.",
    "- NOT a follow-up for retrieval when the user introduces a new question/topic or provides contact details.",
    "",
    'Output JSON with keys: {"kind":"ack|examples|clarify|entity|new_question|contact|none","isFollowUpForRetrieval":true|false,"confidence":0..1,"reason":"short"}',
  ].join("\n");

  const user = [
    `metaLang=${String(metaLang || "")}`,
    `currentReplyLang=${String(currentReplyLang || "")}`,
    "",
    "LAST_ASSISTANT:",
    a.slice(0, 600),
    "",
    "LAST_USER:",
    u.slice(0, 400),
    "",
    "CURRENT_USER_MESSAGE:",
    q.slice(0, 400),
  ].join("\n");

  try {
    const r = await oai.chat.completions.create({
      model: model || "gpt-4o-mini",
      temperature: 0,
      max_tokens: 120,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const txt = r?.choices?.[0]?.message?.content || "";
    const obj = JSON.parse(txt);

    const kind = String(obj?.kind || "none");
    const isFollowUpForRetrieval = obj?.isFollowUpForRetrieval === true;
    const confidence = Math.max(0, Math.min(1, Number(obj?.confidence) || 0));
    const reason = String(obj?.reason || "llm");

    // safety: contact always forces false
    if (kind === "contact") {
      return { kind, isFollowUpForRetrieval: false, confidence: Math.max(confidence, 0.8), reason };
    }

    return { kind, isFollowUpForRetrieval, confidence, reason };
  } catch (e) {
    return {
      kind: "none",
      isFollowUpForRetrieval: false,
      confidence: 0.5,
      reason: `llm_error:${e?.message || "err"}`.slice(0, 60),
    };
  }
}


/**
 * Главная функция для контроллера:
 * - достаёт lastUser / lastAssistant
 * - детектирует lang
 * - строит query / ragQuery / llmQuery
 * - делает LLM-переформулирование ragQuery (любой язык)
 */
export async function prepareQueryForRag({
  messages = [],
  metaLang = "ru",
  oai = null,
  rewriteModel = "gpt-4o-mini",
  maxHistory = 8,
  currentReplyLang = null,       
}) {
  const safeMsgs = (Array.isArray(messages) ? messages : []).filter(
    (m) => m && typeof m.content === "string" && m.role
  );

  const lastUser = [...safeMsgs].reverse().find((m) => m.role === "user") || null;
  const lastAssistant =
    [...safeMsgs].reverse().find((m) => m.role === "assistant") || null;
console.log("[DEBUG][rawUserInput]", lastUser?.content?.slice(0, 300));
  let rawQuery = (lastUser?.content || "").trim();
  let llmQuery = rawQuery;

  const uiLang = normalizeLang(metaLang || "ru", "ru");
  const current = normalizeLang(currentReplyLang || uiLang, uiLang);

  let lang = detectLangFromText(rawQuery, uiLang);
  if (!lang) lang = uiLang;

let ragQuery = rawQuery;

let followup = {
  kind: "none",
  isFollowUpForRetrieval: false,
  confidence: 0.6,
  reason: "default",
};

const lastAssistantText = String(lastAssistant?.content || "");

if (lastAssistant) {
  // 1) CONTACT — всегда самый высокий приоритет
  if (hasContactHint(rawQuery)) {
    followup = {
      kind: "contact",
      isFollowUpForRetrieval: false,
      confidence: 0.95,
      reason: "contact_hint",
    };
  }
  // 2) ACK
  else if (isShortConfirmation(rawQuery)) {
    followup = {
      kind: "ack",
      isFollowUpForRetrieval: true,
      confidence: 0.85,
      reason: "heuristic_ack",
    };
  }
  // 3) EXAMPLES
  else if (isExampleFollowup(rawQuery)) {
    followup = {
      kind: "examples",
      isFollowUpForRetrieval: true,
      confidence: 0.75,
      reason: "heuristic_examples",
    };
  }
  // 4) CHOICE / ENTITY ANSWER (youtube, tiktok)
  else if (isShortChoiceAnswer(rawQuery, lastAssistantText)) {
    followup = {
      kind: "entity",
      isFollowUpForRetrieval: true,
      confidence: 0.72,
      reason: "heuristic_choice_answer",
    };
  }
}
// specialMode теперь определяется ТОЛЬКО judge'ом
const specialMode = {
  ack: followup?.kind === "ack" && !!lastAssistant,
  examples: followup?.kind === "examples" && !!lastAssistant,
  contact: followup?.kind === "contact" && !!lastAssistant,
  entity: followup?.kind === "entity" && !!lastAssistant,
};

// CONTACT: не делаем поисковый запрос по email/телефону.
// Лучше держать тему на якоре последнего ассистента.
if (specialMode.contact && lastAssistant) {
  ragQuery = buildAssistantAnchor(lastAssistant.content, 220) || "";
  // llmQuery оставляем как есть: контроллеру/мета-логике нужен rawQuery
}

// ENTITY/CHOICE: "youtube, tiktok" — тоже лучше искать по предыдущему якорю + самим вариантам
if (specialMode.entity && lastAssistant) {
  const anchor = buildAssistantAnchor(lastAssistant.content, 180);
  ragQuery = [anchor, rawQuery].filter(Boolean).join(" — ").slice(0, 260);
}

// 1) Короткие подтверждения ("да/ок/ok/sure")
if (specialMode.ack && lastAssistant) {
  llmQuery =
    `The user replied "${rawQuery}" as a short confirmation and wants you to PROCEED ` +
    `with your previous suggestion.\n\n` +
    `Your previous message was:\n"""${lastAssistant.content}"""\n\n` +
    `IMPORTANT:\n` +
    `- Do NOT repeat the same descriptions again.\n` +
    `- Assume the user already knows what you wrote before.\n` +
    `- Take the NEXT logical step of that suggestion.\n` +
    `- Either ask 1–2 clarifying questions about their goals/budget/niche,\n` +
    `  or propose a concrete next action.`;

// ✅ важно: не ищем по "ок/да"
// Берем короткий якорь из последнего ассистента (1–2 фразы)
ragQuery = buildAssistantAnchor(lastAssistant.content, 220) || rawQuery;
}

  // 2) Запросы вида "дай пример / examples / use cases"
if (specialMode.examples && lastAssistant) {
  ragQuery =
    `The user is asking for examples related to your previous suggestion.\n` +
    `Previous assistant message:\n"""${lastAssistant.content}"""\n`;

  llmQuery =
    `The user is asking for examples of what you suggested earlier.\n` +
    `Original user question: "${rawQuery}".\n` +
    `Please give examples or describe typical cases, based ONLY on CONTEXT.\n` +
    `Answer in the same language as the user's last question.`;
}

  // 3) Всегда пытаемся чуть-чуть улучшить ragQuery через дешёвую модель
  // 3) LLM: переписать запрос для RAG + классифицировать сложность
  const historyForRewrite = safeMsgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-maxHistory);

// RAG search query always in English (documents are EN)
let targetLang = "en";

let out = {
  searchQuery: ragQuery,
  isComplex: false,
  taskTypes: ["other"],
  detectedUserLang: normalizeLang(lang, targetLang),
  confidence: 0.0,
  requestedReplyLang: null,
  requestedEvidence: null,
  reason: "uncertain",

  shouldSwitch: false,
  replyLang: null,
  switchConfidence: 0.0,
  switchEvidence: null,
  switchReason: "uncertain",
};

// ✅ ВАЖНО: переписываем ragQuery только если это НЕ ack/examples
if (!specialMode.ack && !specialMode.examples) {
  const lastAssistantText = lastAssistant?.content || "";

  console.log("[RAG][followup][debug] lastAssistantText", {
    hasLastAssistant: !!lastAssistant,
    len: lastAssistantText.length,
    preview: lastAssistantText.slice(0, 160),
  });


out = await rewriteAndClassifyQuery({
  oai,
  model: rewriteModel,
  rawQuery,
  ragQueryBase: ragQuery,
  history: historyForRewrite,
  lastAssistantText: lastAssistant?.content || "",
  lang,
  targetLang,
  currentReplyLang: current,
});

  ragQuery = out.searchQuery;

  // если эвристика не определила followup — берём из того же LLM-вызова rewrite
if (followup.kind === "none" && lastAssistant) {
  followup = {
    kind: out.followupKind || "none",
    isFollowUpForRetrieval: out.isFollowUpForRetrieval === true,
    confidence: Number(out.followupConfidence ?? 0.6),
    reason: out.followupReason || "llm",
  };

  // safety: contact всегда forces false
  if (followup.kind === "contact") followup.isFollowUpForRetrieval = false;
}
} else {
  // спец-режимы: ragQuery уже собран выше, LLM-рефрайт не нужен
  // (и токены экономим)
}

const {
  searchQuery,
  isComplex,
  taskTypes,
  detectedUserLang,
  confidence,
  requestedReplyLang,
  requestedEvidence,
  reason,

  shouldSwitch,
  replyLang,
  switchConfidence,
  switchEvidence,
  switchReason,
} = out;

  // DEBUG: логируем, что было и что стало
  console.log("[RAG][prepareQueryForRag]", {
    lang,
    rawQuery,
    ragQuery,
    llmQuery,
    detectedUserLang,
    requestedEvidence,
    confidence,
    requestedReplyLang,
    reason,
    isShortConfirmation: isShortConfirmation(rawQuery),
    isExampleFollowup: isExampleFollowup(rawQuery),
    complex: { isComplex, taskTypes },
  });

return {
  rawQuery,
  ragQuery,
  llmQuery,
  lang,
  lastUser,
  lastAssistant,
  followup,

  detectedUserLang,
  requestedEvidence,
  langConfidence: confidence,
  requestedReplyLang,
  langReason: reason,

  // ✅ решение о переключении persistent replyLang
  shouldSwitchLang: shouldSwitch,
  switchToLang: replyLang,
  switchConfidence,
  switchEvidence,
  switchReason,

  complex: { isComplex, taskTypes },
};
}

