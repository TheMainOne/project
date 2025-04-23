import sendTelegramMessage from "../services/telegramNotify.js";

export const sendCronReport = async ({
  taskName,
  created = 0,
  sent = 0,
  failed = 0,
}) => {
  const now = new Date();
  const timeStr = now.toUTCString(); // полная дата + время UTC

  const message =
    `*🛠️ Cron Task Report*\n\n` +
    `*📌 Task:* ${taskName}\n` +
    `*📅 Date:* ${timeStr}\n` +
    `*✅ Created notifications:* ${created}\n` +
    `*📤 Sent:* ${sent}\n` +
    `*⚠️ Failed:* ${failed}\n` +
    `*🕒 Time:* ${new Date().toUTCString()}`;

  await sendTelegramMessage(message);
};
