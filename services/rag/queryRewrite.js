// services/rag/queryRewrite.js

/**
 * Очень простая эвристика языка: RU/EN.
 * Если нужно — можно заменить на franc/lingua потом.
 */
export function detectLangFromText(text, fallback = "ru") {
  const t = (text || "").toLowerCase();
  if (/[а-яё]/i.test(t)) return "ru";
  if (/[a-z]/i.test(t)) return "en";
  return fallback;
}

export function isShortConfirmation(text) {
  const q = (text || "").trim().toLowerCase();
  if (!q) return false;

  const variants = [
    // EN
    "yes", "yep", "yeah", "sure",
    "ok", "okay",
    "go", "let's go", "let's do it",

    // RU
    "да", "ага", "угу",
    "ок", "окей",
    "давай", "поехали", "го",
  ];

  return variants.some((w) =>
    q === w ||
    q.startsWith(w + "!") ||
    q.startsWith(w + ".") ||
    q.startsWith(w + ",")
  );
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
    "for example",
    "for instance",
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

function safeBlock(s="") {
  return String(s).replace(/"""/g, '"""'); 
}

function normalizeLang(code, fallback = "en") {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return fallback;
  const short = c.split(/[-_]/)[0];
  return short || fallback;
}

// export async function judgeLanguageSwitchLLM({ oai, model = "gpt-4o-mini", rawQuery, currentReplyLang }) {
//   if (!oai || !rawQuery) return { shouldSwitch: false, confidence: 0, reason: "no-oai" };

//   const sys =
// `You decide if the assistant should SWITCH its persistent reply language for future messages.
// Return ONLY JSON:
// {"shouldSwitch":true|false,"replyLang":"xx","confidence":0..1,"reason":"...","evidence":"..."} 

// Rules:
// - Use ONLY the user's last message (rawQuery). Ignore any chat history.
// - Switch only if user clearly writes in another language OR explicitly requests it.
// - evidence must be copied EXACTLY from rawQuery (no added quotes, no changes).
// - evidence must be 5–30 characters, and should be a plain fragment of rawQuery.
// - replyLang must be ISO-639-1 like "en","ru","de","es"...`;

//   const msgs = [
//     { role: "system", content: sys },
//     { role: "user", content:
// `currentReplyLang="${currentReplyLang}"
// rawQuery="""${safeBlock(rawQuery)}"""
// Return JSON only.` }
//   ];

//   try {
//     const r = await oai.chat.completions.create({
//       model,
//       messages: msgs,
//       response_format: { type: "json_object" },
//     });

//     const txt = r.choices?.[0]?.message?.content || "{}";
//     const j = JSON.parse(txt);

//     const shouldSwitch = !!j.shouldSwitch;
//     const replyLang = normalizeLang(j.replyLang || currentReplyLang, currentReplyLang);
//     const confidence = Math.max(0, Math.min(1, Number(j.confidence) || 0));
//     const evidence = String(j.evidence || "").trim();
//     const reason = String(j.reason || "");

//     // жёсткая проверка evidence, чтобы не было “из воздуха”
// if (shouldSwitch && (!evidence || !containsNormalized(rawQuery, evidence))) {
//   // не режем полностью, а понижаем доверие (иначе streak никогда не накопится)
//   return { shouldSwitch: true, replyLang, confidence: Math.min(confidence || 0.55, 0.55), reason: "weak-evidence", evidence };
// }

//     return { shouldSwitch, replyLang, confidence, reason, evidence };
//   } catch (e) {
//     console.error("[AIW][langJudge] error:", e?.message || e);
//     return { shouldSwitch: false, replyLang: currentReplyLang, confidence: 0.0, reason: "judge-error" };
//   }
// }


/**
 * Новый помощник: переписать запрос ДЛЯ ПОИСКА + классифицировать сложность.
 * Возвращает объект:
 * {
 *   searchQuery: string,   // финальный запрос для RAG-поиска
 *   isComplex: boolean,    // true, если нужен нетривиальный анализ/расчёты
 *   taskTypes: string[],   // ["numeric_reasoning", "planning", "comparison", ...]
 * }
 */
async function rewriteAndClassifyQuery({
  oai,
  model,
  rawQuery,      // исходный текст пользователя
  ragQueryBase,  // базовый текст для переписывания (может уже быть модифицирован)
  history = [],
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
  `  "switchReason": "explicit_request"|"clear_other_language"|"uncertain"\n` +
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
  `- Output JSON only.`;


  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6),
{
  role: "user",
  content:
    `currentReplyLang="${currentReplyLang || targetLang}"\n` + 
    `User last question (language: ${lang}):\n` +
    `"""${safeBlock(rawQuery)}"""\n\n` +
    `Base query text for search rewriting (may contain extra hints):\n` +
    `"""${safeBlock(ragQueryBase || rawQuery)}"""\n\n` +
    `Documents may be in multiple languages.\n` +
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

const searchQuery = String(parsed.searchQuery || fallback.searchQuery);
const isComplex = Boolean(parsed.isComplex);
const taskTypes = Array.isArray(parsed.taskTypes) && parsed.taskTypes.length
  ? parsed.taskTypes.map(String)
  : ["other"];

const detectedUserLang = String(parsed.detectedUserLang || fallback.detectedUserLang).toLowerCase();
const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));

// const requestedReplyLang =
//   parsed.requestedReplyLang == null ? null : String(parsed.requestedReplyLang).toLowerCase();

// const requestedEvidence =
//   parsed.requestedEvidence == null ? null : String(parsed.requestedEvidence);

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

// ✅ server-side validation (убиваем “галлюцинации” explicit_request)
// if (requestedReplyLang) {
//   if (!requestedEvidence || !containsNormalized(rawQuery, requestedEvidence)) {
//     reason = "uncertain";
//     // сброс explicit
//     return {
//       ...fallback,
//       searchQuery,
//       isComplex,
//       taskTypes,
//       detectedUserLang,
//       confidence,
//       requestedReplyLang: null,
//       requestedEvidence: null,
//       reason,

//       // switch тоже сбросим в fallback (чтобы не было конфликтов)
//       shouldSwitch: false,
//       replyLang: null,
//       switchConfidence: 0.0,
//       switchEvidence: null,
//       switchReason: "uncertain",
//     };
//   }
// }

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
};
  } catch (e) {
    console.error("[RAG] rewriteAndClassifyQuery error:", e?.message || e);
    return fallback;
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
  const specialMode = {
  ack: isShortConfirmation(rawQuery) && !!lastAssistant,
  examples: isExampleFollowup(rawQuery) && !!lastAssistant,
};

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

  // ✅ важно: не ищем по "ок/да", иначе retrieval мусорный
  // Берём кусок предыдущего ассистента как “якорь” для поиска.
  ragQuery = String(lastAssistant.content || "").slice(0, 500).trim() || rawQuery;
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

// ✅ dynamic targetLang: ищем на языке пользователя (если уверенность норм), иначе на uiLang
let targetLang = normalizeLang(lang, normalizeLang(uiLang, "ru"));

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
  out = await rewriteAndClassifyQuery({
    oai,
    model: rewriteModel,
    rawQuery,
    ragQueryBase: ragQuery,
    history: historyForRewrite,
    lang,
    targetLang, 
    currentReplyLang: current, 
  });

  ragQuery = out.searchQuery;
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

