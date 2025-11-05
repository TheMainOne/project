import "dotenv/config";
import express from "express";
import morgan from "morgan";
import cors from "cors";
import mongoose from "mongoose";
import errorHandler from "./middlewares/errorHandler.js";
import authRouter from "./api/auth.js";
import clientRouter from "./api/clientRoutes.js";
import adminUsersRouter from "./api/adminUsers.js";
import sendTelegramMessage from "./services/telegramNotify.js";
import { webhookCallback } from "grammy";
import createBot from "./src/bot.js";


/* ======================
   Bot env/config
====================== */
const BOT_TOKEN = process.env.AD_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "dev-secret";
const BASE_URL = process.env.BASE_URL || "";
const PUBLIC_IP = process.env.PUBLIC_IP || "";
if (!BOT_TOKEN) {
  console.error("AD_BOT_TOKEN is required");
  process.exit(1);
}
/* ====================== */

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan("tiny"));
// app.use(cors());
// app.use(cors({
//   origin: true,                     // echo Origin
//   methods: ["GET", "POST", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"],
//   credentials: false
// }));

// Явная обработка preflight для всех путей
app.options("*", cors());
app.use(express.json());

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

    // твои API роуты
    app.use("/api/auth", authRouter);
    app.use("/api/clients", clientRouter);
    app.use("/api/users", adminUsersRouter);
    // app.use("/widget", widgetRouter);
    // app.use(retrieveRouter);
    // app.use(chatRouter);

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

// const PORT = process.env.PORT || 3000;
// const uriDB = process.env.DATABASE_URL;

// const connection = mongoose
//   .connect(uriDB, { dbName: "materials_reader" })
//   .then(() => {
//     const bot = createBot(BOT_TOKEN);

//     bot
//       .start({ drop_pending_updates: true })
//       .catch((e) => console.error("Bot start error:", e));
//     console.log("Bot started in long-polling mode");

//     // // повесить вебхук-роут
//     // app.post(`/webhook/${WEBHOOK_SECRET}`, (req, res, next) => {
//     //   const token = req.get("X-Telegram-Bot-Api-Secret-Token");
//     //   if (token && token !== WEBHOOK_SECRET) return res.sendStatus(401);
//     //   return webhookCallback(bot, "express")(req, res, next);
//     // });

//     app.listen(PORT, function () {
//       console.log(
//         `Database connection successful. Use our API on port: ${PORT}`
//       );

//       if (BASE_URL) {
//         // bot.api
//         //   .setWebhook(`${BASE_URL}/webhook/${WEBHOOK_SECRET}`, {
//         //     secret_token: WEBHOOK_SECRET,
//         //     drop_pending_updates: true,
//         //     // allowed_updates: ["message","callback_query"],
//         //   })
//         //   .then(() => console.log("Telegram webhook set"))
//         //   .catch((e) => console.error("Webhook setup error:", e));
//       } else {
//         console.warn(
//           "BASE_URL not set — skipping webhook (see Variant B for long polling)."
//         );
//       }
//     });
//   })
//   .catch((err) => {
//     console.log(`Server not running. Error message: ${err.message}`);
//     process.exit(1);
//   });

// // const connection = mongoose
// //   .connect(uriDB, {
// //     dbName: "materials_reader",
// //   })
// //   .then(() => {
// //     app.listen(PORT, function () {
// //       console.log(
// //         `Database connection successful. Use our API on port: ${PORT}`
// //       );
// //     });
// //   })
// // .catch((err) => {
// //   console.log(`Server not running. Error message: ${err.message}`);
// //   process.exit(1);
// // });

// const app = express();

// app.use(morgan("tiny"));
// app.use(cors());
// app.use(express.json());

// // Настройка папки для статической раздачи файлов
// app.use("/uploads", express.static("uploads"));

// // connecting api routes

// app.use("/", authRouter);

// // error handlers
// app.use(errorHandler);

// app.use((_, res, __) => {
//   res.status(404).json({
//     status: "error",
//     code: 404,
//     message: "Use api on routes: /api/materials",
//     data: "Not found",
//   });
// });

// // global error handlers
// process.on("uncaughtException", (err) => {
//   console.error("Uncaught Exception:", err);
//   sendTelegramMessage(`❗️ Uncaught Exception: ${err.message}`);
//   process.exit(1); // reboots the app
// });

// process.on("unhandledRejection", (reason, promise) => {
//   console.error("Unhandled Rejection at:", promise, "reason:", reason);
//   sendTelegramMessage(`⚠️ Unhandled Rejection: ${reason}`);
// });
