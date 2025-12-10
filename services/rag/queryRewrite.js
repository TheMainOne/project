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
}) {
  const fallback = {
    searchQuery: ragQueryBase || rawQuery || "",
    isComplex: false,
    taskTypes: ["other"],
  };

  if (!oai) return fallback;
  if (!rawQuery) return fallback;

  // очень длинные запросы не переписываем, чтобы не жечь токены
  if (rawQuery.length > 800) return fallback;

  const systemPrompt =
    `You help a retrieval-augmented assistant in two ways:\n` +
    `1) Rewrite the user's question into a short standalone SEARCH QUERY in ${targetLang.toUpperCase()}.\n` +
    `2) Classify whether the question requires complex reasoning.\n\n` +
    `Return ONLY a valid JSON object with the following shape:\n` +
    `{\n` +
    `  "searchQuery": "string",             // concise search query in ${targetLang.toUpperCase()}\n` +
    `  "isComplex": true or false,         // true if the assistant must do multi-step or numeric reasoning\n` +
    `  "taskTypes": [                      // list of reasoning types that apply\n` +
    `    "numeric_reasoning" |             // user asks to calculate, estimate, check if budget is enough, etc.\n` +
    `    "planning" |                      // user asks to design a plan, roadmap, strategy\n` +
    `    "comparison" |                    // user compares options, tariffs, scenarios\n` +
    `    "multi_step" |                    // clearly needs several logical steps/decisions\n` +
    `    "other"\n` +
    `  ]\n` +
    `}\n\n` +
    `Guidelines:\n` +
    `- "searchQuery" must be short, standalone, and suitable for semantic search in ${targetLang.toUpperCase()}.\n` +
    `- Use chat history to restore missing context (e.g. "email" -> "company contact email").\n` +
    `- If the original question is not in ${targetLang}, translate it while preserving meaning.\n` +
    `- If you're unsure whether it's complex, use "isComplex": false and ["other"].\n`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6),
    {
      role: "user",
      content:
        `User last question (language: ${lang}):\n` +
        `"""${rawQuery}"""\n\n` +
        `Base query text for search rewriting (may contain extra hints):\n` +
        `"""${ragQueryBase || rawQuery}"""\n\n` +
        `Documents may be in multiple languages.\n` +
        `Return ONLY the JSON object.`,
    },
  ];

  try {
    const r = await oai.chat.completions.create({
      model,
      messages,
      temperature: 0.1,
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

    return { searchQuery, isComplex, taskTypes };
  } catch (e) {
    console.error("[RAG] rewriteAndClassifyQuery error:", e?.message || e);
    return fallback;
  }
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
  // 3) LLM: переписать запрос для RAG + классифицировать сложность
  const historyForRewrite = safeMsgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-maxHistory);

  const searchLang = "en";

  const { searchQuery, isComplex, taskTypes } = await rewriteAndClassifyQuery({
    oai,
    model: rewriteModel,
    rawQuery,      // исходный текст пользователя
    ragQueryBase: ragQuery,  // может быть уже модифицирован под примеры/подтверждения
    history: historyForRewrite,
    lang,          // ru/en — просто инфа для модели
    targetLang: searchLang,
  });

  ragQuery = searchQuery;

  // DEBUG: логируем, что было и что стало
  console.log("[RAG][prepareQueryForRag]", {
    lang,
    rawQuery,
    ragQuery,
    llmQuery,
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
    complex: { isComplex, taskTypes },
  };
}

