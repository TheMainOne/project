// services/telegram/sessionManager.js
// Resolves sessionId for a Telegram chat.
// Strategy: one session per conversation, reset after SESSION_TIMEOUT_MS of inactivity
// or when the user sends /start.

import AiwSession from "../../models/AiwSession.js";

const SESSION_TIMEOUT_MS = Number(process.env.TELEGRAM_SESSION_TIMEOUT_MS || 6 * 60 * 60 * 1000); // 6h default

/**
 * Returns the active sessionId for a given chatId,
 * or creates a new one if the last session has expired.
 *
 * @param {string|number} chatId   - Telegram chat.id
 * @param {boolean} forceNew       - true when user sends /start
 * @returns {Promise<string>}      - sessionId
 */
export async function resolveSessionId(chatId, forceNew = false) {
  const prefix = `tg-${chatId}-`;

  if (!forceNew) {
    // Find the most recent session for this chat
    const last = await AiwSession.findOne(
      { sessionId: { $regex: `^${prefix}` } },
      { sessionId: 1, endedAt: 1 },
      { sort: { startedAt: -1 } }
    ).lean();

    if (last) {
      const lastActivity = last.endedAt ? new Date(last.endedAt) : new Date(0);
      const idleMs = Date.now() - lastActivity.getTime();

      if (idleMs < SESSION_TIMEOUT_MS) {
        // Session still active — reuse it
        return last.sessionId;
      }
    }
  }

  // Create a new session id
  return `${prefix}${Date.now().toString(36)}`;
}