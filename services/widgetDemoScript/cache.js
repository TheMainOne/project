import { createHash } from "crypto";

const CACHE_TTL_MS = 5 * 60 * 1000;

if (!global.__WIDGET_DEMO_SCRIPT_CACHE) {
  global.__WIDGET_DEMO_SCRIPT_CACHE = new Map();
}

function normalizeSiteId(siteId) {
  return String(siteId || "").trim();
}

function buildEtagFromPayload(payload) {
  const body = JSON.stringify(payload);
  const hash = createHash("sha1").update(body).digest("hex");
  return { body, etag: `"${hash}"` };
}

export function getWidgetDemoScriptCacheEntry(siteId) {
  const key = normalizeSiteId(siteId);
  if (!key) return null;

  const entry = global.__WIDGET_DEMO_SCRIPT_CACHE.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    global.__WIDGET_DEMO_SCRIPT_CACHE.delete(key);
    return null;
  }

  return entry;
}

export function setWidgetDemoScriptCacheEntry(siteId, payload) {
  const key = normalizeSiteId(siteId);
  if (!key) return null;

  const { body, etag } = buildEtagFromPayload(payload);
  const entry = {
    payload,
    body,
    etag,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  global.__WIDGET_DEMO_SCRIPT_CACHE.set(key, entry);
  return entry;
}

export function invalidateWidgetDemoScriptCache(siteId) {
  const key = normalizeSiteId(siteId);
  if (!key) return;
  global.__WIDGET_DEMO_SCRIPT_CACHE.delete(key);
}

export function widgetDemoScriptEtagMatches(requestHeader, currentEtag) {
  if (!requestHeader || !currentEtag) return false;
  if (requestHeader.trim() === "*") return true;
  const tags = requestHeader.split(",").map((v) => v.trim()).filter(Boolean);
  return tags.includes(currentEtag);
}

