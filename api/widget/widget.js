// api/aiw.js
import express from "express";
import OpenAI from "openai";

const router = express.Router();

// ============ Конфигурация ============
const oai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MODEL = process.env.OPENAI_MODEL || "gpt-5-nano"; // можно сменить в .env
const CURRENCY = process.env.AIW_CURRENCY || "USD";

// Опционально: прайсинг/бандлы из .env (JSON)
// пример: AIW_PLANS='[{"name":"Growth","users":10,"price":299}]'
function loadPlans() {
  try {
    return JSON.parse(process.env.AIW_PLANS || "[]");
  } catch {
    return [];
  }
}

function buildSystemPrompt() {
  const plans = loadPlans();
  const plansText = plans.length
    ? plans
        .map(
          (p) =>
            `• ${p.name} — ${p.users || "n/a"} users — ${p.price} ${CURRENCY}/month`
        )
        .join("\n")
    : "• Growth Plan — 10 users — 299 USD/month\n• Annual discount — 20%";

  return [
    "You are a friendly, concise sales assistant for our website widget.",
    "Answer about pricing, product bundles, demos, and FAQs.",
    "Use the pricing context below if relevant. If information is missing, say so briefly.",
    "",
    "Pricing Context:",
    plansText,
    "",
    `Always use ${CURRENCY}. Keep answers short and skimmable.`,
  ].join("\n");
}

// Нормализуем входные сообщения (безопасность, длина)
function sanitizeMessages(messages = []) {
  const allowedRoles = new Set(["system", "user", "assistant"]);
  const trimmed = ("" + (messages?.length ? "" : "")).length; // noop, просто защитный трюк от undefined
  const arr = Array.isArray(messages) ? messages : [];
  const safe = arr
    .filter((m) => m && allowedRoles.has(m.role) && typeof m.content === "string")
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 4000), // ограничим длину
    }));
  // ограничим историю до последних 30
  return safe.slice(-30);
}

// Фолбэк-ответ, если нет ключа
function fallbackReply(messages = []) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const q = lastUser?.content || "—";
  return [
    `You asked: "${q}"`,
    "",
    "Demo reply (no OPENAI_API_KEY configured).",
    "For 10 users: Growth Plan — $299/month. Annual discount — 20%.",
  ].join("\n");
}

// ============ Маршрут /chat ============
router.post("/chat", async (req, res) => {
  try {
    const { messages = [], stream = true } = req.body || {};
    const safeMsgs = sanitizeMessages(messages);
    const sys = { role: "system", content: buildSystemPrompt() };

    // Если нет ключа — отдадим мок (и JSON, и стрим поддержаны)
    if (!oai) {
      const reply = fallbackReply(safeMsgs);
      if (stream) {
res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
res.setHeader("Vary", "Origin");
res.setHeader("Content-Type","text/event-stream; charset=utf-8");
res.setHeader("Cache-Control","no-cache, no-transform");
res.setHeader("Connection","keep-alive");
res.setHeader("X-Accel-Buffering", "no"); // для некоторых прокси
res.flushHeaders?.();                     // форсируем отправку заголовков
res.write(": heartbeat\n\n");             // первый байт — сразу (комментарий SSE)
        const parts = reply.split(" ");
        for (const w of parts) {
          res.write(`data: ${w}\n\n`);
          await new Promise((r) => setTimeout(r, 15));
        }
        res.write("data: [DONE]\n\n");
        return res.end();
      }
       if (!res.headersSent) {
        res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
        res.setHeader("Vary", "Origin");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
       }
       return res.status(200).json({ reply });
    }

  if (stream) {
  // ---------- STREAM (SSE) ----------
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // на всякий
  res.flushHeaders?.();

  // сразу «пнул» поток, чтобы клиент увидел открытие
  res.write(": heartbeat\n\n");

let clientClosed = false;
const endSafely = () => {
  if (!clientClosed) {
    clientClosed = true;
    try { res.end(); } catch {}
  }
};
req.on("close", endSafely);
req.on("aborted", endSafely);

  // watchdog: если за 20с не пришло ни одного токена — завершаем с сообщением
  let gotAnyToken = false;
  const watchdog = setTimeout(() => {
    if (!gotAnyToken && !clientClosed) {
      res.write(`data: ⚠️ No tokens yet, finishing.\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }, 20000);

  try {
    const response = await oai.chat.completions.create({
      model: MODEL,
      stream: true,
      // не передаём temperature (некоторые модели ругаются на нестандартные значения)
      messages: [sys, ...safeMsgs],
    });

    for await (const chunk of response) {
      if (clientClosed) break;

      // В новых SDK бывает 2 формата: delta.content или просто content
      const c = chunk?.choices?.[0];
      const delta = choice?.delta?.content ?? choice?.message?.content ?? "";

      if (delta) {
gotAnyToken = true;
    res.write(`data: ${delta}\n\n`);
      }

      // Если провайдер прислал finish_reason — завершаем
if (choice?.finish_reason) break;
    }
  } catch (err) {
    // если упали — покажем ошибку прямо в потоке, чтобы фронт не зависал
    if (!clientClosed) {
      const msg =
        (err && (err.message || err.toString())) || "Internal error";
      res.write(`data: ⚠️ ${msg}\n\n`);
    }
  } finally {
    clearTimeout(watchdog);
    if (!clientClosed) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }

  return;
}
 else {
      // ---------- JSON ----------
      const completion = await oai.chat.completions.create({
        model: MODEL,
        messages: [sys, ...safeMsgs],
      });
      const reply = completion.choices?.[0]?.message?.content?.trim() || "";
      if (!res.headersSent) {
        res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
        res.setHeader("Vary", "Origin");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      return res.status(200).json({ reply });
    }
  } catch (e) {
    console.error("AIW /chat error:", e);
    // Если уже начали SSE — завершим потоком
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal error" });
    } else {
      try {
        res.write(`data: ⚠️ Internal error\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      } catch {}
    }
  }
});
router.options("/chat", (req, res) => res.sendStatus(204));
router.get("/ping", (req, res) => res.json({ ok: true, t: Date.now() }));

// for testing purpose
router.get("/sse-test", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write(": hello\n\n"); // комментарий — чтобы клиент сразу «увидел» поток

  let i = 0;
  const timer = setInterval(() => {
    i += 1;
    res.write(`data: tick ${i}\n\n`);
    if (i >= 5) {
      clearInterval(timer);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }, 500);
});


export default router;
