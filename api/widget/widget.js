// api/widget/widget.js
// The main code for the widget. All request processing logic is located here.
import 'dotenv/config';
import express from "express";
import { processMessage } from "../../services/aiw/core.js";

const router = express.Router();

// ── helpers ────────────────────────────────────────────────────────────────

function getIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress || req.ip;
}

function sseEncode(str = "") {
  return String(str).replace(/\r/g, "").replace(/\n/g, "\\n");
}

function setSSEHeaders(req, res) {
  if (res.headersSent) return;
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  if (typeof res.socket?.setNoDelay === "function") res.socket.setNoDelay(true);
  if (typeof res.flush === "function") res.flush();
}

function setJSONHeaders(req, res) {
  if (res.headersSent) return;
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}

function setSourceHeaders(res, source, citations = []) {
  try {
    res.setHeader("X-AIW-Source", source);
    res.setHeader("X-AIW-Citations-Count", String(citations.length || 0));
  } catch {}
}

// ── middleware ─────────────────────────────────────────────────────────────

router.use((req, _res, next) => {
  req.__trace = {
    start: Date.now(),
    id: Math.random().toString(36).slice(2),
    pid: process.pid,
    port: process.env.PORT || "",
  };
  next();
});

router.use((req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === "object") {
      if (!("source" in body)) body.source = "unknown";
      if (!("citations" in body)) body.citations = [];
    }
    return origJson(body);
  };
  next();
});

// ── /chat ──────────────────────────────────────────────────────────────────

router.post("/chat", async (req, res) => {
  const { messages = [], stream, meta = {} } = req.body || {};

  const identity = {
    siteId:      req.header("x-aiw-site")         || meta.siteId       || req.body?.siteId       || null,
    sessionId:   req.header("x-aiw-session")       || meta.sessionId    || req.body?.sessionId    || null,
    visitorId:   req.header("x-aiw-visitor")       || meta.visitorId    || null,
    clientId:    req.header("x-aiw-client")        || meta.clientId     || req.body?.clientId     || null,
    clientSlug:  req.header("x-aiw-client-slug")   || meta.clientSlug   || req.body?.clientSlug   || null,
    origin:      req.headers.origin || req.headers.referer || null,
  };

  const requestContext = {
    ip: getIp(req),
    userAgent: req.headers["user-agent"] || "",
  };

  let clientClosed = false;
  res.on("close", () => {
    console.log("[AIW][SSE] res close event fired");
    clientClosed = true;
  });

  const expose = [
    "X-AIW-Build", "X-AIW-Source", "X-AIW-Citations-Count",
    "X-AIW-Handler", "X-AIW-Resolved-Site", "X-AIW-Resolved-Session",
    "X-AIW-Phase", "X-AIW-DB", "X-AIW-Timing", "X-AIW-Good-Answer", "X-AIW-Client",
    "X-AIW-WidgetCfg", "X-AIW-Contexts", "X-AIW-Reply-Lang",
    "X-AIW-Detected-Lang", "X-AIW-Lang-Reason", "X-AIW-Retrieve-Mode",
  ].join(", ");
  const existingExpose = res.getHeader("Access-Control-Expose-Headers");
  res.setHeader("Access-Control-Expose-Headers", existingExpose ? existingExpose + ", " + expose : expose);
  res.setHeader("X-AIW-Handler", "aiwChat/chat");

  let heartbeatInterval = null;

  try {
    const result = await processMessage({
      messages,
      identity,
      meta,
      requestContext,
      stream,
      onStreamStart: () => {
        console.log("[AIW][SSE] onStreamStart called, headersSent:", res.headersSent);
        setSSEHeaders(req, res);
        res.write(": heartbeat\n\n");
        if (typeof res.flush === "function") res.flush();

        heartbeatInterval = setInterval(() => {
          if (!clientClosed) {
            try {
              res.write(": ping\n\n");
              if (typeof res.flush === "function") res.flush();
            } catch {}
          } else {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
        }, 2000);
      },
      onChunk: (text) => {
        console.log("[AIW][SSE] onChunk called, len:", text.length, "closed:", clientClosed);
        if (!clientClosed) {
          res.write(`data:${sseEncode(text)}\n\n`);
          if (typeof res.flush === "function") res.flush();
        }
      },
      isCancelled: () => clientClosed,
    });

    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }

    if (!res.headersSent) {
      if (result.siteId)                res.setHeader("X-AIW-Resolved-Site",   result.siteId);
      if (result.sessionId)             res.setHeader("X-AIW-Resolved-Session", result.sessionId);
      if (result.clientId)              res.setHeader("X-AIW-Client",           result.clientId);
      if (result.phase)                 res.setHeader("X-AIW-Phase",            result.phase);
      if (result.debug?.retrieveMode)   res.setHeader("X-AIW-Retrieve-Mode",    result.debug.retrieveMode);
      if (result.debug?.intentLabel)    res.setHeader("X-AIW-Intent",           result.debug.intentLabel);
      if (result.debug?.replyLang)      res.setHeader("X-AIW-Reply-Lang",       result.debug.replyLang);
      if (result.debug?.detectedLang)   res.setHeader("X-AIW-Detected-Lang",    result.debug.detectedLang);
      if (result.debug?.langReason)     res.setHeader("X-AIW-Lang-Reason",      result.debug.langReason);
      res.setHeader("X-AIW-Contexts",    String(result.debug?.contextsCount ?? 0));
      res.setHeader("X-AIW-Good-Answer", String(result.goodAnswer));
      res.setHeader("X-AIW-Source",      result.source || "unknown");
      res.setHeader("X-AIW-Citations-Count", String(result.citations?.length || 0));
      res.setHeader("X-AIW-Timing",      JSON.stringify(result.timings || {}));
    }

    if (result.streamed) {
      if (!clientClosed) { res.write("data: [DONE]\n\n"); res.end(); }
    } else {
      setJSONHeaders(req, res);
      setSourceHeaders(res, result.source, result.citations || []);
      return res.status(200).json({
        reply:      result.reply,
        source:     result.source,
        citations:  result.citations || [],
        goodAnswer: result.goodAnswer,
        confidence: result.confidence,
      });
    }
  } catch (e) {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    console.error("AIW /chat error:", e);
    if (!res.headersSent) return res.status(500).json({ ok: false, error: String(e) });
    try { res.write(`data:⚠️ Internal error\n\n`); res.write("data: [DONE]\n\n"); res.end(); } catch {}
  }
});

// ── utility routes ─────────────────────────────────────────────────────────

router.options("/chat", (req, res) => res.sendStatus(204));
router.get("/ping", (req, res) => res.json({ ok: true, t: Date.now() }));

router.get("/chat-debug-write", async (req, res) => {
  try {
    const { default: AiwSession } = await import("../../models/AiwSession.js");
    const { default: AiwMessage } = await import("../../models/AiwMessage.js");
    const sessionId = "debug-" + Date.now();
    const a = await AiwSession.create({ siteId: "debug-site", sessionId, startedAt: new Date() });
    const b = await AiwMessage.create({ siteId: "debug-site", sessionId, role: "assistant", content: "hello debug" });
    res.json({ ok: true, sessionId, a: a._id.toString(), b: b._id.toString() });
  } catch (e) {
    console.error("debug-write error", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/sse-test", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(": hello\n\n");
  let i = 0;
  const timer = setInterval(() => {
    i += 1;
    res.write(`data:tick ${i}\n\n`);
    if (i >= 5) { clearInterval(timer); res.write("data: [DONE]\n\n"); res.end(); }
  }, 500);
});

export default router;