const DEFAULT_MODEL = process.env.BUSINESS_YOUTUBE_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const DESCRIPTION_MAX_CHARS = 2500;

function toCleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value, maxChars) {
  const text = toCleanString(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}\u2026`;
}

function normalizeStringArray(value, fallback = []) {
  const items = Array.isArray(value) ? value : fallback;
  return items.map((item) => toCleanString(item)).filter(Boolean).slice(0, 8);
}

function normalizeUsefulnessRating(value) {
  return ["high", "medium", "low"].includes(value) ? value : "medium";
}

export function buildFallbackAnalysisFromMetadata(video, reason = "") {
  const description = truncateText(video.description, 600);
  const title = toCleanString(video.title);

  return {
    status: "fallback",
    model: "",
    generatedAt: new Date(),
    summary: description || `Видео "${title}" найдено, но полный анализ ограничен доступными метаданными.`,
    mainIdeas: [
      title ? `Разобрать тему видео: ${title}` : "Разобрать тему видео по доступным метаданным.",
      "Проверить, какие идеи можно перенести в текущие продажи, сервис или операционку.",
    ],
    insights: [
      "Без публичного транскрипта выводы нужно воспринимать как предварительные.",
    ],
    unconventionalApplications: [
      "Использовать тему видео как повод для короткого эксперимента или обсуждения с командой.",
    ],
    actionsToday: [
      "Открыть видео и выписать 1 идею, которую можно протестировать в ближайшие 24 часа.",
    ],
    usefulnessRating: "low",
    transcriptStatusNote: reason || "Публичный транскрипт недоступен, анализ построен по title/description.",
    error: reason || "",
  };
}

export function normalizeAnalysisPayload(payload, { fallbackVideo, fallbackReason = "" } = {}) {
  const fallback = buildFallbackAnalysisFromMetadata(fallbackVideo || {}, fallbackReason);
  return {
    status: "ok",
    model: "",
    generatedAt: new Date(),
    summary: toCleanString(payload?.summary) || fallback.summary,
    mainIdeas: normalizeStringArray(payload?.mainIdeas, fallback.mainIdeas),
    insights: normalizeStringArray(payload?.insights, fallback.insights),
    unconventionalApplications: normalizeStringArray(
      payload?.unconventionalApplications,
      fallback.unconventionalApplications
    ),
    actionsToday: normalizeStringArray(payload?.actionsToday, fallback.actionsToday),
    usefulnessRating: normalizeUsefulnessRating(payload?.usefulnessRating),
    transcriptStatusNote: toCleanString(payload?.transcriptStatusNote) || fallback.transcriptStatusNote,
    error: "",
  };
}

async function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  const { default: OpenAI } = await import("openai");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function buildAnalysisSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      mainIdeas: {
        type: "array",
        items: { type: "string" },
      },
      insights: {
        type: "array",
        items: { type: "string" },
      },
      unconventionalApplications: {
        type: "array",
        items: { type: "string" },
      },
      actionsToday: {
        type: "array",
        items: { type: "string" },
      },
      usefulnessRating: {
        type: "string",
        enum: ["high", "medium", "low"],
      },
      transcriptStatusNote: { type: "string" },
    },
    required: [
      "summary",
      "mainIdeas",
      "insights",
      "unconventionalApplications",
      "actionsToday",
      "usefulnessRating",
      "transcriptStatusNote",
    ],
  };
}

export async function analyzeBusinessVideo({
  video,
  transcript,
  transcriptText,
  model = DEFAULT_MODEL,
  openaiClient,
} = {}) {
  const client = openaiClient || await getOpenAIClient();

  if (!client) {
    return buildFallbackAnalysisFromMetadata(video, "OPENAI_API_KEY is not configured.");
  }

  const transcriptStatus = transcript?.status || "metadata_only";
  const hasTranscript = Boolean(toCleanString(transcriptText));
  const promptPayload = {
    title: video?.title || "",
    channelName: video?.channelName || "",
    url: video?.url || "",
    publishedAt: video?.publishedAt ? new Date(video.publishedAt).toISOString() : "",
    description: truncateText(video?.description || "", DESCRIPTION_MAX_CHARS),
    transcriptStatus,
    transcriptSource: transcript?.source || "",
    transcriptLanguage: transcript?.languageCode || "",
    transcriptText: hasTranscript ? transcriptText : "",
  };

  const instructions = `
Ты анализируешь YouTube-видео для предпринимателя.
Пиши по-русски, конкретно и без мотивационной воды.
Линза широкая: бизнес-модели, продажи, операции, сервис, AI, стартапы, контент, менеджмент, нестандартные способы вести обычный бизнес.
Если транскрипта нет, не притворяйся, что видел весь ролик: явно укажи ограничение и делай выводы только по title/description.
Верни строгий JSON по схеме.
`.trim();

  try {
    const response = await client.responses.create({
      model,
      store: false,
      input: [
        { role: "system", content: instructions },
        { role: "user", content: JSON.stringify(promptPayload) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "business_youtube_video_analysis",
          strict: true,
          schema: buildAnalysisSchema(),
        },
      },
    });

    const parsed = JSON.parse(response.output_text || "{}");
    return {
      ...normalizeAnalysisPayload(parsed, { fallbackVideo: video }),
      model,
      generatedAt: new Date(),
    };
  } catch (error) {
    return {
      ...buildFallbackAnalysisFromMetadata(video, `OpenAI analysis failed: ${error.message}`),
      status: "fallback",
      model,
      generatedAt: new Date(),
    };
  }
}
