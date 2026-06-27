import axios from "axios";

const WEB_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const ANDROID_CLIENT_VERSION = "20.10.38";
const ANDROID_USER_AGENT =
  `com.google.android.youtube/${ANDROID_CLIENT_VERSION} (Linux; U; Android 14) gzip`;

function cleanTranscriptText(value) {
  return String(value || "")
    .replace(/\u200b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateError(error) {
  const raw = error?.response?.data?.error || error?.response?.statusText || error?.message || error;
  return String(raw || "unknown error").slice(0, 500);
}

export function extractYtInitialPlayerResponse(html) {
  const source = String(html || "");
  const markerIndex = source.indexOf("ytInitialPlayerResponse");
  if (markerIndex === -1) return null;

  const assignmentIndex = source.indexOf("=", markerIndex);
  const braceStart = source.indexOf("{", assignmentIndex);
  if (assignmentIndex === -1 || braceStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      try {
        return JSON.parse(source.slice(braceStart, i + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function extractInnertubeApiKey(html) {
  const match = String(html || "").match(
    /"INNERTUBE_API_KEY":"([^"]+)"|INNERTUBE_API_KEY\\":\\"([^\\"]+)\\"/
  );
  return match?.[1] || match?.[2] || "";
}

function scoreCaptionTrack(track, languageHints, index) {
  const code = String(track?.languageCode || "").toLowerCase();
  const baseCode = code.split("-")[0];
  const hints = (languageHints || []).map((hint) => String(hint || "").toLowerCase()).filter(Boolean);
  let score = 0;

  if (hints.includes(code)) score += 100;
  if (hints.includes(baseCode)) score += 80;
  if (track?.kind !== "asr") score += 10;
  if (track?.isTranslatable) score += 2;

  return score - index / 100;
}

export function selectCaptionTrack(captionTracks = [], languageHints = ["ru", "en"]) {
  const candidates = captionTracks.filter((track) => track?.baseUrl);
  if (!candidates.length) return null;

  return candidates
    .map((track, index) => ({
      track,
      score: scoreCaptionTrack(track, languageHints, index),
    }))
    .sort((a, b) => b.score - a.score)[0]?.track || null;
}

function buildCaptionUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set("fmt", "json3");
  return url.toString();
}

function parseJson3Transcript(data) {
  const events = Array.isArray(data?.events) ? data.events : [];
  const chunks = [];

  for (const event of events) {
    const segs = Array.isArray(event?.segs) ? event.segs : [];
    for (const seg of segs) {
      if (seg?.utf8) chunks.push(seg.utf8);
    }
  }

  return cleanTranscriptText(chunks.join(" "));
}

function parseXmlTranscript(xml) {
  const chunks = [...String(xml || "").matchAll(/<text(?:\s[^>]*)?>([\s\S]*?)<\/text>/gi)]
    .map((match) => decodeXmlEntities(match[1]));

  return cleanTranscriptText(chunks.join(" "));
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


async function fetchCaptionText(track, { timeoutMs }) {
  const captionUrl = buildCaptionUrl(track.baseUrl);
  const response = await axios.get(captionUrl, {
    timeout: timeoutMs,
    responseType: "text",
    transformResponse: [(data) => data],
    headers: {
      "User-Agent": process.env.USER_AGENT || WEB_USER_AGENT,
      Accept: "application/json,text/xml,application/xml,*/*",
    },
  });

  const raw = response.data;
  try {
    return parseJson3Transcript(JSON.parse(raw));
  } catch {
    return parseXmlTranscript(raw);
  }
}

async function fetchAndroidCaptionTracks({ html, videoId, timeoutMs }) {
  const apiKey = extractInnertubeApiKey(html);
  if (!apiKey || !videoId) return [];

  const response = await axios.post(
    `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`,
    {
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: ANDROID_CLIENT_VERSION,
          hl: "en",
          gl: "US",
        },
      },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    },
    {
      timeout: timeoutMs,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ANDROID_USER_AGENT,
        Accept: "application/json",
      },
    }
  );

  return response.data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
}

function availableTranscript(track, text) {
  return {
    status: "available",
    source: track.kind === "asr" ? "public_auto_caption" : "public_caption",
    languageCode: track.languageCode || "",
    languageName: track.name?.simpleText || track.name?.runs?.map((run) => run.text).join("") || "",
    text,
    charCount: text.length,
    error: "",
  };
}

function emptyTranscript(track) {
  return {
    status: "empty",
    source: track.kind === "asr" ? "public_auto_caption" : "public_caption",
    languageCode: track.languageCode || "",
    languageName: track.name?.simpleText || track.name?.runs?.map((run) => run.text).join("") || "",
    text: "",
    charCount: 0,
    error: "",
  };
}

export async function fetchPublicTranscript(video, { languageHints = ["ru", "en"], timeoutMs = 15000 } = {}) {
  try {
    const response = await axios.get(video.url || `https://www.youtube.com/watch?v=${video.videoId}`, {
      timeout: timeoutMs,
      headers: {
        "User-Agent": process.env.USER_AGENT || WEB_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
      },
    });

    const playerResponse = extractYtInitialPlayerResponse(response.data);
    const captionTracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const webTrack = selectCaptionTrack(captionTracks, languageHints);
    let lastTrack = webTrack;
    let lastError = "";

    if (webTrack) {
      try {
        const text = await fetchCaptionText(webTrack, { timeoutMs });
        if (text) return availableTranscript(webTrack, text);
      } catch (error) {
        lastError = truncateError(error);
      }
    }

    // YouTube can return an empty timedtext response for WEB tracks while the
    // same public captions remain available through its Android player client.
    try {
      const androidTracks = await fetchAndroidCaptionTracks({
        html: response.data,
        videoId: video.videoId,
        timeoutMs,
      });
      const androidTrack = selectCaptionTrack(androidTracks, languageHints);
      if (androidTrack) {
        lastTrack = androidTrack;
        const text = await fetchCaptionText(androidTrack, { timeoutMs });
        if (text) return availableTranscript(androidTrack, text);
      }
    } catch (error) {
      lastError = truncateError(error);
    }

    if (lastTrack) return emptyTranscript(lastTrack);

    if (lastError) {
      return {
        status: "error",
        source: "metadata_only",
        languageCode: "",
        languageName: "",
        text: "",
        charCount: 0,
        error: lastError,
      };
    }

    return {
      status: "unavailable",
      source: "metadata_only",
      languageCode: "",
      languageName: "",
      text: "",
      charCount: 0,
      error: "",
    };
  } catch (error) {
    return {
      status: "error",
      source: "metadata_only",
      languageCode: "",
      languageName: "",
      text: "",
      charCount: 0,
      error: truncateError(error),
    };
  }
}
