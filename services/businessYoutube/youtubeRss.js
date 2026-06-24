import axios from "axios";
import * as cheerio from "cheerio";

const YOUTUBE_FEED_URL = "https://www.youtube.com/feeds/videos.xml";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function firstText($entry, selector) {
  return cleanText($entry.find(selector).first().text());
}

export function parseYoutubeRssFeed(xml, channel = {}) {
  const $ = cheerio.load(String(xml || ""), { xmlMode: true });
  const videos = [];

  $("entry").each((_, entry) => {
    const $entry = $(entry);
    const videoId = firstText($entry, "yt\\:videoId");
    const title = firstText($entry, "title");
    const publishedAt = parseDate(firstText($entry, "published"));
    const updatedAt = parseDate(firstText($entry, "updated"));
    const description =
      firstText($entry, "media\\:group media\\:description") ||
      firstText($entry, "media\\:description") ||
      firstText($entry, "summary");
    const link = cleanText($entry.find("link[rel='alternate']").attr("href")) ||
      (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");
    const feedChannelId = firstText($entry, "yt\\:channelId") || channel.channelId || "";
    const feedChannelName = firstText($entry, "author name") || channel.name || "";

    if (!videoId || !title || !publishedAt) return;

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
  });

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
