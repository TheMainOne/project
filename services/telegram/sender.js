// services/telegram/sender.js
// Thin wrapper around Telegram Bot API HTTP calls.
// No SDK dependency — just fetch.

const TG_API = "https://api.telegram.org/bot";

/**
 * Send a text message to a chat.
 * Automatically falls back to plain text if Markdown parse fails.
 */
export async function sendMessage(botToken, chatId, text) {
  const url = `${TG_API}${botToken}/sendMessage`;

  // First try with Markdown (links, bold, etc.)
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text || "…",
      parse_mode: "Markdown",
    }),
  });

  const data = await res.json();

  // Telegram returns ok:false when Markdown is invalid — retry as plain text
  if (!data.ok) {
    console.warn("[TG][sender] Markdown parse failed, retrying as plain text:", data.description);
    const res2 = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text || "…" }),
    });
    return res2.json();
  }

  return data;
}

/**
 * Show "typing…" indicator in the chat.
 * Fire-and-forget — we don't await the result.
 */
export function sendTyping(botToken, chatId) {
  fetch(`${TG_API}${botToken}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch((e) => console.warn("[TG][sender] sendTyping error:", e?.message));
}