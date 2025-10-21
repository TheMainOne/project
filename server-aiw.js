// server.js
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';

import widgetRouter from './api/widget/widget.js';
import retrieveRouter from './api/widget/aiwSearch.js';
import chatRouter from './api/widget/aiwChat.js';

import AiwMessage from './models/AiwMessage.js';
import AiwSession from './models/AiwSession.js';


const app = express();
app.use(express.json({ limit: '1mb' }));

// чтобы корректно брать IP из X-Forwarded-For за Nginx
app.set('trust proxy', true);

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
app.use('/aiw', retrieveRouter);  // => /aiw/<твои пути в этом роутере>
app.use('/aiw', widgetRouter);    // => /aiw/<...>

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
