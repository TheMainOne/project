import Notification from "../../models/Notification.js";
import NotificationDestination from "../../models/NotificationDestination.js";
import Client from "../../models/Client.js";
import AiwMessage from "../../models/AiwMessage.js";
import AiwSession from "../../models/AiwSession.js";

const EVENT_TYPE = "lead.created";
const CHANNEL = "telegram";
const DEFAULT_LOCALE = process.env.NOTIFY_LOCALE || "en-GB";
const DEFAULT_TIMEZONE = process.env.NOTIFY_TIMEZONE || "UTC";
const TRANSCRIPT_LIMIT = Math.max(0, Number(process.env.NOTIFY_TRANSCRIPT_LIMIT || 6));
const TRANSCRIPT_MAX_CHARS = Math.max(100, Number(process.env.NOTIFY_TRANSCRIPT_MAX_CHARS || 280));
const TELEGRAM_MAX_CHARS = 4000;
const LANGUAGE_DISPLAY_NAMES =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames([DEFAULT_LOCALE], { type: "language" })
    : null;

function toStr(v) {
  return v == null ? "" : String(v);
}

function pickLeadContact(leadDoc) {
  const contact = leadDoc?.answers?.contact || {};
  const metaLead = leadDoc?.meta?.lead || {};

  const name = toStr(contact.name || metaLead.name).trim();
  const email = toStr(contact.email || metaLead.email).trim();
  const phone = toStr(contact.phone || metaLead.phone).trim();
  const handle = toStr(contact.handle || metaLead.handle).trim();
  const lang = toStr(contact.lang || leadDoc?.meta?.lang || "").trim();
  const confidenceRaw = metaLead?.confidence ?? leadDoc?.meta?.confidence ?? null;
  const confidence = Number.isFinite(Number(confidenceRaw)) ? Number(confidenceRaw) : null;

  return { name, email, phone, handle, lang, confidence };
}

function formatConfidence(confidence) {
  if (confidence == null || Number.isNaN(Number(confidence))) return "-";
  return Number(confidence).toFixed(2);
}

function formatDateHuman(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date();
  try {
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: DEFAULT_TIMEZONE,
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function formatLanguageName(langCode) {
  const code = toStr(langCode).trim().toLowerCase();
  if (!code) return "-";

  const base = code.split(/[-_]/)[0];
  if (!LANGUAGE_DISPLAY_NAMES) return base || code;

  try {
    return LANGUAGE_DISPLAY_NAMES.of(base) || base || code;
  } catch {
    return base || code;
  }
}

function truncateText(text, maxChars) {
  const s = toStr(text).trim();
  if (!s) return "";
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 1))}\u2026`;
}

async function resolveClientInfo(clientId) {
  try {
    const client = await Client.findById(clientId)
      .select({ name: 1, slug: 1, siteId: 1 })
      .lean();
    return client || null;
  } catch (err) {
    console.error("[notify][lead.created] resolveClientInfo error:", err?.message || err);
    return null;
  }
}

async function resolveSessionInfo(sessionId) {
  if (!sessionId) return null;
  try {
    const session = await AiwSession.findOne({ sessionId })
      .select({ tz: 1, lang: 1 })
      .lean();
    return session || null;
  } catch (err) {
    console.error("[notify][lead.created] resolveSessionInfo error:", err?.message || err);
    return null;
  }
}

async function buildTranscriptExcerpt({ siteId, sessionId }) {
  if (!TRANSCRIPT_LIMIT || !siteId || !sessionId) return [];

  try {
    const msgs = await AiwMessage.find({ siteId, sessionId })
      .sort({ createdAt: -1 })
      .limit(TRANSCRIPT_LIMIT)
      .select({ role: 1, content: 1, createdAt: 1 })
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
    console.error("[notify][lead.created] transcript error:", err?.message || err);
    return [];
  }
}

function formatClientLabel({ clientInfo, clientIdStr }) {
  if (clientInfo?.name) return `Client: ${clientInfo.name}`;
  return `Client: ${clientIdStr}`;
}

function trimTelegramMessage(text) {
  const s = toStr(text);
  if (s.length <= TELEGRAM_MAX_CHARS) return s;
  return `${s.slice(0, TELEGRAM_MAX_CHARS - 1)}\u2026`;
}

function formatLeadMessage({ leadDoc, clientIdStr, clientInfo, sessionInfo, transcriptLines }) {
  const { name, email, phone, handle, lang, confidence } = pickLeadContact(leadDoc);
  const siteId = toStr(leadDoc?.siteId).trim() || "UNKNOWN_SITE";
  const createdAt = leadDoc?.createdAt ? new Date(leadDoc.createdAt) : new Date();
  const tz = toStr(sessionInfo?.tz).trim() || "-";

  const lines = [
    `\uD83C\uDD95 New Lead (${siteId})`,
    formatClientLabel({ clientInfo, clientIdStr }),
    `Name: ${name || "-"}`,
    `Email: ${email || "-"}`,
    `Phone: ${phone || "-"}`,
    `Handle: ${handle || "-"}`,
    `Language: ${formatLanguageName(lang)}`,
    `Time zone: ${tz}`,
    `Created at: ${formatDateHuman(createdAt)} (${DEFAULT_TIMEZONE})`,
  ];

  if (transcriptLines?.length) {
    lines.push("");
    lines.push("\uD83D\uDCAC Transcript:");
    lines.push(...transcriptLines);
  }

  return trimTelegramMessage(lines.join("\n"));
}

function buildDedupeKey({ clientIdStr, sessionId, leadId, destinationId }) {
  const baseId = toStr(sessionId).trim() || toStr(leadId).trim() || "unknown";
  // Включаем destinationId, чтобы можно было отправлять в несколько чатов одного клиента
  return `${EVENT_TYPE}:${clientIdStr}:${baseId}:${destinationId}`;
}

function isDuplicateKeyError(err) {
  return err?.code === 11000 || /duplicate key/i.test(err?.message || "");
}

export async function enqueueLeadCreatedNotification({ leadDoc }) {
  if (!leadDoc?.clientId) {
    return { destinations: 0, enqueued: 0, deduped: 0, errors: 0, skipped: true };
  }

  const clientId = leadDoc.clientId;
  const clientIdStr = toStr(clientId);
  const siteId = leadDoc?.siteId || null;
  const sessionId = leadDoc?.sessionId || null;

  const destinationFilter = {
    clientId,
    type: CHANNEL,
    enabled: true,
  };

  // Если destination привязан к сайту — берём и site-specific, и общие (siteId=null)
  if (siteId) {
    destinationFilter.$or = [
      { siteId },
      { siteId: null },
      { siteId: { $exists: false } },
    ];
  }

  const destinations = await NotificationDestination.find(destinationFilter).lean();
  if (!destinations.length) {
    return { destinations: 0, enqueued: 0, deduped: 0, errors: 0, skipped: true };
  }

  const [clientInfo, sessionInfo, transcriptLines] = await Promise.all([
    resolveClientInfo(clientId),
    resolveSessionInfo(sessionId),
    buildTranscriptExcerpt({ siteId, sessionId }),
  ]);

  const message = formatLeadMessage({ leadDoc, clientIdStr, clientInfo, sessionInfo, transcriptLines });
  const payload = {
    leadId: toStr(leadDoc?._id),
    sessionId: toStr(leadDoc?.sessionId),
    clientId: clientIdStr,
    siteId: toStr(leadDoc?.siteId),
    client: clientInfo
      ? { id: clientIdStr, name: clientInfo.name || null, slug: clientInfo.slug || null }
      : { id: clientIdStr },
    contact: pickLeadContact(leadDoc),
    session: sessionInfo ? { tz: sessionInfo.tz || null, lang: sessionInfo.lang || null } : null,
    createdAt: leadDoc?.createdAt ? new Date(leadDoc.createdAt) : new Date(),
    transcriptLines,
  };

  let enqueued = 0;
  let deduped = 0;
  let errors = 0;

  for (const dest of destinations) {
    const chatId = dest?.config?.chatId;
    if (!chatId) continue;

    const dedupeKey = buildDedupeKey({
      clientIdStr,
      sessionId: leadDoc?.sessionId,
      leadId: leadDoc?._id,
      destinationId: dest._id,
    });

    try {
      await Notification.create({
        clientId,
        siteId,
        eventType: EVENT_TYPE,
        channel: CHANNEL,
        destinationId: dest._id,
        payload: { ...payload, destinationChatId: chatId },
        message,
        scheduledFor: new Date(),
        status: "pending",
        dedupeKey,
      });
      enqueued += 1;
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        deduped += 1;
        continue;
      }
      errors += 1;
      console.error("[notify][lead.created] enqueue error:", err?.message || err);
    }
  }

  if (enqueued || deduped) {
    console.log("[notify][lead.created] enqueue summary", {
      clientId: clientIdStr,
      siteId,
      destinations: destinations.length,
      enqueued,
      deduped,
      errors,
    });
  }

  return { destinations: destinations.length, enqueued, deduped, errors, skipped: false };
}

export default enqueueLeadCreatedNotification;
