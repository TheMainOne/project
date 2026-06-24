import axios from "axios";

const YOUTUBE_FEED_URL = "https://www.youtube.com/feeds/videos.xml";

function cleanText(value) {
  return decodeXmlEntities(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function getTagText(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(xml || "").match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? cleanText(match[1]) : "";
}

function getAlternateLink(xml) {
  const source = String(xml || "");
  const linkMatches = source.match(/<link\b[^>]*>/gi) || [];
  const alternate = linkMatches.find((tag) => /\brel=["']alternate["']/i.test(tag)) || linkMatches[0] || "";
  const href = alternate.match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
  return cleanText(href);
}

function getEntryBlocks(xml) {
  return [...String(xml || "").matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
}

export function parseYoutubeRssFeed(xml, channel = {}) {
  const videos = [];

  for (const entry of getEntryBlocks(xml)) {
    const videoId = getTagText(entry, "yt:videoId");
    const title = getTagText(entry, "title");
    const publishedAt = parseDate(getTagText(entry, "published"));
    const updatedAt = parseDate(getTagText(entry, "updated"));
    const description =
      getTagText(entry, "media:description") ||
      getTagText(entry, "summary");
    const link = getAlternateLink(entry) ||
      (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");
    const feedChannelId = getTagText(entry, "yt:channelId") || channel.channelId || "";
    const authorBlock = String(entry).match(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/i)?.[1] || "";
    const feedChannelName = getTagText(authorBlock, "name") || channel.name || "";

    if (!videoId || !title || !publishedAt) continue;

    videos.push({
      videoId,
      channelId: feedChannelId,
      channelName: feedChannelName,
      channelUrl: channel.url || "",
      title,
      url: link,
      description,
      publishedAt,
      updatedAt,
      languageHints: channel.languageHints || ["ru", "en"],
    });
  }

  return videos;
}

export async function fetchYoutubeChannelFeed(channel, { timeoutMs = 15000 } = {}) {
  const response = await axios.get(YOUTUBE_FEED_URL, {
    timeout: timeoutMs,
    params: { channel_id: channel.channelId },
    headers: {
      "User-Agent": process.env.USER_AGENT || "business-youtube-digest/1.0",
      Accept: "application/atom+xml,application/xml,text/xml,*/*",
    },
  });

  return parseYoutubeRssFeed(response.data, channel);
}
