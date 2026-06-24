import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), "config", "businessYoutubeChannels.json");
const DEFAULT_LANGUAGE_HINTS = ["ru", "en"];

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function parsePositiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toCleanString(value) {
  return String(value || "").trim();
}

function normalizeLanguageHints(value) {
  const hints = Array.isArray(value) ? value : DEFAULT_LANGUAGE_HINTS;
  const normalized = hints
    .map((item) => toCleanString(item).toLowerCase())
    .filter(Boolean);

  return normalized.length ? [...new Set(normalized)] : DEFAULT_LANGUAGE_HINTS;
}

function normalizeChannel(item, index, sourcePath) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`Invalid channel config entry at index ${index} in ${sourcePath}`);
  }

  const enabled = item.enabled !== false;
  const channelId = toCleanString(item.channelId);
  const name = toCleanString(item.name) || channelId || `Channel ${index + 1}`;
  const url = toCleanString(item.url);

  if (enabled && !channelId) {
    throw new Error(`Enabled channel "${name}" is missing channelId in ${sourcePath}`);
  }

  return {
    name,
    channelId,
    url,
    enabled,
    languageHints: normalizeLanguageHints(item.languageHints),
  };
}

export function parseBusinessYoutubeChannelConfig(raw, { sourcePath = DEFAULT_CONFIG_PATH } = {}) {
  const parsed = JSON.parse(String(raw || "[]").replace(/^\uFEFF/, ""));
  if (!Array.isArray(parsed)) {
    throw new Error(`Business YouTube channel config must be an array: ${sourcePath}`);
  }

  return parsed.map((item, index) => normalizeChannel(item, index, sourcePath));
}

export async function loadBusinessYoutubeChannels({ configPath = process.env.BUSINESS_YOUTUBE_CHANNELS_CONFIG } = {}) {
  const sourcePath = configPath ? path.resolve(configPath) : DEFAULT_CONFIG_PATH;

  try {
    const raw = await fs.readFile(sourcePath, "utf8");
    return parseBusinessYoutubeChannelConfig(raw, { sourcePath });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export function getEnabledBusinessYoutubeChannels(channels = []) {
  return channels.filter((channel) => channel.enabled && channel.channelId);
}
