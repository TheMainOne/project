import BusinessYoutubeVideo from "../../models/BusinessYoutubeVideo.js";
import { sendTelegramMessage } from "../../providers/telegramProvider.js";
import {
  getEnabledBusinessYoutubeChannels,
  loadBusinessYoutubeChannels,
  parseBoolean,
  parsePositiveInteger,
} from "./config.js";
import { fetchYoutubeChannelFeed } from "./youtubeRss.js";
import { fetchPublicTranscript } from "./transcript.js";
import { analyzeBusinessVideo } from "./analysis.js";
import {
  formatBusinessYoutubeDigest,
  formatEmptyBusinessYoutubeStatus,
  splitTelegramMessage,
} from "./format.js";

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_LOOKBACK_HOURS = 48;
const DEFAULT_MAX_VIDEOS = 10;
const DEFAULT_TRANSCRIPT_MAX_CHARS = 20000;

function truncateText(value, maxChars) {
  const text = String(value || "").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}\u2026`;
}

function truncateError(error) {
  const raw = error?.response?.data ?? error?.message ?? error;
  if (typeof raw === "string") return raw.slice(0, 1000);
  try {
    return JSON.stringify(raw).slice(0, 1000);
  } catch {
    return String(raw).slice(0, 1000);
  }
}

function uniqueByVideoId(videos) {
  const map = new Map();
  for (const video of videos) {
    if (!video?.videoId || map.has(video.videoId)) continue;
    map.set(video.videoId, video);
  }
  return Array.from(map.values());
}

async function ensureIndexes(logger) {
  try {
    await BusinessYoutubeVideo.createCollection().catch(() => {});
    await BusinessYoutubeVideo.syncIndexes();
  } catch (error) {
    logger.warn?.("[business-youtube] failed to ensure indexes:", error?.message || error);
  }
}

async function fetchAllFeeds(channels, logger) {
  const results = await Promise.allSettled(
    channels.map(async (channel) => ({
      channel,
      videos: await fetchYoutubeChannelFeed(channel),
    }))
  );

  const videos = [];
  const errors = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      videos.push(...result.value.videos);
      continue;
    }

    const error = truncateError(result.reason);
    errors.push(error);
    logger.warn?.("[business-youtube] feed fetch failed:", error);
  }

  return { videos: uniqueByVideoId(videos), errors };
}

async function selectCandidateVideos(
  videos,
  { now, maxVideos, lookbackHours, retryMissingTranscript = false }
) {
  const cutoff = new Date(now.getTime() - lookbackHours * HOUR_MS);
  const recentVideos = videos
    .filter((video) => video.publishedAt && new Date(video.publishedAt) >= cutoff)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const ids = recentVideos.map((video) => video.videoId);
  if (!ids.length) return { candidates: [], recentCount: 0 };

  const existing = await BusinessYoutubeVideo.find({ videoId: { $in: ids } })
    .select({ videoId: 1, send: 1, transcript: 1 })
    .lean();
  const completedIds = new Set(
    existing
      .filter((doc) => {
        if (doc?.send?.status !== "sent") return false;
        if (!retryMissingTranscript) return true;
        return doc?.transcript?.status === "available";
      })
      .map((doc) => doc.videoId)
  );
  const candidateLimit = retryMissingTranscript ? maxVideos * 3 : maxVideos;

  return {
    recentCount: recentVideos.length,
    candidates: recentVideos
      .filter((video) => !completedIds.has(video.videoId))
      .slice(0, candidateLimit),
  };
}

function toVideoPersistence(video) {
  return {
    videoId: video.videoId,
    channelId: video.channelId,
    channelName: video.channelName,
    channelUrl: video.channelUrl,
    title: video.title,
    url: video.url,
    description: video.description || "",
    publishedAt: video.publishedAt,
    discoveredAt: new Date(),
  };
}

async function markVideoProcessing(video, { dryRun }) {
  if (dryRun) return;

  await BusinessYoutubeVideo.findOneAndUpdate(
    { videoId: video.videoId },
    {
      $setOnInsert: toVideoPersistence(video),
      $set: {
        "send.status": "pending",
        "send.lastError": "",
        lastError: "",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function persistVideoAnalysis(video, transcript, analysis, { dryRun }) {
  if (dryRun) return;

  await BusinessYoutubeVideo.updateOne(
    { videoId: video.videoId },
    {
      $set: {
        ...toVideoPersistence(video),
        transcript: {
          status: transcript.status || "metadata_only",
          source: transcript.source || "",
          languageCode: transcript.languageCode || "",
          languageName: transcript.languageName || "",
          charCount: transcript.charCount || 0,
          error: transcript.error || "",
        },
        analysis: {
          status: analysis.status || "fallback",
          model: analysis.model || "",
          generatedAt: analysis.generatedAt || new Date(),
          summary: analysis.summary || "",
          mainIdeas: analysis.mainIdeas || [],
          insights: analysis.insights || [],
          unconventionalApplications: analysis.unconventionalApplications || [],
          actionsToday: analysis.actionsToday || [],
          usefulnessRating: analysis.usefulnessRating || "medium",
          transcriptStatusNote: analysis.transcriptStatusNote || "",
          error: analysis.error || "",
        },
        "send.status": "pending",
        "send.lastError": "",
        lastError: "",
      },
    }
  );
}

async function markVideoDeferredForTranscript(video, transcript, { dryRun, reason }) {
  if (dryRun) return;

  await BusinessYoutubeVideo.updateOne(
    { videoId: video.videoId },
    {
      $set: {
        ...toVideoPersistence(video),
        transcript: {
          status: transcript.status || "metadata_only",
          source: transcript.source || "",
          languageCode: transcript.languageCode || "",
          languageName: transcript.languageName || "",
          charCount: transcript.charCount || 0,
          error: transcript.error || "",
        },
        analysis: {
          status: "pending",
          model: "",
          generatedAt: null,
          summary: "",
          mainIdeas: [],
          insights: [],
          unconventionalApplications: [],
          actionsToday: [],
          usefulnessRating: "medium",
          transcriptStatusNote: reason,
          error: "",
        },
        "send.status": "skipped",
        "send.lastError": reason,
        lastError: reason,
      },
    },
    { upsert: true }
  );
}

async function markVideosSent(videoIds, chunkCount) {
  if (!videoIds.length) return;

  await BusinessYoutubeVideo.updateMany(
    { videoId: { $in: videoIds } },
    {
      $set: {
        "send.status": "sent",
        "send.sentAt": new Date(),
        "send.messageChunkCount": chunkCount,
        "send.lastError": "",
        lastError: "",
      },
    }
  );
}

async function markVideosFailed(videoIds, error) {
  if (!videoIds.length) return;

  const lastError = truncateError(error);
  await BusinessYoutubeVideo.updateMany(
    { videoId: { $in: videoIds } },
    {
      $set: {
        "send.status": "failed",
        "send.lastError": lastError,
        lastError,
      },
    }
  );
}

function toPublicTranscript(transcript = {}) {
  return {
    status: transcript.status,
    source: transcript.source,
    languageCode: transcript.languageCode,
    languageName: transcript.languageName,
    charCount: transcript.charCount,
    error: transcript.error,
  };
}

function buildTranscriptDeferredReason(transcript = {}) {
  if (transcript.status === "empty") {
    const detail = transcript.error ? ` Details: ${truncateText(transcript.error, 300)}` : "";
    return `Caption track found, but transcript text is still empty; retry on the next digest run.${detail}`;
  }
  if (transcript.status === "error") {
    return `Transcript fetch failed; retry on the next digest run: ${truncateText(transcript.error, 300)}`;
  }
  return "Public transcript is not available yet; retry on the next digest run.";
}

async function processVideo(video, { dryRun, transcriptMaxChars, logger, requireTranscript }) {
  try {
    await markVideoProcessing(video, { dryRun });

    const transcript = await fetchPublicTranscript(video, {
      languageHints: video.languageHints || ["ru", "en"],
    });
    const publicTranscript = toPublicTranscript(transcript);

    if (requireTranscript && transcript.status !== "available") {
      const reason = buildTranscriptDeferredReason(transcript);
      await markVideoDeferredForTranscript(video, publicTranscript, { dryRun, reason });
      logger.log?.(`[business-youtube] deferred until transcript is available: ${video.videoId} (${transcript.status})`);
      return {
        ok: false,
        deferred: true,
        video,
        transcript: publicTranscript,
        reason,
      };
    }

    const transcriptText = transcript.status === "available"
      ? truncateText(transcript.text, transcriptMaxChars)
      : "";
    const analysis = await analyzeBusinessVideo({ video, transcript, transcriptText });

    await persistVideoAnalysis(video, publicTranscript, analysis, { dryRun });

    return {
      ok: true,
      video,
      transcript: publicTranscript,
      analysis,
    };
  } catch (error) {
    const lastError = truncateError(error);
    logger.error?.("[business-youtube] video processing failed:", video.videoId, lastError);
    if (!dryRun) {
      await BusinessYoutubeVideo.updateOne(
        { videoId: video.videoId },
        {
          $setOnInsert: toVideoPersistence(video),
          $set: {
            "analysis.status": "failed",
            "analysis.error": lastError,
            "send.status": "failed",
            "send.lastError": lastError,
            lastError,
          },
        },
        { upsert: true }
      );
    }
    return { ok: false, video, error: lastError };
  }
}

async function sendDigestMessage(message, { dryRun, logger }) {
  const chunks = splitTelegramMessage(message);
  if (dryRun) {
    logger.log("[business-youtube] dry-run telegram chunks:", chunks.length);
    chunks.forEach((chunk, index) => {
      logger.log(`[business-youtube] dry-run chunk ${index + 1}/${chunks.length}\n${chunk}`);
    });
    return { sent: false, chunks };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  for (const chunk of chunks) {
    await sendTelegramMessage({ botToken, chatId, text: chunk });
  }

  return { sent: true, chunks };
}

export async function runBusinessYoutubeDigest({ dryRun = false, now = new Date(), logger = console } = {}) {
  const startedAt = Date.now();
  const stats = {
    channelsChecked: 0,
    videosDiscovered: 0,
    videosRecent: 0,
    videosCandidates: 0,
    videosAnalyzed: 0,
    videosDeferredForTranscript: 0,
    feedErrors: 0,
    processingErrors: 0,
    messagesSent: 0,
    chunks: 0,
    durMs: 0,
  };

  await ensureIndexes(logger);

  const maxVideos = parsePositiveInteger(process.env.BUSINESS_YOUTUBE_MAX_VIDEOS, DEFAULT_MAX_VIDEOS, {
    min: 1,
    max: 50,
  });
  const lookbackHours = parsePositiveInteger(
    process.env.BUSINESS_YOUTUBE_LOOKBACK_HOURS,
    DEFAULT_LOOKBACK_HOURS,
    { min: 1, max: 24 * 14 }
  );
  const transcriptMaxChars = parsePositiveInteger(
    process.env.BUSINESS_YOUTUBE_TRANSCRIPT_MAX_CHARS,
    DEFAULT_TRANSCRIPT_MAX_CHARS,
    { min: 1000, max: 100000 }
  );
  const sendEmptyStatus = parseBoolean(process.env.BUSINESS_YOUTUBE_SEND_EMPTY_STATUS, true);
  const requireTranscript = parseBoolean(process.env.BUSINESS_YOUTUBE_REQUIRE_TRANSCRIPT, true);

  const allChannels = await loadBusinessYoutubeChannels();
  const channels = getEnabledBusinessYoutubeChannels(allChannels);
  stats.channelsChecked = channels.length;

  if (!channels.length) {
    const message = formatEmptyBusinessYoutubeStatus({
      stats,
      now,
      reason: "Активные YouTube-каналы не настроены в config/businessYoutubeChannels.json.",
    });
    if (sendEmptyStatus) {
      const sent = await sendDigestMessage(message, { dryRun, logger });
      stats.messagesSent = sent.sent ? sent.chunks.length : 0;
      stats.chunks = sent.chunks.length;
    }
    stats.durMs = Date.now() - startedAt;
    logger.log("[business-youtube] summary", stats);
    return { stats, items: [], dryRun };
  }

  const feedResult = await fetchAllFeeds(channels, logger);
  stats.videosDiscovered = feedResult.videos.length;
  stats.feedErrors = feedResult.errors.length;

  const { candidates, recentCount } = await selectCandidateVideos(feedResult.videos, {
    now,
    maxVideos,
    lookbackHours,
    retryMissingTranscript: requireTranscript,
  });
  stats.videosRecent = recentCount;
  stats.videosCandidates = candidates.length;

  const items = [];
  for (const video of candidates) {
    if (items.length >= maxVideos) break;

    const result = await processVideo(video, {
      dryRun,
      transcriptMaxChars,
      logger,
      requireTranscript,
    });
    if (result.ok) {
      items.push(result);
      stats.videosAnalyzed += 1;
    } else if (result.deferred) {
      stats.videosDeferredForTranscript += 1;
    } else {
      stats.processingErrors += 1;
    }
  }

  let message = "";
  if (items.length) {
    message = formatBusinessYoutubeDigest({ items, stats, now });
  } else if (sendEmptyStatus) {
    const reason = stats.videosDeferredForTranscript
      ? "Новые видео найдены, но публичные транскрипты пока недоступны. Они будут проверены в следующем запуске."
      : undefined;
    message = formatEmptyBusinessYoutubeStatus({ stats, now, reason });
  }

  if (message) {
    const videoIds = items.map((item) => item.video.videoId);
    try {
      const sent = await sendDigestMessage(message, { dryRun, logger });
      stats.messagesSent = sent.sent ? sent.chunks.length : 0;
      stats.chunks = sent.chunks.length;
      if (!dryRun && items.length) {
        await markVideosSent(videoIds, sent.chunks.length);
      }
    } catch (error) {
      stats.processingErrors += 1;
      logger.error?.("[business-youtube] telegram send failed:", truncateError(error));
      if (!dryRun && items.length) {
        await markVideosFailed(videoIds, error);
      }
      throw error;
    }
  }

  stats.durMs = Date.now() - startedAt;
  logger.log("[business-youtube] summary", stats);
  return { stats, items, dryRun };
}
