// api/telegram/telegram.js
// Webhook handler for Telegram bots.
// One endpoint handles all bots: POST /api/telegram/webhook/:botToken
// The botToken in the URL is used to look up the client in NotificationDestination.

import express from "express";
import NotificationDestination from "../../models/NotificationDestination.js";
import AiwMessage from "../../models/AiwMessage.js";
import { processMessage } from "../../services/aiw/core.js";
import { resolveSessionId } from "../../services/telegram/sessionManager.js";
import { sendMessage, sendTyping } from "../../services/telegram/sender.js";

const telegramRouter = express.Router();

const MAX_HISTORY = 20; // messages to load from DB for context

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Load recent conversation history for this session from MongoDB.
 * Returns array of { role, content } ready for processMessage().
 */
async function loadHistory(sessionId, limit = MAX_HISTORY) {
  try {
    const docs = await AiwMessage.find(
      { sessionId, role: { $in: ["user", "assistant"] } },
      { role: 1, content: 1, createdAt: 1 },
      { sort: { createdAt: 1 }, limit }
    ).lean();
    return docs.map((d) => ({ role: d.role, content: d.content }));
  } catch (e) {
    console.error("[TG] loadHistory error:", e?.message);
    return [];
  }
}

/**
 * Lookup NotificationDestination by botToken.
 * Returns { clientId, siteId } or null if not found / disabled.
 */
async function resolveClientByToken(botToken) {
  try {
    const dest = await NotificationDestination.findOne({
      type: "telegram",
      enabled: true,
      "config.botToken": botToken,
    })
      .select("clientId siteId")
      .lean();

    if (!dest) return null;
    return {
      clientId: String(dest.clientId),
      siteId: dest.siteId || null,
    };
  } catch (e) {
    console.error("[TG] resolveClientByToken error:", e?.message);
    return null;
  }
}

// ── webhook route ──────────────────────────────────────────────────────────

telegramRouter.post("/webhook/:botToken", async (req, res) => {
  // Acknowledge Telegram immediately — it retries if we don't respond within 5s
  res.sendStatus(200);

  const { botToken } = req.params;
  const update = req.body;

  // We only handle regular text messages for now
  const message = update?.message;
  if (!message?.text) return;

  const chatId = message.chat.id;
  const userText = message.text.trim();
  const fromLang = message.from?.language_code || "ru";

  console.log(`[TG] update chatId=${chatId} text="${userText.slice(0, 80)}"`);

  try {
    // 1. Resolve which client owns this bot
    const client = await resolveClientByToken(botToken);
    if (!client) {
      console.warn("[TG] unknown or disabled botToken, ignoring update");
      return;
    }
    const { clientId, siteId } = client;

    // 2. Resolve session (new on /start or after timeout)
    const isStart = userText === "/start";
    const sessionId = await resolveSessionId(chatId, isStart);

    // 3. Show typing indicator while we process
    sendTyping(botToken, chatId);

    // 4. Load history + append current user message
    const history = await loadHistory(sessionId);
    const messages = [...history, { role: "user", content: userText }];

    // 5. Call the core pipeline (no streaming for Telegram)
    const result = await processMessage({
      messages,
      identity: {
        clientId,
        siteId: siteId || `tg-${chatId}`,
        sessionId,
        visitorId: String(message.from?.id || chatId),
        origin: null,
      },
      meta: {
        lang: fromLang,
      },
      requestContext: {
        ip: "0.0.0.0",       // no real IP in Telegram webhooks
        userAgent: "TelegramBot",
      },
      stream: false,          // Telegram doesn't support streaming
    });

    console.log(`[TG] reply for chatId=${chatId} len=${result.reply?.length} phase=${result.phase}`);

    // 6. Send reply back to Telegram
    await sendMessage(botToken, chatId, result.reply);

  } catch (e) {
    console.error("[TG] webhook handler error:", e);
    // Best-effort error message to user
    try {
      await sendMessage(botToken, chatId, "⚠️ Произошла ошибка. Попробуйте ещё раз.");
    } catch {}
  }
});

export default telegramRouter;