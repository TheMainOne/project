// server-aiw.js - an old code that is not used anymore, but kept for reference. The main server file is now app.js
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import { randomUUID } from "crypto";
import cors from 'cors';   
import widgetRouter from './api/widget/widget.js';
import retrieveRouter from './api/widget/aiwSearch.js';
import chatRouter from './api/widget/aiwChat.js';

import AiwMessage from './models/AiwMessage.js';
import AiwSession from './models/AiwSession.js';
import authRouter from './api/auth.js';
mongoose.set("debug", true);

const app = express();
app.use(express.json({ limit: '1mb' }));

// чтобы корректно брать IP из X-Forwarded-For за Nginx
app.set('trust proxy', true);

const corsOptions = {
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Origin",
    "Accept",
    "X-AIW-Site",
    "X-AIW-Visitor",
    "X-AIW-Session",
  ],
  credentials: false,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ===== CORS (ДО всех роутов) =====
const ALLOWED_ORIGINS = [
  'https://themainone.github.io',      // твой фронт
  'http://localhost:5173',   
  'http://localhost:8080',          // локальная разработка
  'https://cloudcompliance.duckdns.org'
];

// app.use(cors({
//   origin: (origin, cb) => {
//     if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
//     return cb(new Error('Not allowed by CORS'));
//   },
//   credentials: true, // нужно если используешь cookie/сессионки
//   methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
//   allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept','Origin']
// }));

// // preflight на всё
// app.options('*', cors());
// // =================================

// для тестирования 
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

// для тестирования 


// 1) Глобальный коннект к Mongo (ОДИН РАЗ)
const MONGODB_URI = process.env.DATABASE_URL;
await mongoose.connect(MONGODB_URI, {
  autoIndex: true,
});
await AiwMessage.createCollection().catch(() => {});
await AiwMessage.syncIndexes();
await AiwSession.createCollection().catch(() => {});
await AiwSession.syncIndexes();
console.log('[AIW] Mongo connected:', mongoose.connection.name);

// 2) Хелсчек
app.get('/ping', (req, res) => res.json({ ok: true, t: Date.now() }));

// 3) Корректные пути (совместимо с твоим Nginx конфигом)
// Было: app.use("/", ...). Делай так:
app.use('/aiw', chatRouter);      // => /aiw/chat
app.use('/api/aiw', chatRouter);      // => /aiw/chat
app.use('/aiw', retrieveRouter);  // => /aiw/<твои пути в этом роутере>
app.use('/aiw', widgetRouter);    // => /aiw/<...>
app.use('/aiw/auth', authRouter);   // => /auth/<твои пути в этом роутере>

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Для префлайта, если напрямую ходишь в Node (через Nginx уже настроено)
app.options('/aiw/chat', (req, res) => res.sendStatus(204));



const PORT = 8088;
app.listen(PORT, () => {
  console.log(`AIW server listening on :${PORT}`);
});



// import express from "express";
// import router from "./api/widget/widget.js";
// import retrieveRouter from "./api/widget/aiwSearch.js";
// import chatRouter from "./api/widget/aiwChat.js";

// const app = express();
// app.use(express.json({ limit: "1mb" }));

// // Хелсчек
// app.get("/ping", (req, res) => res.json({ ok: true, t: Date.now() }));

// // Монтируем твой роутер ИМЕННО на корень -> конечные пути: /chat и /ping (из aiw.js)
// app.use("/", router);
// app.use(retrieveRouter);
// app.use(chatRouter);

// const PORT = 8088;
// app.listen(PORT, () => {
//   console.log(`AIW server listening on :${PORT}`);
// });
