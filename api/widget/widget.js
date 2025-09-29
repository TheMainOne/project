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
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        const parts = reply.split(" ");
        for (const w of parts) {
          res.write(`data: ${w} \n\n`);
          await new Promise((r) => setTimeout(r, 15));
        }
        res.write("data: [DONE]\n\n");
        return res.end();
      }
      return res.json({ reply });
    }

    if (stream) {
      // ---------- STREAM (SSE) ----------
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");

      let clientClosed = false;
      req.on("close", () => {
        clientClosed = true;
        try {
          res.end();
        } catch {}
      });

      const response = await oai.chat.completions.create({
        model: MODEL,
        stream: true,
        temperature: 0.2,
        messages: [sys, ...safeMsgs],
      });

      for await (const chunk of response) {
        if (clientClosed) break;
        const delta = chunk?.choices?.[0]?.delta?.content || "";
        if (delta) {
          // Отправляем корректный SSE-формат: "data: ...\n\n"
          res.write(`data: ${delta}\n\n`);
        }
      }
      if (!clientClosed) {
        res.write("data: [DONE]\n\n");
        res.end();
      }
      return;
    } else {
      // ---------- JSON ----------
      const completion = await oai.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        messages: [sys, ...safeMsgs],
      });
      const reply = completion.choices?.[0]?.message?.content?.trim() || "";
      return res.json({ reply });
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

export default router;
