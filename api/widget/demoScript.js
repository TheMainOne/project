import express from "express";
import WidgetDemoScript from "../../models/WidgetDemoScript.js";

const widgetDemoScriptRouter = express.Router();

function toMs(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((raw) => {
      const role = String(raw?.role || "").trim();
      const text = String(raw?.text || "").trim();
      if (!text) return null;
      if (role !== "user" && role !== "assistant") return null;
      return {
        role,
        text,
        typingMs: toMs(raw?.typingMs, 800),
        delayAfterMs: toMs(raw?.delayAfterMs, 1200),
      };
    })
    .filter(Boolean);
}

widgetDemoScriptRouter.get("/demo-script", async (req, res) => {
  try {
    const siteId = String(req.query.siteId || "").trim();
    if (!siteId) {
      return res.status(400).json({ error: "siteId is required" });
    }

    const doc = await WidgetDemoScript.findOne({ siteId }).lean();
    if (!doc || doc.enabled !== true) {
      return res.json({ enabled: false });
    }

    const lang = String(doc.lang || "en").trim().toLowerCase();
    if (!lang.startsWith("en")) {
      return res.json({ enabled: false });
    }

    return res.json({
      enabled: true,
      lang: "en",
      loop: doc.loop !== false,
      startDelayMs: toMs(doc.startDelayMs, 1200),
      messages: normalizeMessages(doc.messages),
    });
  } catch (error) {
    console.error("[widget-demo-script] GET /api/widget/demo-script failed:", error);
    return res.status(500).json({ error: "failed_to_load_demo_script" });
  }
});

export default widgetDemoScriptRouter;
