import "dotenv/config";
import express from "express";
import morgan from "morgan";
import cors from "cors";
import mongoose from "mongoose";
import errorHandler from "./middlewares/errorHandler.js";
import authRouter from "./api/auth.js";
import sendTelegramMessage from "./services/telegramNotify.js";

const PORT = process.env.PORT || 3000;
const uriDB = process.env.DATABASE_URL;
const connection = mongoose
  .connect(uriDB, {
    dbName: "materials_reader",
  })
  .then(() => {
    app.listen(PORT, function () {
      console.log(
        `Database connection successful. Use our API on port: ${PORT}`
      );
    });
  })
  .catch((err) => {
    console.log(`Server not running. Error message: ${err.message}`);
    process.exit(1);
  });

const app = express();

app.use(morgan("tiny"));
app.use(cors());
app.use(express.json());

// Настройка папки для статической раздачи файлов
app.use("/uploads", express.static("uploads"));

// connecting api routes

app.use("/", authRouter);

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

// global error handlers
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  sendTelegramMessage(`❗️ Uncaught Exception: ${err.message}`);
  process.exit(1); // reboots the app
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  sendTelegramMessage(`⚠️ Unhandled Rejection: ${reason}`);
});
