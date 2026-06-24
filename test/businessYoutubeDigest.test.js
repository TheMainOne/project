import test from "node:test";
import assert from "node:assert/strict";
import { parseBusinessYoutubeChannelConfig, getEnabledBusinessYoutubeChannels } from "../services/businessYoutube/config.js";
import { parseYoutubeRssFeed } from "../services/businessYoutube/youtubeRss.js";
import { selectCaptionTrack, extractYtInitialPlayerResponse } from "../services/businessYoutube/transcript.js";
import { splitTelegramMessage } from "../services/businessYoutube/format.js";
import { normalizeAnalysisPayload } from "../services/businessYoutube/analysis.js";

test("parses and filters business YouTube channel config", () => {
  const channels = parseBusinessYoutubeChannelConfig(JSON.stringify([
    { name: "Enabled", channelId: "UC1", enabled: true, languageHints: ["en"] },
    { name: "Disabled placeholder", enabled: false },
  ]));

  assert.equal(channels.length, 2);
  assert.deepEqual(getEnabledBusinessYoutubeChannels(channels).map((c) => c.channelId), ["UC1"]);
  assert.deepEqual(channels[0].languageHints, ["en"]);
});

test("rejects enabled config entries without channelId", () => {
  assert.throws(
    () => parseBusinessYoutubeChannelConfig(JSON.stringify([{ name: "Broken", enabled: true }])),
    /missing channelId/
  );
});

test("parses channel config with UTF-8 BOM", () => {
  const channels = parseBusinessYoutubeChannelConfig(`\uFEFF${JSON.stringify([
    { name: "Enabled", channelId: "UC1", enabled: true },
  ])}`);

  assert.equal(channels[0].channelId, "UC1");
});

test("parses YouTube RSS entries", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
    <entry>
      <yt:videoId>abc123</yt:videoId>
      <yt:channelId>UC1</yt:channelId>
      <title>Business video</title>
      <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
      <author><name>Channel One</name></author>
      <published>2026-06-24T10:00:00+00:00</published>
      <updated>2026-06-24T10:30:00+00:00</updated>
      <media:group><media:description>Good description</media:description></media:group>
    </entry>
  </feed>`;

  const videos = parseYoutubeRssFeed(xml, { name: "Fallback", channelId: "UC1" });
  assert.equal(videos.length, 1);
  assert.equal(videos[0].videoId, "abc123");
  assert.equal(videos[0].channelName, "Channel One");
  assert.equal(videos[0].description, "Good description");
});

test("extracts ytInitialPlayerResponse JSON", () => {
  const parsed = extractYtInitialPlayerResponse('<script>var ytInitialPlayerResponse = {"a":{"b":1}};</script>');
  assert.deepEqual(parsed, { a: { b: 1 } });
});

test("selects preferred caption track by language hints", () => {
  const track = selectCaptionTrack([
    { baseUrl: "https://example.com/en", languageCode: "en", kind: "asr" },
    { baseUrl: "https://example.com/ru", languageCode: "ru" },
  ], ["ru", "en"]);

  assert.equal(track.languageCode, "ru");
});

test("splits long Telegram messages under the safe limit", () => {
  const chunks = splitTelegramMessage(`${"a".repeat(2000)}\n\n${"b".repeat(2000)}\n\n${"c".repeat(2000)}`, 2500);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.length <= 2500));
});

test("normalizes OpenAI analysis payload", () => {
  const normalized = normalizeAnalysisPayload({
    summary: "Summary",
    mainIdeas: ["Idea"],
    insights: ["Insight"],
    unconventionalApplications: ["Application"],
    actionsToday: ["Action"],
    usefulnessRating: "high",
    transcriptStatusNote: "OK",
  });

  assert.equal(normalized.summary, "Summary");
  assert.equal(normalized.usefulnessRating, "high");
  assert.deepEqual(normalized.mainIdeas, ["Idea"]);
});
