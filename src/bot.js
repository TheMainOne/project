import OpenAI from "openai";
import pino from "pino";
import { Bot } from "grammy";
import { collections } from "./db.js";

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// делаем ответ модели “заземлённым” на данные канала
async function answerWithAI(userText, ch) {
  const system = [
    "Ты — приветливый ассистент рекламного канала в Telegram.",
    "Отвечай кратко и по делу. Если вопрос вне темы канала — скажи, что отвечаешь только по правилам/форматам/ценам/слотам/контактам.",
    "Используй только факты из контекста ниже. Если факта нет — честно говори, что информации нет.",
  ].join("\n");

  const context = JSON.stringify({
    title: ch.title,
    username: ch.username,
    introHtml: ch.introHtml,
    rulesHtml: ch.rulesHtml,
    formats: ch.formats,
    slots: ch.slots,
    owner: ch.owner,
  });

  // Responses API (совместимо и с chat.completions), выбери модель по вкусу
  const resp = await oai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `Вопрос: ${userText}\n\nКонтекст канала (JSON): ${context}`,
      },
    ],
  });

  return resp.choices[0]?.message?.content?.trim() || "Не понял запрос.";
}

function toTelegramHtml(html = "") {
  // Простая адаптация: <br> -> \n, закрывающий </p> -> \n\n
  let s = String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "");

  // Заменим списки: </li> -> \n, уберём <ul>/<ol>/<li>
  s = s.replace(/<\/li>/gi, "\n").replace(/<(\/)?(ul|ol|li)[^>]*>/gi, "");

  // Оставим базовые теги Telegram, остальное вырежем
  // Разрешённые: b,i,u,s,em,strong,code,pre,a,tg-spoiler
  s = s.replace(
    /<\/?(?!b|i|u|s|em|strong|code|pre|a|tg-spoiler)\w+[^>]*>/gi,
    ""
  );

  // Убедимся, что ссылки имеют только href
  s = s.replace(/<a\s+([^>]+)>/gi, (m, attrs) => {
    const hrefMatch = attrs.match(/href\s*=\s*"(.*?)"/i);
    const href = hrefMatch ? hrefMatch[1] : "#";
    return `<a href="${href}">`;
  });

  // Сжимаем лишние пустые строки
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s || "Правила будут добавлены.";
}

function chunkText(s, limit = 4096) {
  const chunks = [];
  let i = 0;
  while (i < s.length) {
    chunks.push(s.slice(i, i + limit));
    i += limit;
  }
  return chunks;
}

async function sendHtmlOrEdit(ctx, text, opts) {
  // Сначала пробуем отредактировать исходное сообщение
  try {
    await ctx.editMessageText(text, opts);
    return;
  } catch (e) {
    console.error("editMessageText error:", e?.description || e?.message || e);
  }
  // Если не получилось — отправим новое сообщение
  try {
    await ctx.reply(text, opts);
  } catch (e2) {
    console.error("reply error:", e2?.description || e2?.message || e2);
  }
}

function menu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "ℹ️ Инфо", callback_data: "info" },
          { text: "🔗 Ссылка", callback_data: "link" },
        ],
        [{ text: "💰 Форматы и цены", callback_data: "prices" }],
        [
          { text: "🗓️ Слоты", callback_data: "slots" },
          { text: "📜 Правила", callback_data: "rules" },
        ],
        [{ text: "👤 Связаться с владельцем", callback_data: "contact" }],
      ],
    },
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
}

const render = {
  info: (ch) => `<b>${ch.title}</b>\n${ch.username ? "@" + ch.username : ""}`,
  link: (ch) =>
    ch.username
      ? `Ссылка на канал:\n<a href="https://t.me/${ch.username}">https://t.me/${ch.username}</a>`
      : "Ссылка недоступна.",
  intro: (ch) => ch.introHtml || "Вступительная информация будет добавлена.",
  rules: (ch) => ch.rulesHtml || "Правила будут добавлены.",
  prices: (ch) => {
    const lines = ["<b>Форматы и цены</b>"];
    for (const f of ch.formats || []) {
      const price = Math.round((f.priceCents || 0) / 100);
      lines.push(`• ${f.title}: ${price} ${f.currency || "USD"}`);
    }
    return lines.join("\n");
  },
  slots: (ch) => {
    const m = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    const tz = ch?.slots?.timezone || "UTC";
    const weekly = ch?.slots?.weekly || [];
    if (!weekly.length) return "Слоты пока не опубликованы.";
    const items = weekly.map((s) => `• ${m[s.dow]} ${s.time}`).join("\n");
    return `<b>Слоты размещения</b>\nТаймзона: ${tz}\n${items}`;
  },
  welcomeNew: (ch) => {
    const url = ch.username
      ? `\nСсылка: <a href="https://t.me/${ch.username}">https://t.me/${ch.username}</a>`
      : "";
    return `<b>Добро пожаловать!</b>\nКанал: <b>${ch.title}</b>${url}\n\nВыберите раздел ниже или задайте вопрос.`;
  },
  welcomeBack: (ch) => {
    const url = ch.username
      ? `\nСсылка: <a href="https://t.me/${ch.username}">https://t.me/${ch.username}</a>`
      : "";
    return `Снова на связи с каналом <b>${ch.title}</b>${url}\n\nЧто показать?`;
  },
};

// helpers
function parseStartPayload(text) {
  if (!text) return null;
  const m = text.match(/^\/start(?:\s+(\S+))?/i);
  return m ? m[1] || null : null;
}

async function upsertPair(chatId, channelUid) {
  const { SessionsPair } = collections();
  const res = await SessionsPair.updateOne(
    { chatId, channelUid },
    {
      $inc: { messageCount: 1 },
      $currentDate: { lastSeenAt: true },
      $setOnInsert: {
        step: "idle",
        payload: {},
        lastIntent: null,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
  return !!res.upsertedId; // true = первый раз для этой пары
}

async function setActiveChannel(chatId, channelUid) {
  const { SessionsGlobal } = collections();
  await SessionsGlobal.updateOne(
    { chatId },
    {
      $set: {
        activeChannelUid: channelUid,
        updatedAt: new Date(),
        lastSeenAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
}

async function resolveChannelUid(ctx) {
  const { SessionsGlobal } = collections();
  const chatId = ctx.chat?.id;
  const text = ctx.message?.text || "";
  const payload = parseStartPayload(text);
  if (payload) return { uid: payload, from: "start" };
  const g = await SessionsGlobal.findOne({ chatId });
  if (g?.activeChannelUid) return { uid: g.activeChannelUid, from: "global" };
  return { uid: null, from: "none" };
}

function attachHandlers(bot) {
  const { Channels, UpdatesSeen } = collections();

  // дедуп по update_id (рекомендуется)
  bot.use(async (ctx, next) => {
    const up = ctx.update;
    if (!up || up.update_id === undefined) return next();
    try {
      await UpdatesSeen.insertOne({
        _id: String(up.update_id),
        ts: new Date(),
      });
    } catch (e) {
      if (e && e.code === 11000) return; // дубликат → пропускаем обработку
    }
    return next();
  });

  // /start
  bot.command("start", async (ctx) => {
    const chatId = ctx.chat.id;
    const payload = ctx.match; // grammY даёт всё после /start
    if (payload) {
      const ch = await Channels.findOne({ uid: payload });
      if (!ch)
        return ctx.reply(
          "Код канала не найден. Выберите канал из списка /start"
        );
      const firstTime = await upsertPair(chatId, payload);
      await setActiveChannel(chatId, payload);
      return ctx.reply(
        firstTime ? render.welcomeNew(ch) : render.welcomeBack(ch),
        menu()
      );
    } else {
      // без payload — смотрим активный канал
      const { uid } = await resolveChannelUid(ctx);
      if (!uid) {
        const list = await Channels.find({ isActive: true })
          .project({ uid: 1, title: 1 })
          .toArray();
        if (!list.length) return ctx.reply("Нет доступных каналов.");
        const kb = list.map((c) => [
          { text: c.title, callback_data: "set:" + c.uid },
        ]);
        return ctx.reply("Выберите канал:", {
          reply_markup: { inline_keyboard: kb },
        });
      }
      const ch = await Channels.findOne({ uid });
      if (!ch) return ctx.reply("Активный канал недоступен, выберите другой.");
      await upsertPair(chatId, uid);
      return ctx.reply(render.welcomeBack(ch), menu());
    }
  });

  // Кнопки
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data || "";

    // Ответить как можно раньше (и не падать, если уже поздно)
    await ctx.answerCallbackQuery().catch(() => {});

    const chatId = ctx.chat.id;

    if (data.startsWith("set:")) {
      const uid = data.split(":")[1];
      const { Channels } = collections();
      const ch = await Channels.findOne({ uid });
      if (!ch) return ctx.editMessageText("Канал не найден.");

      const firstTime = await upsertPair(chatId, uid);
      await setActiveChannel(chatId, uid);

      // edit + меню, ошибки гасим (сообщение могло быть удалено)
      await ctx
        .editMessageText(
          firstTime ? render.welcomeNew(ch) : render.welcomeBack(ch),
          menu()
        )
        .catch(() => {});
      return;
    }

    const { uid } = await resolveChannelUid(ctx);
    if (!uid) return; // уже ответили выше

    const { Channels } = collections();
    const ch = await Channels.findOne({ uid });
    if (!ch) return;

    await upsertPair(chatId, uid);

    const map = {
      info: (ch) => render.info(ch),
      link: (ch) => render.link(ch),
      intro: (ch) => toTelegramHtml(render.intro(ch)),
      prices: (ch) => toTelegramHtml(render.prices(ch)),
      slots: (ch) => toTelegramHtml(render.slots(ch)),
      rules: (ch) => toTelegramHtml(render.rules(ch)),
      contact: (ch) =>
        ch.owner?.username
          ? `Напишите владельцу: @${ch.owner.username}`
          : "Контакт владельца недоступен.",
    };
    const fn = map[data];
    if (!fn) return;

    const text = fn(ch);
    const chunks = chunkText(text, 4000);

    if (chunks.length === 1) {
      await sendHtmlOrEdit(ctx, chunks[0], menu());
    } else {
      // 1) правим исходное сообщение первым чанком
      await sendHtmlOrEdit(ctx, chunks[0], {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });

      // 2) серединки — просто новые сообщения
      for (let i = 1; i < chunks.length - 1; i++) {
        await ctx.reply(chunks[i], {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
      }

      // 3) завершающий чанк — с меню
      await ctx.reply(chunks[chunks.length - 1], menu());
    }
  });

  // Текстовые сообщения
  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = (ctx.message.text || "").toLowerCase();
    if (text.startsWith("/start")) return; // уже разбирается выше

    const { uid } = await resolveChannelUid(ctx);
    if (!uid) {
      const list = await Channels.find({ isActive: true })
        .project({ uid: 1, title: 1 })
        .toArray();
      const kb = list.map((c) => [
        { text: c.title, callback_data: "set:" + c.uid },
      ]);
      return ctx.reply("Выберите канал:", {
        reply_markup: { inline_keyboard: kb },
      });
    }
    const ch = await Channels.findOne({ uid });
    if (!ch) return ctx.reply("Канал недоступен.");
    await upsertPair(chatId, uid);

    let answer;
    if (/название|name|title|info|инфо/.test(text)) answer = render.info(ch);
    else if (/ссылка|link/.test(text)) answer = render.link(ch);
    else if (/вступлен|intro/.test(text)) answer = render.intro(ch);
    else if (/формат|цены|price|prices/.test(text)) answer = render.prices(ch);
    else if (/слот|slots|расписан/.test(text)) answer = render.slots(ch);
    else if (/правил|policy|rules/.test(text)) answer = render.rules(ch);
    else if (/связать|contact/.test(text))
      answer = ch.owner?.username
        ? `Напишите владельцу: @${ch.owner.username}`
        : "Контакт владельца недоступен.";
    else {
      // последний рубеж — умный ответ от LLM на основе данных канала
      try {
        answer = await answerWithAI(ctx.message.text, ch);
      } catch (e) {
        console.error("LLM error:", e);
        answer =
          "Не смог ответить на кастомный вопрос. Попробуйте выбрать раздел ниже.";
      }
    }
    await ctx.reply(answer, menu());
  });
}

function createBot(token) {
  const bot = new Bot(token);
  attachHandlers(bot);
  return bot;
}

export default createBot;
