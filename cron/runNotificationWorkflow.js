import mongoose from "mongoose";
import { checkDocumentNotifications } from "./checkDocumentNotifications.js";
import { processPendingNotifications } from "./processPendingNotifications.js";
import { sendCronReport } from "../utils/sendCronReport.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Чтобы корректно работал __dirname в ES-модулях
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем .env из корня проекта
dotenv.config({ path: path.resolve(__dirname, ".env") });

const run = async () => {
  const today = new Date();
  let createdNotifications = 0;
  let sentMessages = 0;
  let totalDocuments = 0;

  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log("✅ Connected to MongoDB");

    const { created, documents } = await checkDocumentNotifications();
    createdNotifications = created;
    totalDocuments = documents;

    sentMessages = await processPendingNotifications();

    await sendCronReport({
      taskName: "Daily Notification Workflow",
      created: createdNotifications,
      sent: sentMessages,
    });

    // await checkDocumentNotifications();
    // await processPendingNotifications();

    console.log("🚀 Уведомления обработаны успешно");
  } catch (err) {
    console.error("❌ Ошибка:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
};

run();
