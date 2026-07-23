import axios from "axios";

const WEB_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const INNERTUBE_CAPTION_CLIENTS = ["ANDROID_VR", "IOS", "ANDROID"];
const WEB_PO_REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";

let innertubePromise = null;
let webPoMinterPromise = null;
let webPoMinterExpiresAt = 0;

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

function orderCaptionTracks(captionTracks = [], languageHints = ["ru", "en"]) {
  return captionTracks
    .filter((track) => track?.baseUrl)
    .map((track, index) => ({
      track,
      score: scoreCaptionTrack(track, languageHints, index),
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track);
}

export function selectCaptionTrack(captionTracks = [], languageHints = ["ru", "en"]) {
  return orderCaptionTracks(captionTracks, languageHints)[0] || null;
}

function buildCaptionUrl(baseUrl, format = "json3", searchParams = {}) {
  const url = new URL(baseUrl);
  if (format) url.searchParams.set("fmt", format);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
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
  const source = String(xml || "");
  const textChunks = [...source.matchAll(/<text(?:\s[^>]*)?>([\s\S]*?)<\/text>/gi)]
    .map((match) => match[1]);

  const chunks = textChunks.length
    ? textChunks
    : [...source.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)]
      .map((match) => match[1]);

  return cleanTranscriptText(
    chunks
      .map((chunk) => decodeXmlEntities(String(chunk || "").replace(/<[^>]+>/g, " ")))
      .join(" ")
  );
}

function parseVttTranscript(vtt) {
  const source = String(vtt || "").replace(/^\uFEFF/, "");
  if (!/^WEBVTT(\s|$)/i.test(source.trimStart())) return "";

  const blocks = source
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const chunks = [];

  for (const block of blocks) {
    if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/i.test(block)) continue;
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^\d+$/.test(line) && !/-->/i.test(line));
    if (lines.length) chunks.push(lines.join(" "));
  }

  return cleanTranscriptText(
    decodeXmlEntities(chunks.join(" ").replace(/<[^>]+>/g, " "))
  );
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


function parseCaptionPayload(raw) {
  try {
    const text = parseJson3Transcript(JSON.parse(raw));
    if (text) return text;
  } catch {
  }

  return parseXmlTranscript(raw) || parseVttTranscript(raw);
}

async function fetchCaptionText(
  track,
  {
    timeoutMs,
    userAgent = process.env.USER_AGENT || WEB_USER_AGENT,
    searchParams = {},
  } = {}
) {
  const urls = [
    buildCaptionUrl(track.baseUrl, "json3", searchParams),
    buildCaptionUrl(track.baseUrl, "srv3", searchParams),
    buildCaptionUrl(track.baseUrl, "vtt", searchParams),
    buildCaptionUrl(track.baseUrl, "", searchParams),
  ];
  const seen = new Set();
  let lastError = null;

  for (const captionUrl of urls) {
    if (seen.has(captionUrl)) continue;
    seen.add(captionUrl);

    try {
      const response = await axios.get(captionUrl, {
        timeout: timeoutMs,
        responseType: "text",
        transformResponse: [(data) => data],
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json,text/vtt,text/xml,application/xml,*/*",
        },
      });

      const text = parseCaptionPayload(response.data);
      if (text) return text;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return "";
}

function timeoutFetch(timeoutMs) {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("YouTube request timed out")), timeoutMs);
    const sourceSignal = init.signal;
    const abortFromSource = () => controller.abort(sourceSignal?.reason);

    if (sourceSignal?.aborted) {
      abortFromSource();
    } else {
      sourceSignal?.addEventListener("abort", abortFromSource, { once: true });
    }

    try {
      return await globalThis.fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      sourceSignal?.removeEventListener("abort", abortFromSource);
    }
  };
}

async function getInnertube(timeoutMs) {
  if (!innertubePromise) {
    innertubePromise = import("youtubei.js")
      .then(({ Innertube }) => Innertube.create({
        lang: "en",
        location: "US",
        retrieve_player: false,
        fetch: timeoutFetch(timeoutMs),
      }))
      .catch((error) => {
        innertubePromise = null;
        throw error;
      });
  }

  return innertubePromise;
}

async function fetchInnertubeCaptionTracks(videoId, clientName, timeoutMs) {
  const [{ Constants }, innertube] = await Promise.all([
    import("youtubei.js"),
    getInnertube(timeoutMs),
  ]);
  const client = Constants.CLIENTS[clientName];
  if (!client) return [];

  const info = await innertube.getBasicInfo(videoId, { client: clientName });
  const tracks = info?.captions?.caption_tracks || [];

  return tracks
    .filter((track) => track?.base_url)
    .map((track) => ({
      track: {
        baseUrl: track.base_url,
        languageCode: track.language_code || "",
        kind: track.kind || "",
        isTranslatable: Boolean(track.is_translatable),
        name: { simpleText: track.name?.text || "" },
      },
      clientName,
      userAgent: client.USER_AGENT || WEB_USER_AGENT,
    }));
}

function ensureBrowserGlobals(JSDOM, VirtualConsole) {
  if (globalThis.window && globalThis.document && globalThis.location) return;

  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(
    "<!DOCTYPE html><html lang=\"en\"><head><title></title></head><body></body></html>",
    {
      url: "https://www.youtube.com/",
      referrer: "https://www.youtube.com/",
      virtualConsole,
    }
  );

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.origin = dom.window.origin;

  if (!Reflect.has(globalThis, "navigator")) {
    Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator });
  }
}

async function createWebPoMinter(timeoutMs) {
  const [
    { BotGuardClient },
    { WebPoMinter },
    { buildURL, getHeaders },
    { JSDOM, VirtualConsole },
    innertube,
  ] = await Promise.all([
    import("bgutils-js/botguard"),
    import("bgutils-js/webpo"),
    import("bgutils-js/utils"),
    import("jsdom"),
    getInnertube(timeoutMs),
  ]);

  ensureBrowserGlobals(JSDOM, VirtualConsole);

  const challengeResponse = await innertube.getAttestationChallenge("ENGAGEMENT_TYPE_UNBOUND");
  const challenge = challengeResponse?.bg_challenge;
  if (!challenge) throw new Error("YouTube did not return a BotGuard challenge");

  const interpreterUrl =
    challenge.interpreter_url?.private_do_not_access_or_else_trusted_resource_url_wrapped_value;
  if (!interpreterUrl) throw new Error("BotGuard interpreter URL is missing");

  const fetchWithTimeout = timeoutFetch(timeoutMs);
  const interpreterResponse = await fetchWithTimeout(`https:${interpreterUrl}`);
  if (!interpreterResponse.ok) {
    throw new Error(`BotGuard interpreter HTTP ${interpreterResponse.status}`);
  }

  const interpreterJavascript = await interpreterResponse.text();
  if (!interpreterJavascript) throw new Error("BotGuard interpreter is empty");
  new Function(interpreterJavascript)();

  const botGuardClient = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.global_name,
    globalObject: globalThis,
  });
  const webPoSignalOutput = [];
  const botguardResponse = await botGuardClient.snapshot({ webPoSignalOutput });
  const integrityResponse = await fetchWithTimeout(buildURL("GenerateIT", false), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify([WEB_PO_REQUEST_KEY, botguardResponse]),
  });
  if (!integrityResponse.ok) {
    throw new Error(`BotGuard integrity HTTP ${integrityResponse.status}`);
  }

  const [
    integrityToken,
    estimatedTtlSecs,
    mintRefreshThreshold,
    websafeFallbackToken,
  ] = await integrityResponse.json();
  if (!integrityToken) throw new Error("BotGuard integrity token is empty");

  const minter = await WebPoMinter.create(
    {
      integrityToken,
      estimatedTtlSecs,
      mintRefreshThreshold,
      websafeFallbackToken,
    },
    webPoSignalOutput
  );
  const ttlMs = Math.max(60, Number(estimatedTtlSecs) || 300) * 1000;
  webPoMinterExpiresAt = Date.now() + ttlMs;
  return minter;
}

async function getWebPoMinter(timeoutMs) {
  if (
    webPoMinterPromise &&
    (!webPoMinterExpiresAt || Date.now() < webPoMinterExpiresAt - 60_000)
  ) {
    return webPoMinterPromise;
  }

  webPoMinterPromise = createWebPoMinter(timeoutMs).catch((error) => {
    webPoMinterPromise = null;
    webPoMinterExpiresAt = 0;
    throw error;
  });
  return webPoMinterPromise;
}

async function fetchWebPoToken(videoId, timeoutMs) {
  const minter = await getWebPoMinter(timeoutMs);
  const poToken = await minter.mintAsWebsafeString(videoId);
  if (!poToken) throw new Error("YouTube PO token is empty");
  return poToken;
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

function emptyTranscript(track, error = "") {
  return {
    status: "empty",
    source: track.kind === "asr" ? "public_auto_caption" : "public_caption",
    languageCode: track.languageCode || "",
    languageName: track.name?.simpleText || track.name?.runs?.map((run) => run.text).join("") || "",
    text: "",
    charCount: 0,
    error: String(error || "").slice(0, 500),
  };
}

export async function fetchPublicTranscript(
  video,
  {
    languageHints = ["ru", "en"],
    timeoutMs = 15000,
    innertubeTrackFetcher = fetchInnertubeCaptionTracks,
    poTokenFetcher = fetchWebPoToken,
  } = {}
) {
  let lastTrack = null;
  let sawEmptyTrack = false;
  let webTracksForPoToken = [];
  const diagnostics = [];

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
    const webTracks = orderCaptionTracks(captionTracks, languageHints);
    webTracksForPoToken = webTracks;
    lastTrack = webTracks[0] || null;

    for (const webTrack of webTracks) {
      lastTrack = webTrack;
      try {
        const text = await fetchCaptionText(webTrack, { timeoutMs });
        if (text) return availableTranscript(webTrack, text);
        sawEmptyTrack = true;
        diagnostics.push("WEB: empty caption response");
      } catch (error) {
        diagnostics.push(`WEB: ${truncateError(error)}`);
      }
    }
  } catch (error) {
    diagnostics.push(`WEB page: ${truncateError(error)}`);
  }

  // WEB subtitle URLs can require Proof-of-Origin on cloud IPs. These clients
  // expose public caption URLs that do not require a subtitle PO token.
  for (const clientName of INNERTUBE_CAPTION_CLIENTS) {
    try {
      const candidates = await innertubeTrackFetcher(video.videoId, clientName, timeoutMs);
      const orderedTracks = orderCaptionTracks(
        candidates.map((candidate) => candidate.track),
        languageHints
      );
      const candidateByUrl = new Map(
        candidates.map((candidate) => [candidate.track.baseUrl, candidate])
      );

      for (const track of orderedTracks) {
        lastTrack = track;
        const candidate = candidateByUrl.get(track.baseUrl);
        try {
          const text = await fetchCaptionText(track, {
            timeoutMs,
            userAgent: candidate?.userAgent || WEB_USER_AGENT,
          });
          if (text) return availableTranscript(track, text);
          sawEmptyTrack = true;
          diagnostics.push(`${clientName}: empty caption response`);
        } catch (error) {
          diagnostics.push(`${clientName}: ${truncateError(error)}`);
        }
      }
    } catch (error) {
      diagnostics.push(`${clientName}: ${truncateError(error)}`);
    }
  }

  if (webTracksForPoToken.length && video.videoId) {
    try {
      const poToken = await poTokenFetcher(video.videoId, timeoutMs);
      for (const webTrack of webTracksForPoToken) {
        lastTrack = webTrack;
        try {
          const text = await fetchCaptionText(webTrack, {
            timeoutMs,
            searchParams: {
              c: "WEB",
              potc: 1,
              pot: poToken,
            },
          });
          if (text) return availableTranscript(webTrack, text);
          sawEmptyTrack = true;
          diagnostics.push("WEB+POT: empty caption response");
        } catch (error) {
          diagnostics.push(`WEB+POT: ${truncateError(error)}`);
        }
      }
    } catch (error) {
      diagnostics.push(`WEB+POT: ${truncateError(error)}`);
    }
  }

  const diagnostic = diagnostics.join("; ").slice(0, 500);
  if (lastTrack && sawEmptyTrack) return emptyTranscript(lastTrack, diagnostic);

  if (!diagnostics.length) {
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

  return {
    status: "error",
    source: "metadata_only",
    languageCode: "",
    languageName: "",
    text: "",
    charCount: 0,
    error: diagnostic,
  };
}
