const TELEGRAM_SAFE_CHARS = 3900;

function toCleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value, maxChars) {
  const text = toCleanString(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}\u2026`;
}

function formatDate(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date();
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function formatList(title, items, maxItems = 5) {
  const values = Array.isArray(items) ? items.map((item) => truncateText(item, 300)).filter(Boolean) : [];
  if (!values.length) return "";
  return `${title}\n${values.slice(0, maxItems).map((item) => `- ${item}`).join("\n")}`;
}

function transcriptLabel(transcript = {}) {
  if (transcript.status === "available") {
    const lang = transcript.languageCode ? `, ${transcript.languageCode}` : "";
    const source = transcript.source === "public_auto_caption" ? "авто-субтитры" : "субтитры";
    return `доступен (${source}${lang}, ${transcript.charCount || 0} символов)`;
  }

  if (transcript.status === "empty") {
    return "субтитры найдены, но YouTube вернул пустой текст; анализ по названию и описанию";
  }
  if (transcript.status === "error") {
    return `ошибка получения субтитров (${truncateText(transcript.error, 120)}); анализ по названию и описанию`;
  }
  return "недоступен; анализ по названию и описанию";
}

function usefulnessLabel(value) {
  if (value === "high") return "high";
  if (value === "low") return "low";
  return "medium";
}

export function formatVideoAnalysisBlock(item, index) {
  const video = item.video || item;
  const transcript = item.transcript || {};
  const analysis = item.analysis || {};
  const lines = [
    `${index}. ${truncateText(video.title, 180)}`,
    `Канал: ${truncateText(video.channelName || video.channelId, 120)}`,
    `Дата: ${formatDate(video.publishedAt)}`,
    `Ссылка: ${video.url}`,
    `Транскрипт: ${transcriptLabel(transcript)}`,
    `Полезность: ${usefulnessLabel(analysis.usefulnessRating)}`,
    "",
    `О чем: ${truncateText(analysis.summary, 700)}`,
  ];

  const sections = [
    formatList("Главные бизнес-идеи:", analysis.mainIdeas, 5),
    formatList("Инсайты:", analysis.insights, 5),
    formatList("Нестандартные применения:", analysis.unconventionalApplications, 5),
    formatList("Что попробовать сегодня:", analysis.actionsToday, 5),
  ].filter(Boolean);

  return [...lines, ...sections].join("\n");
}

export function formatBusinessYoutubeDigest({ items = [], stats = {}, now = new Date() } = {}) {
  const header = [
    "YouTube бизнес-дайджест",
    `Дата: ${formatDate(now)}`,
    `Новых видео: ${items.length}`,
    `Проверено каналов: ${stats.channelsChecked || 0}`,
  ];

  if (stats.feedErrors) header.push(`Ошибки каналов: ${stats.feedErrors}`);
  if (stats.processingErrors) header.push(`Ошибки анализа: ${stats.processingErrors}`);

  const body = items.map((item, index) => formatVideoAnalysisBlock(item, index + 1)).join("\n\n---\n\n");
  return `${header.join("\n")}\n\n${body}`.trim();
}

export function formatEmptyBusinessYoutubeStatus({ stats = {}, now = new Date(), reason = "Новых видео за период проверки нет." } = {}) {
  const lines = [
    "YouTube бизнес-дайджест",
    `Дата: ${formatDate(now)}`,
    reason,
    `Проверено каналов: ${stats.channelsChecked || 0}`,
    `Найдено видео в RSS: ${stats.videosDiscovered || 0}`,
    `Видео в lookback: ${stats.videosRecent || 0}`,
    `Новых неотправленных видео: ${stats.videosCandidates || 0}`,
  ];

  if (stats.feedErrors) lines.push(`Ошибки каналов: ${stats.feedErrors}`);
  if (stats.processingErrors) lines.push(`Ошибки анализа: ${stats.processingErrors}`);

  return lines.join("\n");
}

function splitLongSegment(segment, maxChars) {
  const chunks = [];
  let rest = String(segment || "");
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf("\n", maxChars);
    if (cut < maxChars * 0.5) cut = rest.lastIndexOf(" ", maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function splitTelegramMessage(text, maxChars = TELEGRAM_SAFE_CHARS) {
  const clean = String(text || "").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks = [];
  let current = "";
  const segments = clean.split(/\n{2,}/);

  for (const segment of segments) {
    const part = segment.trim();
    if (!part) continue;

    if (part.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      chunks.push(...splitLongSegment(part, maxChars));
      continue;
    }

    const next = current ? `${current}\n\n${part}` : part;
    if (next.length > maxChars) {
      chunks.push(current.trim());
      current = part;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current.trim());
  return chunks.filter(Boolean);
}
