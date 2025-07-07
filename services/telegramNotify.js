import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path"; // ← добавить
import { fileURLToPath } from "url"; // ← добавить

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ── 1. путь для прод-сервера ── */
const prodEnv = "/home/ec2-user/project/.env";

/* ── 2. fallback – .env на уровень выше от текущего файла ── */
const localEnv = path.join(__dirname, "../.env");

/* ── Проверяем, где файл действительно существует ── */
const envPath = fs.existsSync(prodEnv) ? prodEnv : localEnv;
dotenv.config({ path: envPath });

// dotenv.config({ path: '/home/ec2-user/project/.env' });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "MarkdownV2",
    });
    console.log("Notification sent to Telegram");
  } catch (err) {
    console.error("Error sending message to Telegram:", err.message);
  }
}

export default sendTelegramMessage;
