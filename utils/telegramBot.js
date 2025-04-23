import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
dotenv.config();

console.log(
  "TELEGRAM_BOT_TOKEN:",
  process.env.TELEGRAM_BOT_TOKEN_FOR_SENDING_REMINDER_NOTIFICATIONS
);
const bot = new TelegramBot(
  process.env.TELEGRAM_BOT_TOKEN_FOR_SENDING_REMINDER_NOTIFICATIONS,
  {
    polling: true,
  }
);

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name =
    msg.chat.title ||
    `${msg.chat.first_name || ""} ${msg.chat.last_name || ""}`.trim();
  const type = msg.chat.type;

  console.log("✅ Новый чат подключён:");
  console.log("🔹 chat.id:", chatId);
  console.log("🔹 Имя/название:", name);
  console.log("🔹 Тип чата:", type);

  bot.sendMessage(chatId, `✅ Бот активен. Тип чата: ${type}. ID: ${chatId}`);
});

bot.on("message", (msg) => {
  console.log("📨 Входящее сообщение:", {
    text: msg.text,
    chatId: msg.chat.id,
    type: msg.chat.type,
    user: msg.from?.username || msg.from?.first_name,
  });
});
