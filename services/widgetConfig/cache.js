import WidgetConfig from "../../models/WidgetConfig.js";

const CACHE_TTL_MS = 60 * 1000; // 1 мин
if (!global.__WIDGET_CFG_CACHE) global.__WIDGET_CFG_CACHE = new Map();

export async function getWidgetConfigCached({ clientId, siteId }) {
  const filter = { ...(clientId ? { clientId } : {}), ...(siteId ? { siteId } : {}) };
  const key = JSON.stringify(filter);
  const hit = global.__WIDGET_CFG_CACHE.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const cfg = await WidgetConfig.findOne(filter).lean();
  global.__WIDGET_CFG_CACHE.set(key, { ts: Date.now(), data: cfg });
  return cfg;
}

