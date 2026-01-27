import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Чтобы корректно работал __dirname в ES-модулях
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const DEFAULT_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

function buildTelegramUrl(botToken) {
  return `https://api.telegram.org/bot${botToken}/sendMessage`;
}

export async function sendTelegramMessage({ chatId, text, botToken = DEFAULT_BOT_TOKEN }) {
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  if (!chatId) {
    throw new Error("Telegram chatId is required");
  }
  const messageText = String(text || "").trim();
  if (!messageText) {
    throw new Error("Telegram message text is empty");
  }

  const url = buildTelegramUrl(botToken);

  const response = await axios.post(url, {
    chat_id: chatId,
    text: messageText,
    disable_web_page_preview: true,
  });

  return response.data;
}

export default {
  sendTelegramMessage,
};

