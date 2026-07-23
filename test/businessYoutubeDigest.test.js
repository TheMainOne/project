import test, { mock } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { parseBusinessYoutubeChannelConfig, getEnabledBusinessYoutubeChannels } from "../services/businessYoutube/config.js";
import { parseYoutubeRssFeed } from "../services/businessYoutube/youtubeRss.js";
import {
  extractInnertubeApiKey,
  extractYtInitialPlayerResponse,
  fetchPublicTranscript,
  selectCaptionTrack,
} from "../services/businessYoutube/transcript.js";
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

test("extracts the Innertube API key", () => {
  assert.equal(
    extractInnertubeApiKey('<script>ytcfg.set({"INNERTUBE_API_KEY":"test-key"});</script>'),
    "test-key"
  );
});

test("selects preferred caption track by language hints", () => {
  const track = selectCaptionTrack([
    { baseUrl: "https://example.com/en", languageCode: "en", kind: "asr" },
    { baseUrl: "https://example.com/ru", languageCode: "ru" },
  ], ["ru", "en"]);

  assert.equal(track.languageCode, "ru");
});

test("falls back to an Innertube client when web timedtext is empty", async () => {
  const webTrack = {
    baseUrl: "https://www.youtube.com/api/timedtext?track=web",
    languageCode: "en",
    kind: "asr",
  };
  const androidTrack = {
    baseUrl: "https://www.youtube.com/api/timedtext?track=android",
    languageCode: "en",
    kind: "asr",
    name: { simpleText: "English (auto-generated)" },
  };
  const html = `<script>ytcfg.set({"INNERTUBE_API_KEY":"test-key"});</script>
    <script>var ytInitialPlayerResponse = ${JSON.stringify({
      captions: { playerCaptionsTracklistRenderer: { captionTracks: [webTrack] } },
    })};</script>`;

  mock.method(axios, "get", async (url) => {
    const value = String(url);
    if (value.includes("track=web")) return { data: "" };
    if (value.includes("track=android")) {
      return { data: JSON.stringify({ events: [{ segs: [{ utf8: "Real transcript text" }] }] }) };
    }
    return { data: html };
  });
  try {
    const result = await fetchPublicTranscript({
      videoId: "video-id",
      url: "https://www.youtube.com/shorts/video-id",
    }, {
      innertubeTrackFetcher: async (_videoId, clientName) => (
        clientName === "ANDROID_VR"
          ? [{ track: androidTrack, clientName, userAgent: "test-agent" }]
          : []
      ),
    });

    assert.equal(result.status, "available");
    assert.equal(result.source, "public_auto_caption");
    assert.equal(result.text, "Real transcript text");
  } finally {
    mock.restoreAll();
  }
});

test("falls back to Innertube when the YouTube watch page request fails", async () => {
  const fallbackTrack = {
    baseUrl: "https://www.youtube.com/api/timedtext?track=fallback",
    languageCode: "en",
    kind: "asr",
    name: { simpleText: "English (auto-generated)" },
  };

  mock.method(axios, "get", async (url) => {
    if (String(url).includes("track=fallback")) {
      return { data: JSON.stringify({ events: [{ segs: [{ utf8: "Fallback transcript" }] }] }) };
    }
    throw new Error("watch page blocked");
  });

  try {
    const result = await fetchPublicTranscript({
      videoId: "video-id",
      url: "https://www.youtube.com/watch?v=video-id",
    }, {
      innertubeTrackFetcher: async (_videoId, clientName) => (
        clientName === "ANDROID_VR"
          ? [{ track: fallbackTrack, clientName, userAgent: "test-agent" }]
          : []
      ),
    });

    assert.equal(result.status, "available");
    assert.equal(result.text, "Fallback transcript");
  } finally {
    mock.restoreAll();
  }
});

test("falls back to srv3 timedtext when json3 captions are empty", async () => {
  const webTrack = {
    baseUrl: "https://www.youtube.com/api/timedtext?track=web",
    languageCode: "en",
    kind: "asr",
  };
  const html = `<script>ytcfg.set({"INNERTUBE_API_KEY":"test-key"});</script>
    <script>var ytInitialPlayerResponse = ${JSON.stringify({
      captions: { playerCaptionsTracklistRenderer: { captionTracks: [webTrack] } },
    })};</script>`;

  mock.method(axios, "get", async (url) => {
    const value = String(url);
    if (value.includes("track=web") && value.includes("fmt=json3")) {
      return { data: JSON.stringify({ events: [] }) };
    }
    if (value.includes("track=web") && value.includes("fmt=srv3")) {
      return { data: "<timedtext><body><p><s>Real</s><s>transcript</s><s>text</s></p></body></timedtext>" };
    }
    return { data: html };
  });
  mock.method(axios, "post", async () => ({ data: {} }));

  try {
    const result = await fetchPublicTranscript({
      videoId: "video-id",
      url: "https://www.youtube.com/watch?v=video-id",
    });

    assert.equal(result.status, "available");
    assert.equal(result.text, "Real transcript text");
  } finally {
    mock.restoreAll();
  }
});

test("tries another caption track when the preferred track is empty", async () => {
  const emptyTrack = {
    baseUrl: "https://www.youtube.com/api/timedtext?track=empty",
    languageCode: "en",
    kind: "asr",
  };
  const realTrack = {
    baseUrl: "https://www.youtube.com/api/timedtext?track=real",
    languageCode: "en",
    kind: "asr",
  };
  const html = `<script>ytcfg.set({"INNERTUBE_API_KEY":"test-key"});</script>
    <script>var ytInitialPlayerResponse = ${JSON.stringify({
      captions: { playerCaptionsTracklistRenderer: { captionTracks: [emptyTrack, realTrack] } },
    })};</script>`;

  mock.method(axios, "get", async (url) => {
    const value = String(url);
    if (value.includes("track=empty")) return { data: "" };
    if (value.includes("track=real")) {
      return { data: JSON.stringify({ events: [{ segs: [{ utf8: "Second track text" }] }] }) };
    }
    return { data: html };
  });
  mock.method(axios, "post", async () => ({ data: {} }));

  try {
    const result = await fetchPublicTranscript({
      videoId: "video-id",
      url: "https://www.youtube.com/watch?v=video-id",
    });

    assert.equal(result.status, "available");
    assert.equal(result.text, "Second track text");
  } finally {
    mock.restoreAll();
  }
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
