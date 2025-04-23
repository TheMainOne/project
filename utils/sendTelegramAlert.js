import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN_FOR_SENDING_REMINDER_NOTIFICATIONS;
const API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

/**
 * Отправка бизнес-уведомления через Telegram
 * @param {String|Number} chatId - Telegram chat_id (например, -100... для групп)
 * @param {String} message - текст сообщения
 */
export const sendTelegramAlert = async (chatId, message) => {
  if (!chatId || !message) {
    throw new Error(
      "chatId and message are required for Telegram notifications"
    );
  }

  try {
    const res = await axios.post(API_URL, {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML", // поддержка <b>, <i> и пр.
    });

    return res.data;
  } catch (err) {
    console.error(
      "❌ Ошибка отправки в Telegram:",
      err.response?.data || err.message
    );
    throw err;
  }
};
