import Notification from "../services/schemas/notification.js";
import { sendTelegramAlert } from "../utils/sendTelegramAlert.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const chatId = process.env.TELEGRAM_CHAT_ID_FOR_SENDING_BUSINESS_NOTIFICATIONS;

export const processPendingNotifications = async () => {
  let sentCount = 0;
  const now = new Date();
  const pending = await Notification.find({
    status: "pending",
    scheduledFor: { $lte: now }, // Только те, у кого пришло время
  });

  for (const note of pending) {
    try {
      const { method, recipient, context } = note;

      if (method === "email") {
        // await sendEmail(recipient, context);
      } else if (method === "telegram") {
        await sendTelegramAlert(chatId, context.message);
      } else if (method === "in_app") {
        // можно просто оставить как pending, пока пользователь не зайдёт
      }

      note.status = "sent";
      sentCount += 1;
      note.sentAt = new Date();
    } catch (error) {
      note.status = "failed";
      note.sendError = error.message;
    }

    await note.save();
  }

  console.log(
    "✅ Notification processing is complete. All necessary notifications have been successfully sent."
  );
  return sentCount;
};
