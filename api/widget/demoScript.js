import express from "express";
import WidgetDemoScript from "../../models/WidgetDemoScript.js";
import {
  getWidgetDemoScriptCacheEntry,
  setWidgetDemoScriptCacheEntry,
  widgetDemoScriptEtagMatches,
} from "../../services/widgetDemoScript/cache.js";

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

function buildDisabledPayload() {
  return { enabled: false };
}

function buildEnabledPayload(doc) {
  return {
    enabled: true,
    lang: "en",
    loop: doc.loop !== false,
    startDelayMs: toMs(doc.startDelayMs, 1200),
    messages: normalizeMessages(doc.messages),
  };
}

function isTruthy(value) {
  if (typeof value === "boolean") return value;
  const v = String(value || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function sendCachedJson(req, res, cacheEntry) {
  res.set("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=60");
  res.set("ETag", cacheEntry.etag);

  if (widgetDemoScriptEtagMatches(req.headers["if-none-match"], cacheEntry.etag)) {
    return res.status(304).end();
  }

  return res.type("application/json").send(cacheEntry.body);
}

widgetDemoScriptRouter.get("/demo-script", async (req, res) => {
  try {
    const siteId = String(req.query.siteId || "").trim();
    if (!siteId) {
      res.set("Cache-Control", "no-store");
      return res.status(400).json({ error: "siteId is required" });
    }

    const bypassCache = isTruthy(req.query.fresh) || isTruthy(req.query.noCache);
    const cached = bypassCache ? null : getWidgetDemoScriptCacheEntry(siteId);
    if (cached) {
      return sendCachedJson(req, res, cached);
    }

    const doc = await WidgetDemoScript.findOne({ siteId }).lean();
    if (!doc || doc.enabled !== true) {
      return sendCachedJson(req, res, setWidgetDemoScriptCacheEntry(siteId, buildDisabledPayload()));
    }

    const lang = String(doc.lang || "en").trim().toLowerCase();
    if (!lang.startsWith("en")) {
      return sendCachedJson(req, res, setWidgetDemoScriptCacheEntry(siteId, buildDisabledPayload()));
    }

    return sendCachedJson(req, res, setWidgetDemoScriptCacheEntry(siteId, buildEnabledPayload(doc)));
  } catch (error) {
    console.error("[widget-demo-script] GET /api/widget/demo-script failed:", error);
    res.set("Cache-Control", "no-store");
    return res.status(500).json({ error: "failed_to_load_demo_script" });
  }
});

export default widgetDemoScriptRouter;
