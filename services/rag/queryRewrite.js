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

/**
 * Вспомогательная функция: LLM-переписывание запросов для RAG.
 * Пишем "общий" промпт: переписать вопрос в короткий, самодостаточный запрос
 * 
 */
async function rewriteQueryWithLLM({
  oai,
  model,
  rawQuery,
  history = [],
  lang = "en",        // язык вопроса (для инфы)
  targetLang = "en",  // язык, на котором нужен поисковый запрос
}) {
  if (!oai || !rawQuery) return rawQuery;
  if (rawQuery.length > 500) return rawQuery;

  const systemPrompt =
    `You help convert chat questions into short standalone search queries for a retrieval system.\n` +
    `The documents may be in multiple languages.\n` +
    `Rewrite the user's last question into a concise search query in ${targetLang.toUpperCase()}.\n` +
    `Rules:\n` +
    `- Use chat history to restore missing context (e.g. "email" -> "company contact email").\n` +
    `- If the original question is not in ${targetLang}, translate it while keeping meaning.\n` +
    `- Do not explain, output ONLY the query.\n` +
    `- Keep it under 30 words.\n`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6),
    {
      role: "user",
      content:
        `User question (language: ${lang}): """${rawQuery}"""\n\n` +
        `Return ONLY the rewritten search query in ${targetLang.toUpperCase()}.`,
    },
  ];

  try {
    const r = await oai.chat.completions.create({
      model,
      messages,
      temperature: 0.1,
    });

    const out = r.choices?.[0]?.message?.content?.trim();
    if (!out) return rawQuery;
    return out.replace(/^"|"$/g, "");
  } catch (e) {
    console.error("[RAG] rewriteQueryWithLLM error:", e?.message || e);
    return rawQuery;
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
}) {
  const safeMsgs = (Array.isArray(messages) ? messages : []).filter(
    (m) => m && typeof m.content === "string" && m.role
  );

  const lastUser = [...safeMsgs].reverse().find((m) => m.role === "user") || null;
  const lastAssistant =
    [...safeMsgs].reverse().find((m) => m.role === "assistant") || null;

  let rawQuery = (lastUser?.content || "").trim();
  let llmQuery = rawQuery;

  const uiLang = String(metaLang || "ru");
  let lang = detectLangFromText(rawQuery, uiLang);
  if (!lang) lang = uiLang;

  let ragQuery = rawQuery;

  // 1) Короткие подтверждения ("да/ок/ok/sure")
  if (isShortConfirmation(rawQuery) && lastAssistant) {
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
  }

  // 2) Запросы вида "дай пример / examples / use cases"
  if (isExampleFollowup(rawQuery) && lastAssistant) {
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
  const historyForRewrite = safeMsgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-maxHistory);

const searchLang = "en"; 

ragQuery = await rewriteQueryWithLLM({
  oai,
  model: rewriteModel,
  rawQuery: ragQuery,
  history: historyForRewrite,
  lang,        // язык исходного вопроса (ru/en) — для подсказки модели
  targetLang: searchLang,
});

  // DEBUG: логим, что было и что стало
    console.log("[RAG][prepareQueryForRag]", {
      lang,
      rawQuery,
      ragQuery,
      llmQuery,
      isShortConfirmation: isShortConfirmation(rawQuery),
      isExampleFollowup: isExampleFollowup(rawQuery),
    });

  return {
    rawQuery,
    ragQuery,
    llmQuery,
    lang,
    lastUser,
    lastAssistant,
  };
}
