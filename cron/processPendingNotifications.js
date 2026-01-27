import dotenv from "dotenv";
import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import NotificationDestination from "../models/NotificationDestination.js";
import AiwMessage from "../models/AiwMessage.js";
import path from "path";
import { sendTelegramMessage } from "../providers/telegramProvider.js";
import { fileURLToPath } from "url";

// Чтобы корректно работал __dirname в ES-модулях
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем .env из корня проекта
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const MAX_ATTEMPTS = Math.max(1, Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 5));
const BATCH_SIZE = Math.max(1, Number(process.env.NOTIFICATION_BATCH_SIZE || 50));
const RETRY_DELAY_MINUTES = Math.max(1, Number(process.env.NOTIFICATION_RETRY_DELAY_MINUTES || 1));
const DB_NAME = process.env.MONGODB_DB_NAME || "materials_reader";
const TRANSCRIPT_LIMIT = Math.max(0, Number(process.env.NOTIFY_TRANSCRIPT_LIMIT || 6));
const TRANSCRIPT_MAX_CHARS = Math.max(100, Number(process.env.NOTIFY_TRANSCRIPT_MAX_CHARS || 280));
const TELEGRAM_MAX_CHARS = 4000;

function truncateError(err) {
  const raw = err?.response?.data ?? err?.message ?? err;

  if (typeof raw === "string") {
    return raw.slice(0, 2000);
  }

  try {
    return JSON.stringify(raw).slice(0, 2000);
  } catch {
    return String(raw).slice(0, 2000);
  }
}

function nextRetryDate(attempts) {
  const delayMinutes = RETRY_DELAY_MINUTES * Math.max(1, attempts);
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

async function initMongo() {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    throw new Error("DATABASE_URL is not set");
  }

  await mongoose.connect(uri, { dbName: DB_NAME, autoIndex: true });

  // Явно синхронизируем индексы для новых коллекций
  await NotificationDestination.createCollection().catch(() => {});
  await NotificationDestination.syncIndexes();
  await Notification.createCollection().catch(() => {});
  await Notification.syncIndexes();

  console.log("[notify-worker] Mongo connected:", mongoose.connection.name);
}

async function fetchCandidateIds(now) {
  const candidates = await Notification.find({
    status: "pending",
    scheduledFor: { $lte: now },
    attempts: { $lt: MAX_ATTEMPTS },
  })
    .sort({ scheduledFor: 1, createdAt: 1 })
    .limit(BATCH_SIZE)
    .select({ _id: 1 })
    .lean();

  return candidates.map((d) => d._id);
}

async function claimNotification(id, now) {
  const claimed = await Notification.findOneAndUpdate(
    {
      _id: id,
      status: "pending",
      scheduledFor: { $lte: now },
      attempts: { $lt: MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { new: true }
  ).lean();

  return claimed;
}

function resolveChatId(notification, destination) {
  return (
    destination?.config?.chatId ||
    notification?.payload?.destinationChatId ||
    null
  );
}

function truncateText(text, maxChars) {
  const s = String(text || "").trim();
  if (!s) return "";
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 1))}\u2026`;
}

async function buildTranscriptExcerpt({ siteId, sessionId }) {
  if (!TRANSCRIPT_LIMIT || !siteId || !sessionId) return [];

  try {
    const msgs = await AiwMessage.find({ siteId, sessionId })
      .sort({ createdAt: -1 })
      .limit(TRANSCRIPT_LIMIT)
      .select({ role: 1, content: 1 })
      .lean();

    return msgs
      .reverse()
      .map((m) => {
        const role = m.role === "assistant" ? "\uD83E\uDD16" : m.role === "system" ? "\u2699\uFE0F" : "\uD83D\uDC64";
        const content = truncateText(m.content, TRANSCRIPT_MAX_CHARS);
        return content ? `${role} ${content}` : "";
      })
      .filter(Boolean);
  } catch (err) {
    console.error("[notify-worker] transcript error:", err?.message || err);
    return [];
  }
}

function trimTelegramMessage(text) {
  const s = String(text || "");
  if (s.length <= TELEGRAM_MAX_CHARS) return s;
  return `${s.slice(0, TELEGRAM_MAX_CHARS - 1)}\u2026`;
}

async function enrichMessageWithTranscript(notification, message) {
  if (!TRANSCRIPT_LIMIT) return trimTelegramMessage(message);

  // Если transcript уже встроен в сообщение на этапе enqueue — не дублируем
  if (String(message || "").includes("\uD83D\uDCAC Transcript:")) {
    return trimTelegramMessage(message);
  }

  const payloadLines = Array.isArray(notification?.payload?.transcriptLines)
    ? notification.payload.transcriptLines
    : [];

  const transcriptLines = payloadLines.length
    ? payloadLines
    : await buildTranscriptExcerpt({
        siteId: notification?.payload?.siteId || notification?.siteId,
        sessionId: notification?.payload?.sessionId,
      });

  if (!transcriptLines.length) {
    return trimTelegramMessage(message);
  }

  const combined = `${message}\n\n\uD83D\uDCAC Transcript:\n${transcriptLines.join("\n")}`;
  return trimTelegramMessage(combined);
}

async function markSent(id) {
  await Notification.updateOne(
    { _id: id },
    {
      $set: {
        status: "sent",
        sentAt: new Date(),
        lastError: null,
      },
    }
  );
}

async function markFailedOrRetry(notification, err) {
  const attempts = notification?.attempts || 0;
  const lastError = truncateError(err);

  if (attempts >= MAX_ATTEMPTS) {
    await Notification.updateOne(
      { _id: notification._id },
      {
        $set: {
          status: "failed",
          lastError,
        },
      }
    );
    return { failed: 1, retried: 0 };
  }

  await Notification.updateOne(
    { _id: notification._id },
    {
      $set: {
        status: "pending",
        lastError,
        scheduledFor: nextRetryDate(attempts),
      },
    }
  );

  return { failed: 0, retried: 1 };
}

async function processOne(id, now) {
  const claimed = await claimNotification(id, now);
  if (!claimed) return { sent: 0, failed: 0, retried: 0, skipped: 1 };

  const destination = await NotificationDestination.findById(claimed.destinationId).lean();
  const chatId = resolveChatId(claimed, destination);

  if (!destination || destination.enabled === false || !chatId) {
    const reason = !destination
      ? "Destination not found"
      : destination.enabled === false
        ? "Destination disabled"
        : "Destination chatId missing";
    const result = await markFailedOrRetry(claimed, new Error(reason));
    return { sent: 0, failed: result.failed, retried: result.retried, skipped: 0 };
  }

  const baseMessage = claimed.message || String(claimed?.payload?.message || "").trim();
  const message = await enrichMessageWithTranscript(claimed, baseMessage);
  if (!message) {
    const result = await markFailedOrRetry(claimed, new Error("Notification message is empty"));
    return { sent: 0, failed: result.failed, retried: result.retried, skipped: 0 };
  }

  try {
    await sendTelegramMessage({ chatId, text: message });
    await markSent(claimed._id);
    return { sent: 1, failed: 0, retried: 0, skipped: 0 };
  } catch (err) {
    const result = await markFailedOrRetry(claimed, err);
    console.error("[notify-worker] send error:", err?.message || err);
    return { sent: 0, failed: result.failed, retried: result.retried, skipped: 0 };
  }
}

async function run() {
  const startedAt = Date.now();
  const now = new Date();

  let sent = 0;
  let failed = 0;
  let retried = 0;
  let skipped = 0;

  try {
    await initMongo();

    const ids = await fetchCandidateIds(now);
    if (!ids.length) {
      console.log("[notify-worker] No pending notifications");
      return;
    }

    for (const id of ids) {
      const res = await processOne(id, now);
      sent += res.sent;
      failed += res.failed;
      retried += res.retried;
      skipped += res.skipped;
    }
  } catch (err) {
    console.error("[notify-worker] fatal error:", err?.message || err);
  } finally {
    const durMs = Date.now() - startedAt;
    console.log("[notify-worker] summary", { sent, failed, retried, skipped, durMs });
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  }
}

run();
