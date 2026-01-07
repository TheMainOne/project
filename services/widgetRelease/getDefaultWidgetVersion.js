import WidgetReleaseSettings from "../../models/WidgetReleaseSettings.js";

// a simple in-memory cache to avoid hitting the database for every widget request
let cached = null;
let cachedAt = 0;

const TTL_MS = 60_000;           // 60 secs
const FALLBACK_VERSION = "1.0.0"; // if the DB is empty

export async function getDefaultWidgetVersion() {
  const now = Date.now();
  if (cached && (now - cachedAt) < TTL_MS) return cached;

  const doc = await WidgetReleaseSettings.findById("global").lean();
  const ver = (doc?.defaultWidgetVersion || FALLBACK_VERSION).trim();

  cached = ver;
  cachedAt = now;

  return ver;
}

// Useful for admin panel/updates (to clear the cache immediately)
export function invalidateDefaultWidgetVersionCache() {
  cached = null;
  cachedAt = 0;
}
