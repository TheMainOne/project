import WidgetConfig from "../../models/WidgetConfig.js";

const CACHE_TTL_MS = 60 * 1000;
if (!global.__WIDGET_CFG_CACHE) global.__WIDGET_CFG_CACHE = new Map();

export async function getWidgetConfigCached({ clientId, siteId }) {
  const filter = {
    ...(clientId ? { clientId } : {}),
    ...(siteId ? { siteId } : {}),
  };
  const key = JSON.stringify(filter);
  const hit = global.__WIDGET_CFG_CACHE.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  let cfg = await WidgetConfig.findOne(filter).lean();

  // Fallback: if siteId was in the filter but nothing found,
  // try clientId-only (covers Telegram and other non-web channels)
  if (!cfg && clientId && siteId) {
    const fallbackKey = JSON.stringify({ clientId });
    const fallbackHit = global.__WIDGET_CFG_CACHE.get(fallbackKey);
    if (fallbackHit && Date.now() - fallbackHit.ts < CACHE_TTL_MS) {
      cfg = fallbackHit.data;
    } else {
      cfg = await WidgetConfig.findOne({ clientId }).lean();
      global.__WIDGET_CFG_CACHE.set(fallbackKey, { ts: Date.now(), data: cfg });
    }
  }

  global.__WIDGET_CFG_CACHE.set(key, { ts: Date.now(), data: cfg });
  return cfg;
}