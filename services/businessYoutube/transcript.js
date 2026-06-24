import axios from "axios";

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
      "User-Agent": process.env.USER_AGENT || "business-youtube-digest/1.0",
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

export async function fetchPublicTranscript(video, { languageHints = ["ru", "en"], timeoutMs = 15000 } = {}) {
  try {
    const response = await axios.get(video.url || `https://www.youtube.com/watch?v=${video.videoId}`, {
      timeout: timeoutMs,
      headers: {
        "User-Agent": process.env.USER_AGENT || "Mozilla/5.0 business-youtube-digest/1.0",
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
      },
    });

    const playerResponse = extractYtInitialPlayerResponse(response.data);
    const captionTracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const track = selectCaptionTrack(captionTracks, languageHints);

    if (!track) {
      return {
        status: "unavailable",
        source: "metadata_only",
        languageCode: "",
        languageName: "",
        text: "",
        charCount: 0,
        error: "",
      };
    }

    const text = await fetchCaptionText(track, { timeoutMs });
    const status = text ? "available" : "empty";

    return {
      status,
      source: track.kind === "asr" ? "public_auto_caption" : "public_caption",
      languageCode: track.languageCode || "",
      languageName: track.name?.simpleText || track.name?.runs?.map((run) => run.text).join("") || "",
      text,
      charCount: text.length,
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
