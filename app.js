import "dotenv/config";
import express from "express";
import morgan from "morgan";
import cors from "cors";
import mongoose from "mongoose";
import errorHandler from "./middlewares/errorHandler.js";
import authRouter from "./api/auth.js";
import clientRouter from "./api/clientRoutes.js";
import adminUsersRouter from "./api/adminUsers.js";
import aiwStatsRouter from "./api/aiwStats.js";
import sendTelegramMessage from "./services/telegramNotify.js";
import widgetRouter from "./api/widget/widget.js";
import retrieveRouter from "./api/widget/aiwSearch.js";
import chatRouter from "./api/widget/aiwChat.js";
import createBot from "./src/bot.js";
import { randomUUID } from "crypto";
import { webhookCallback } from "grammy";

mongoose.set("debug", true);

/* ======================
   Bot env/config
====================== */
const BOT_TOKEN = process.env.AD_BOT_TOKEN;
const BASE_URL = process.env.BASE_URL || "";
const PUBLIC_IP = process.env.PUBLIC_IP || "";
if (!BOT_TOKEN) {
  console.error("AD_BOT_TOKEN is required");
  process.exit(1);
}
/* ====================== */

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(morgan("tiny"));

app.use((req, res, next) => {
  // Уникальный traceId для запроса
  const traceId = randomUUID();
  const t0 = Date.now();

  // Сохраним немного контекста
  req.__trace = {
    id: traceId,
    start: t0,
    baseUrl: req.baseUrl,
    originalUrl: req.originalUrl,
    pid: process.pid,
    port: process.env.PORT || "unknown",
  };

  // Когда ответ уходит — поставим системные заголовки
  res.on("finish", () => {
    // ничего — всё проставим прямо в хендлере
  });

  next();
});


// Явная обработка preflight для всех путей
app.options("*", cors());
app.use(express.json({ limit: '1mb' }));

/* ======================
   Mongo + Bot + Webhook
====================== */
const uriDB = process.env.DATABASE_URL;

mongoose
  .connect(uriDB, { dbName: "materials_reader" })
  .then(async () => {
    // создаём бота только ПОСЛЕ подключения к Mongo
    const bot = createBot(BOT_TOKEN);

    app.post("/bot/webhook", (req, res, next) => {
      // Разрешаем ручной "пинг", чтобы не валить grammy тестовым телом
      if (req.body && req.body.ping) {
        return res.status(200).json({ ok: true });
      }
      return webhookCallback(bot, "express")(req, res, next);
    });

    // статические файлы
    app.use("/uploads", express.static("uploads"));

    //  API роуты
    app.use("/api/auth", authRouter);
    app.use("/api/clients", clientRouter);
    app.use("/api/users", adminUsersRouter);
    app.use("/api/statistic", aiwStatsRouter);

        // AIW-роуты (из server-aiw.js)
    // app.get("/ping", (req, res) => res.json({ ok: true, t: Date.now() }));
    app.get("/ping", (req, res) => {
  res.json({
    ok: true,
    t: Date.now(),
    from: "app.js:3000",
  });
});
    app.use("/aiw", chatRouter);      // => /aiw/chat
    app.use("/api/aiw", chatRouter);  // если тебе нужно дублировать
    app.use("/aiw", retrieveRouter);  // /aiw/search и т.п.
    app.use("/aiw", widgetRouter);    // /aiw/widget-config и т.п.

    // error handlers
    app.use(errorHandler);
    app.use((_, res, __) => {
      res.status(404).json({
        status: "error",
        code: 404,
        message: "Use api on routes: /api/materials",
        data: "Not found",
      });
    });

    // запускаем HTTP-сервер
    app.listen(PORT, async () => {
      console.log(
        `Database connection successful. Use our API on port: ${PORT}`
      );

      if (!BASE_URL) {
        console.warn("BASE_URL not set — webhook won't be configured.");
        console.warn(
          "For local dev, use ngrok and set BASE_URL to its https URL."
        );
        return;
      }

      try {
        // ставим webhook
        const options = {
          drop_pending_updates: true,
        };
        if (PUBLIC_IP) options.ip_address = PUBLIC_IP;

        await bot.api.setWebhook(`${BASE_URL}/bot/webhook`, options);
      } catch (e) {
        console.error("Webhook setup error:", e);
        // ВАЖНО: без fallback на long polling, чтобы не было конфликта режимов
      }
    });
  })
  .catch((err) => {
    console.log(`Server not running. Error message: ${err.message}`);
    process.exit(1);
  });

// глобальные error handlers
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  sendTelegramMessage(`❗️ Uncaught Exception: ${err.message}`);
  process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  sendTelegramMessage(`⚠️ Unhandled Rejection: ${reason}`);
});
