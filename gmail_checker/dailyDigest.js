import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import * as cheerio from "cheerio";
import sendTelegramMessage from "../services/telegramNotify.js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

/* экранирование Markdown-V2 */
const md = (s = "") =>
  s
    .replace(/([\-_*[\]()~`>#+=|{}.!\\])/g, "\\$1")
    .replace(/[<>]/g, "");

const toF = (c) => Math.round((c * 9) / 5 + 32);

/* безопасный URL для Markdown-V2 */
const safeUrl = (u = "") =>
  encodeURI(u)
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/!/g, "%21")
    .replace(/\./g, "\\.")
    .replace(/-/g, "\\-");

const OCNJ_HOME_URL = "https://oceancityvacation.com/";
const OCNJ_EVENTS_URL = "https://oceancityvacation.com/events/list/";

const NWS_BASE_URL = "https://api.weather.gov";
const NWS_USER_AGENT =
  process.env.NWS_USER_AGENT || "ocnj-weather-digest/1.0";

const NWS_HEADERS = {
  "User-Agent": NWS_USER_AGENT,
  Accept: "application/geo+json,application/json",
};

/*
  Для Ocean City, NJ чаще всего используется офис PHI.
  Если понадобится, можно переопределить через .env:
  NWS_SURF_PRODUCT_TYPE=SRF
  NWS_SURF_PRODUCT_LOCATION=PHI
*/
const NWS_SURF_PRODUCT_TYPE = process.env.NWS_SURF_PRODUCT_TYPE || "SRF";
const NWS_SURF_PRODUCT_LOCATION =
  process.env.NWS_SURF_PRODUCT_LOCATION || "PHI";

/*
  false — если нет подходящих событий, блок просто не добавляется в Telegram.
  true — если хочешь видеть в Telegram сообщение, что событий не найдено.
*/
const SHOW_EMPTY_OCNJ_EVENTS = false;

const tgUrl = (u = "") =>
  encodeURI(u)
    .replace(/\\/g, "\\\\")
    .replace(/\)/g, "\\)");

function cleanText(text = "") {
  return text.replace(/\s+/g, " ").trim();
}

function truncateText(text = "", max = 60) {
  const clean = cleanText(text);
  return clean.length > max ? clean.slice(0, max - 1).trim() + "…" : clean;
}

function getTodayInNewYork() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parseOCNJDate(raw = "") {
  const match = raw.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!match) return null;

  return new Date(`${match[1]} ${match[2]}, ${match[3]} 12:00:00`);
}

function formatEventDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatNYDateTime(dateLike) {
  if (!dateLike) return "";

  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    hour12: true,
  });
}

function formatOpenMeteoLocalTime(localIso = "") {
  const hour = Number(localIso.slice(11, 13));
  if (!Number.isFinite(hour)) return "";

  const displayHour = hour % 12 || 12;
  const suffix = hour >= 12 ? "PM" : "AM";

  return `${displayHour} ${suffix}`;
}

function directionToCompass(deg) {
  if (typeof deg !== "number" || Number.isNaN(deg)) return "";

  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];

  const index = Math.round(deg / 22.5) % 16;
  return directions[index];
}

function getNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scoreOceanCityEvent(item) {
  const text = `${item.title || ""} ${item.description || ""} ${
    item.venue || ""
  }`.toLowerCase();

  const boringWords = [
    "membership",
    "networking",
    "workshop",
    "meeting",
    "support group",
    "ribbon cutting",
    "business",
    "chamber",
  ];

  if (boringWords.some((word) => text.includes(word))) {
    return 0;
  }

  let score = 0;

  const highInterest = [
    "fireworks",
    "parade",
    "festival",
    "concert",
    "music",
    "block party",
    "night in venice",
    "unlocking of the ocean",
  ];

  const mediumInterest = [
    "beach",
    "boardwalk",
    "farmers market",
    "surf",
    "race",
    "challenge",
    "memorial",
    "family",
    "car show",
    "art show",
  ];

  if (highInterest.some((word) => text.includes(word))) score += 3;
  if (mediumInterest.some((word) => text.includes(word))) score += 2;

  return score;
}

async function getOceanCityEvents() {
  try {
    const { data: html } = await axios.get(OCNJ_HOME_URL, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const $ = cheerio.load(html);
    const parsedEvents = [];

    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const rawText = cleanText($(el).text());

      if (!rawText) return;
      if (!rawText.includes("Learn More")) return;

      const shortDateMatch = rawText.match(
        /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i
      );

      const fullDateMatch = rawText.match(
        /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/i
      );

      if (!shortDateMatch || !fullDateMatch) return;

      const dateText = shortDateMatch[0];

      let title = rawText
        .slice(shortDateMatch[0].length, fullDateMatch.index)
        .replace(/\s+/g, " ")
        .trim();

      title = title
        .replace(/\bOcean City NJ Boardwalk\b/gi, "")
        .replace(/\bOcean City Tabernacle\b/gi, "")
        .replace(/\bVeteran’s Memorial Park\b/gi, "")
        .replace(/\b9th Street Beach\b/gi, "")
        .replace(/\bMusic Pier\b/gi, "")
        .trim();

      if (!title) return;

      const link = href ? new URL(href, OCNJ_HOME_URL).toString() : "";

      const score = scoreOceanCityEvent({
        title,
        description: rawText,
        venue: "",
      });

      parsedEvents.push({
        title,
        dateText,
        link,
        score,
      });
    });

    if (!parsedEvents.length) {
      console.log(
        "[ocnj-events] событий не найдено или структура сайта изменилась"
      );

      return {
        text: SHOW_EMPTY_OCNJ_EVENTS
          ? md("🎉 Ocean City, NJ: событий на сайте не найдено")
          : "",
        status: "no_events_found",
        totalFound: 0,
        totalMatched: 0,
      };
    }

    const matchedEvents = parsedEvents
      .filter((event) => event.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    if (!matchedEvents.length) {
      console.log(
        `[ocnj-events] найдено событий: ${parsedEvents.length}, но подходящих по критериям нет`
      );

      return {
        text: SHOW_EMPTY_OCNJ_EVENTS
          ? md(
              "🎉 Ocean City, NJ: интересных событий по нашим критериям сегодня не найдено"
            )
          : "",
        status: "no_matching_events",
        totalFound: parsedEvents.length,
        totalMatched: 0,
      };
    }

    const events = matchedEvents.map((event) => {
      const title = truncateText(event.title, 55);

      const eventTitle = event.link
        ? `[${md(title)}](${tgUrl(event.link)})`
        : md(title);

      return `• ${md(event.dateText)} — ${eventTitle}`;
    });

    return {
      text:
        md("🎉 Интересное в Ocean City, NJ:") +
        "\n" +
        events.join("\n") +
        "\n" +
        `[${md("Все события OCNJ")}](${tgUrl(OCNJ_EVENTS_URL)})`,
      status: "ok",
      totalFound: parsedEvents.length,
      totalMatched: matchedEvents.length,
    };
  } catch (e) {
    console.warn("[ocnj-events]", e.response?.status ?? e.message);

    return {
      text: SHOW_EMPTY_OCNJ_EVENTS
        ? md("🎉 Ocean City, NJ: не удалось загрузить события")
        : "",
      status: "fetch_error",
      error: e.response?.status ?? e.message,
      totalFound: 0,
      totalMatched: 0,
    };
  }
}

/* ─── 1. Погода ───────────────────────────────────────────────────────── */
async function getWeather() {
  const {
    OPENWEATHER_KEY,
    VINELAND_LAT,
    VINELAND_LON,
    OCEANCITY_LAT,
    OCEANCITY_LON,
  } = process.env;

  const cities = [
    { name: "Vineland", lat: VINELAND_LAT, lon: VINELAND_LON },
    { name: "Ocean City", lat: OCEANCITY_LAT, lon: OCEANCITY_LON },
  ];

  const out = [];
  let oceanCityForecast = [];

  for (const c of cities) {
    const cur = await axios.get(
      "https://api.openweathermap.org/data/2.5/weather",
      {
        params: {
          lat: c.lat,
          lon: c.lon,
          units: "metric",
          appid: OPENWEATHER_KEY,
        },
      }
    );

    const fc = await axios.get(
      "https://api.openweathermap.org/data/2.5/forecast",
      {
        params: {
          lat: c.lat,
          lon: c.lon,
          units: "metric",
          cnt: 8,
          appid: OPENWEATHER_KEY,
        },
      }
    );

    const temps = fc.data.list.map((p) => p.main.temp);
    const tMinC = Math.round(Math.min(...temps));
    const tMaxC = Math.round(Math.max(...temps));
    const tMinF = toF(tMinC);
    const tMaxF = toF(tMaxC);

    const descRaw = cur.data.weather[0].description;

    out.push(
      md(`${c.name}: ${tMinC}°→${tMaxC}°C (${tMinF}°→${tMaxF}°F), ${descRaw}`)
    );

    if (c.name === "Ocean City") {
      oceanCityForecast = fc.data.list;
    }
  }

  return {
    text: out.join("\n"),
    oceanCityForecast,
  };
}

/* 2. Температура воды (NOAA CO-OPS, станции AC → CM) */
async function getWaterTemp() {
  const stations = [
    { id: "8534720", name: "Atlantic City" },
    { id: "8536110", name: "Cape May" },
  ];

  for (const s of stations) {
    try {
      const { data } = await axios.get(
        "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter",
        {
          params: {
            station: s.id,
            product: "water_temperature",
            date: "latest",
            units: "metric",
            time_zone: "gmt",
            format: "json",
          },
          timeout: 5000,
        }
      );

      if (data?.data?.length) {
        const tempC = Math.round(+data.data[0].v);
        const tempF = toF(tempC);

        const text = md(
          `🌊 Температура воды (Ocean City): ${tempC}°C (${tempF}°F)`
        );

        return {
          text,
          tempC,
        };
      }

      console.log(`[water] ${s.name} – нет свежих данных`);
    } catch (err) {
      console.log(`[water] ${s.name} – ${err.response?.status ?? err.code}`);
    }
  }

  throw new Error("Нет свежих данных о температуре воды");
}

/* ─── 3. Ветер ───────────────────────────────────────────────────────── */
async function getWind() {
  const stations = [
    { id: "8534720", name: "Atlantic City" },
    { id: "8536110", name: "Cape May" },
  ];

  const url = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

  for (const s of stations) {
    try {
      const { data } = await axios.get(url, {
        params: {
          station: s.id,
          product: "wind",
          date: "latest",
          units: "metric",
          time_zone: "gmt",
          format: "json",
        },
        timeout: 5000,
      });

      if (data?.data?.length) {
        const w = data.data[0];
        const spd = +w.s;
        const gust = +w.g || spd;
        const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1);

        let remark = "лёгкий бриз";
        if (spd > 7 && spd <= 14) remark = "сильный ветер";
        else if (spd > 14) remark = "штормовой ветер";

        const line =
          `💨 Ветер (Ocean City): ${fmt(spd)} м/с` +
          (gust > spd + 2 ? ` (порывы до ${fmt(gust)} м/с)` : "") +
          ` — ${remark}`;

        return {
          text: md(line),
          speed: spd,
          gust,
        };
      }

      console.warn(`[wind] ${s.name} – пустой ответ`);
    } catch (e) {
      console.warn(`[wind] ${s.name} – ${e.response?.status ?? e.code}`);
    }
  }

  return {
    text: md("💨 Данных о ветре нет"),
    speed: null,
    gust: null,
  };
}

/* ─── 4. Волны: текущие данные NDBC ──────────────────────────────────── */
async function getWave() {
  const buoys = [
    { id: "44091", name: "AC" },
    { id: "44009", name: "DB" },
  ];

  for (const b of buoys) {
    try {
      const url = `https://www.ndbc.noaa.gov/data/realtime2/${b.id}.txt`;
      const { data: txt } = await axios.get(url, { timeout: 4000 });

      const lines = txt
        .trim()
        .split("\n")
        .filter((l) => l.trim() !== "");

      const headerRaw = lines.find((l) => l.startsWith("#"));
      const dataLine = lines.find((l) => !l.startsWith("#"));

      if (!headerRaw || !dataLine) throw "файл без данных";

      const header = headerRaw.replace(/^#/, "").trim().split(/\s+/);
      const values = dataLine.trim().split(/\s+/);

      const byKey = (key) => values[header.indexOf(key)];

      let wvht = byKey("WVHT");
      const dpd = byKey("DPD");

      if ((!wvht || wvht === "MM") && (byKey("WWH") || byKey("SwH"))) {
        const seaFt = byKey("WWH") !== "MM" ? byKey("WWH") : byKey("SwH");
        if (seaFt && seaFt !== "MM") wvht = (+seaFt * 0.3048).toFixed(2);
      }

      if (!wvht || wvht === "MM" || +wvht <= 0) throw "нет высоты";

      const H = (+wvht).toFixed(1);
      const T = dpd !== "MM" ? (+dpd).toFixed(0) : "–";

      const comment =
        H < 0.5
          ? "почти штиль"
          : H < 1
          ? "невысокая"
          : H < 2
          ? "для сёрфа"
          : "крупная";

      const rawLine = `🏄 Волна (Ocean City): ${H} м • ${T} с между гребнями → ${comment}`;

      return {
        text: md(rawLine),
        rawLine,
        height: +H,
        period: T !== "–" ? Number(T) : null,
      };
    } catch (e) {
      console.warn(`[wave] ${b.name} – ${e}`);
    }
  }

  const rawLine = "🏄 Данных о текущей волне нет";

  return {
    text: md(rawLine),
    rawLine,
    height: null,
    period: null,
  };
}

/* ─── 4b. Прогноз волн Open-Meteo Marine ─────────────────────────────── */
async function getMarineWaveForecast() {
  const lat = Number(process.env.OCEANCITY_MARINE_LAT || process.env.OCEANCITY_LAT);
  const lon = Number(process.env.OCEANCITY_MARINE_LON || process.env.OCEANCITY_LON);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      status: "missing_coordinates",
      hasData: false,
      points: [],
      peakHeight: null,
      peakPeriod: null,
      peakDirection: null,
      peakTime: "",
      currentHeight: null,
    };
  }

  try {
    const { data } = await axios.get(
      "https://marine-api.open-meteo.com/v1/marine",
      {
        params: {
          latitude: lat,
          longitude: lon,
          hourly: "wave_height,wave_period,wave_direction",
          forecast_days: 1,
          timezone: "America/New_York",
        },
        timeout: 10000,
      }
    );

    const hourly = data?.hourly || {};
    const times = hourly.time || [];
    const heights = hourly.wave_height || [];
    const periods = hourly.wave_period || [];
    const directions = hourly.wave_direction || [];

    if (!times.length || !heights.length) {
      return {
        status: "no_marine_data",
        hasData: false,
        points: [],
        peakHeight: null,
        peakPeriod: null,
        peakDirection: null,
        peakTime: "",
        currentHeight: null,
      };
    }

    const todayNY = getNYDateKey(new Date());
    const currentHourNY = getNYHour(new Date());

    let startIndex = times.findIndex((t) => {
      const dateKey = t.slice(0, 10);
      const hour = Number(t.slice(11, 13));

      return dateKey === todayNY && hour >= currentHourNY;
    });

    if (startIndex < 0) startIndex = 0;

    const points = times
      .slice(startIndex, startIndex + 12)
      .map((time, i) => {
        const originalIndex = startIndex + i;

        return {
          time,
          height: getNumberOrNull(heights[originalIndex]),
          period: getNumberOrNull(periods[originalIndex]),
          direction: getNumberOrNull(directions[originalIndex]),
        };
      })
      .filter((p) => typeof p.height === "number");

    if (!points.length) {
      return {
        status: "no_valid_marine_points",
        hasData: false,
        points: [],
        peakHeight: null,
        peakPeriod: null,
        peakDirection: null,
        peakTime: "",
        currentHeight: null,
      };
    }

    const peak = points.reduce((best, p) =>
      p.height > best.height ? p : best
    );

    return {
      status: "ok",
      hasData: true,
      points,
      currentHeight: points[0]?.height ?? null,
      peakHeight: peak.height,
      peakPeriod: peak.period,
      peakDirection: peak.direction,
      peakTime: peak.time,
    };
  } catch (e) {
    console.warn("[marine-wave]", e.response?.status ?? e.message);

    return {
      status: "fetch_error",
      hasData: false,
      error: e.response?.status ?? e.message,
      points: [],
      peakHeight: null,
      peakPeriod: null,
      peakDirection: null,
      peakTime: "",
      currentHeight: null,
    };
  }
}

function buildWaveText(wave, marineWave) {
  const baseLine = wave?.rawLine || "🏄 Данных о текущей волне нет";

  if (!marineWave?.hasData || typeof marineWave.peakHeight !== "number") {
    return wave?.text || md(baseLine);
  }

  const peakHeight = marineWave.peakHeight.toFixed(1);
  const peakTime = formatOpenMeteoLocalTime(marineWave.peakTime);
  const periodPart =
    typeof marineWave.peakPeriod === "number"
      ? ` • ${Math.round(marineWave.peakPeriod)} с`
      : "";

  const direction = directionToCompass(marineWave.peakDirection);
  const directionPart = direction ? ` • ${direction}` : "";

  const forecastPart =
    `прогноз 12ч: до ${peakHeight} м` +
    (peakTime ? ` около ${peakTime}` : "") +
    periodPart +
    directionPart;

  return md(`${baseLine} • ${forecastPart}`);
}

/* ─── NWS: Опасные течения у берега / Rip Current Risk ───────────────── */
function parseShoreCurrentRiskFromText(text = "") {
  const patterns = [
    /Rip Current Risk(?:\*|\.{2,}|:|\s+)*\s*(Low|Moderate|High)/i,
    /\b(Low|Moderate|High)\s+Rip Current Risk/i,
    /\b(Low|Moderate|High)\s+Risk\s+of\s+Rip\s+Currents/i,
    /Risk\s+of\s+Rip\s+Currents(?:\*|\.{2,}|:|\s+)*\s*(Low|Moderate|High)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

function findRelevantSurfZoneSection(productText = "") {
  const normalized = productText.replace(/\r/g, "");
  const sections = normalized.split(/\n\$\$\n|\n&&\n/g);

  const targetWords = [
    "ocean city",
    "cape may",
    "coastal cape may",
    "atlantic coastal cape may",
    "coastal atlantic",
    "atlantic county",
  ];

  const found = sections.find((section) => {
    const lower = section.toLowerCase();
    return targetWords.some((word) => lower.includes(word));
  });

  return found || normalized;
}

function getShoreCurrentRiskLabel(level) {
  if (level === "high") return "высокий";
  if (level === "moderate") return "умеренный";
  if (level === "low") return "низкий";
  return "";
}

function getShoreCurrentRiskAdvice(level) {
  if (level === "high") {
    return "лучше не заходить глубоко и купаться только рядом со спасателями";
  }

  if (level === "moderate") {
    return "купаться осторожно, лучше рядом со спасателями";
  }

  if (level === "low") {
    return "обычная осторожность у воды";
  }

  return "";
}

function formatShoreCurrentRiskText(risk) {
  if (!risk?.level) return "";

  const label = getShoreCurrentRiskLabel(risk.level);
  const advice = getShoreCurrentRiskAdvice(risk.level);

  return md(`🛟 Опасные течения у берега: ${label} риск — ${advice}`);
}

async function getShoreCurrentRisk() {
  try {
    const listUrl = `${NWS_BASE_URL}/products/types/${NWS_SURF_PRODUCT_TYPE}/locations/${NWS_SURF_PRODUCT_LOCATION}`;

    const { data: listData } = await axios.get(listUrl, {
      headers: NWS_HEADERS,
      timeout: 10000,
    });

    const products = listData?.["@graph"] || listData?.features || [];

    if (!products.length) {
      return {
        level: null,
        text: "",
        status: "no_products",
        source: "nws_surf_zone_forecast",
      };
    }

    const latest = products[0];
    const productUrl =
      latest?.["@id"] ||
      latest?.id ||
      (latest?.properties?.["@id"] ? latest.properties["@id"] : null);

    if (!productUrl) {
      return {
        level: null,
        text: "",
        status: "missing_product_url",
        source: "nws_surf_zone_forecast",
      };
    }

    const { data: productData } = await axios.get(productUrl, {
      headers: NWS_HEADERS,
      timeout: 10000,
    });

    const productText =
      productData?.productText || productData?.properties?.productText || "";

    if (!productText) {
      return {
        level: null,
        text: "",
        status: "missing_product_text",
        source: "nws_surf_zone_forecast",
      };
    }

    const relevantSection = findRelevantSurfZoneSection(productText);
    const level =
      parseShoreCurrentRiskFromText(relevantSection) ||
      parseShoreCurrentRiskFromText(productText);

    if (!level) {
      return {
        level: null,
        text: "",
        status: "risk_not_found_in_product",
        source: "nws_surf_zone_forecast",
      };
    }

    const risk = {
      level,
      status: "ok",
      source: "nws_surf_zone_forecast",
    };

    return {
      ...risk,
      text: formatShoreCurrentRiskText(risk),
    };
  } catch (e) {
    console.warn("[shore-current-risk]", e.response?.status ?? e.message);

    return {
      level: null,
      text: "",
      status: "fetch_error",
      error: e.response?.status ?? e.message,
      source: "nws_surf_zone_forecast",
    };
  }
}

/* ─── NWS: Active Alerts ─────────────────────────────────────────────── */
function getNWSAlertImpact(alert = {}) {
  const event = String(alert.event || "").toLowerCase();
  const severity = String(alert.severity || "").toLowerCase();

  const highImpactEvents = [
    "tornado warning",
    "severe thunderstorm warning",
    "flash flood warning",
    "flood warning",
    "coastal flood warning",
    "storm surge warning",
    "hurricane warning",
    "tropical storm warning",
    "high wind warning",
    "excessive heat warning",
    "special marine warning",
  ];

  const mediumImpactEvents = [
    "beach hazards statement",
    "rip current statement",
    "high surf advisory",
    "coastal flood advisory",
    "heat advisory",
    "wind advisory",
    "gale warning",
  ];

  if (severity === "extreme" || severity === "severe") return 3;

  if (highImpactEvents.some((name) => event.includes(name))) return 3;

  if (event.includes("warning")) return 3;

  if (mediumImpactEvents.some((name) => event.includes(name))) return 2;

  if (event.includes("watch")) return 2;

  return 0;
}

async function getNWSActiveAlerts() {
  const lat = Number(process.env.OCEANCITY_LAT);
  const lon = Number(process.env.OCEANCITY_LON);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      text: "",
      alerts: [],
      totalActive: 0,
      seriousCount: 0,
      maxImpact: 0,
      status: "missing_coordinates",
    };
  }

  try {
    const { data } = await axios.get(`${NWS_BASE_URL}/alerts/active`, {
      headers: NWS_HEADERS,
      timeout: 10000,
      params: {
        point: `${lat},${lon}`,
      },
    });

    const features = data?.features || [];

    const allAlerts = features.map((feature) => {
      const p = feature.properties || {};

      return {
        id: feature.id || p.id || "",
        event: p.event || "",
        headline: p.headline || "",
        description: p.description || "",
        severity: p.severity || "",
        urgency: p.urgency || "",
        certainty: p.certainty || "",
        effective: p.effective || "",
        ends: p.ends || p.expires || "",
      };
    });

    const seriousAlerts = allAlerts
      .map((alert) => ({
        ...alert,
        impact: getNWSAlertImpact(alert),
      }))
      .filter((alert) => alert.impact >= 2)
      .sort((a, b) => b.impact - a.impact);

    const maxImpact = seriousAlerts.reduce(
      (max, alert) => Math.max(max, alert.impact),
      0
    );

    return {
      text: "",
      alerts: seriousAlerts,
      totalActive: allAlerts.length,
      seriousCount: seriousAlerts.length,
      maxImpact,
      status: "ok",
    };
  } catch (e) {
    console.warn("[nws-alerts]", e.response?.status ?? e.message);

    return {
      text: "",
      alerts: [],
      totalActive: 0,
      seriousCount: 0,
      maxImpact: 0,
      status: "fetch_error",
      error: e.response?.status ?? e.message,
    };
  }
}

function applyShoreCurrentRiskAlertFallback(shoreCurrentRisk, nwsAlerts) {
  if (shoreCurrentRisk?.level) {
    return shoreCurrentRisk;
  }

  const alerts = nwsAlerts?.alerts || [];

  const beachHazardAlert = alerts.find((alert) => {
    const event = String(alert.event || "").toLowerCase();
    return (
      event.includes("rip current") ||
      event.includes("beach hazards") ||
      event.includes("high surf")
    );
  });

  if (!beachHazardAlert) {
    return shoreCurrentRisk;
  }

  const combinedText = `${beachHazardAlert.event} ${beachHazardAlert.headline} ${beachHazardAlert.description}`;
  const parsedLevel = parseShoreCurrentRiskFromText(combinedText);

  const fallbackLevel =
    parsedLevel ||
    (String(beachHazardAlert.event || "")
      .toLowerCase()
      .includes("high surf")
      ? "moderate"
      : "high");

  const risk = {
    level: fallbackLevel,
    status: "derived_from_active_alert",
    source: "nws_active_alert",
  };

  return {
    ...risk,
    text: formatShoreCurrentRiskText(risk),
  };
}

function getFriendlyAlertName(event = "") {
  const e = event.toLowerCase();

  if (e.includes("severe thunderstorm warning")) {
    return "Сильная гроза рядом";
  }

  if (e.includes("severe thunderstorm watch")) {
    return "Сильные грозы возможны";
  }

  if (e.includes("tornado warning")) {
    return "Торнадо рядом";
  }

  if (e.includes("tornado watch")) {
    return "Возможны торнадо";
  }

  if (e.includes("flash flood warning")) {
    return "Возможен внезапный паводок";
  }

  if (e.includes("flood warning")) {
    return "Предупреждение о затоплении";
  }

  if (e.includes("coastal flood warning")) {
    return "Серьёзное прибрежное затопление";
  }

  if (e.includes("coastal flood advisory")) {
    return "Возможное прибрежное затопление";
  }

  if (e.includes("beach hazards statement")) {
    return "Опасные условия на пляже";
  }

  if (e.includes("rip current statement")) {
    return "Опасные течения у берега";
  }

  if (e.includes("high surf advisory")) {
    return "Высокий прибой";
  }

  if (e.includes("high wind warning")) {
    return "Опасно сильный ветер";
  }

  if (e.includes("wind advisory")) {
    return "Сильный ветер";
  }

  if (e.includes("heat advisory")) {
    return "Опасная жара";
  }

  if (e.includes("excessive heat warning")) {
    return "Очень опасная жара";
  }

  if (e.includes("special marine warning")) {
    return "Опасные условия на воде";
  }

  return event || "Погодное предупреждение";
}

function getAlertMeaning(alert = {}) {
  const event = String(alert.event || "").toLowerCase();
  const headline = cleanText(alert.headline || "");
  const description = cleanText(alert.description || "");

  if (event.includes("severe thunderstorm warning")) {
    return "сильная гроза уже наблюдается или ожидается очень скоро: возможны сильный ветер, град и ливень";
  }

  if (event.includes("severe thunderstorm watch")) {
    return "условия благоприятны для сильных гроз: возможны сильный ветер, град и ливень";
  }

  if (event.includes("tornado warning")) {
    return "торнадо уже наблюдается или возможно очень скоро; это серьёзный alert";
  }

  if (event.includes("tornado watch")) {
    return "условия благоприятны для формирования торнадо";
  }

  if (event.includes("flash flood warning")) {
    return "возможен быстрый паводок или затопление низких участков";
  }

  if (event.includes("flood warning")) {
    return "есть риск затопления дорог или низких участков";
  }

  if (event.includes("coastal flood warning")) {
    return "возможно значительное затопление у побережья";
  }

  if (event.includes("coastal flood advisory")) {
    return "возможны minor flooding / подтопления около берега";
  }

  if (event.includes("beach hazards statement")) {
    return "на пляже могут быть опасные условия, включая сильные течения или высокий прибой";
  }

  if (event.includes("rip current statement")) {
    return "у берега возможны опасные обратные течения, которые могут утянуть от берега";
  }

  if (event.includes("high surf advisory")) {
    return "ожидается высокий прибой и более опасные условия у воды";
  }

  if (event.includes("high wind warning")) {
    return "ожидается опасно сильный ветер";
  }

  if (event.includes("wind advisory")) {
    return "ветер может быть достаточно сильным, чтобы мешать прогулке или пляжу";
  }

  if (event.includes("heat advisory")) {
    return "жара может быть опасной при долгом нахождении на солнце";
  }

  if (event.includes("excessive heat warning")) {
    return "очень высокая жара; лучше избегать долгого пребывания на солнце";
  }

  if (event.includes("special marine warning")) {
    return "опасные условия на воде: сильный ветер, гроза или резкое ухудшение погоды";
  }

  /*
    Fallback: если alert неизвестный, берём headline или начало description.
    Главное — не тащить весь длинный текст из NWS.
  */
  if (headline) {
    return truncateText(headline, 120);
  }

  if (description) {
    return truncateText(description, 120);
  }

  return "подробности доступны в предупреждении NWS";
}

function getAlertAction(alert = {}) {
  const event = String(alert.event || "").toLowerCase();

  if (
    event.includes("severe thunderstorm warning") ||
    event.includes("tornado warning") ||
    event.includes("flash flood warning") ||
    event.includes("special marine warning")
  ) {
    return "лучше отложить поездку и следить за обновлениями";
  }

  if (
    event.includes("severe thunderstorm watch") ||
    event.includes("tornado watch")
  ) {
    return "погода может быстро ухудшиться, проверь прогноз перед выездом";
  }

  if (
    event.includes("beach hazards") ||
    event.includes("rip current") ||
    event.includes("high surf")
  ) {
    return "купаться только рядом со спасателями";
  }

  if (event.includes("coastal flood")) {
    return "проверь дороги и парковку рядом с берегом";
  }

  if (event.includes("heat")) {
    return "вода, SPF, тень и меньше времени на прямом солнце";
  }

  return "";
}

function buildNWSAlertsText(nwsAlerts, shoreCurrentRisk) {
  const alerts = nwsAlerts?.alerts || [];

  if (!alerts.length) return "";

  const filteredAlerts = alerts.filter((alert) => {
    const event = String(alert.event || "").toLowerCase();

    /*
      Если у нас уже есть отдельный блок "Опасные течения у берега",
      не дублируем Rip Current / Beach Hazards в alerts.
    */
    if (
      shoreCurrentRisk?.level &&
      (event.includes("rip current") || event.includes("beach hazards"))
    ) {
      return false;
    }

    return true;
  });

  if (!filteredAlerts.length) return "";

  const lines = filteredAlerts.slice(0, 2).map((alert) => {
    const friendlyName = getFriendlyAlertName(alert.event);
    const meaning = getAlertMeaning(alert);
    const action = getAlertAction(alert);
    const until = alert.ends ? ` до ${formatNYDateTime(alert.ends)}` : "";

    const actionText = action ? ` Рекомендация: ${action}.` : "";

    return (
      `• ${friendlyName} (${alert.event})${until} — ${meaning}.` +
      actionText
    );
  });

  return (
    md("⚠️ Серьёзные погодные предупреждения:") +
    "\n" +
    lines.map(md).join("\n")
  );
}

/* ─── Scores ─────────────────────────────────────────────────────────── */
function clamp(value, min = 0, max = 10) {
  return Math.max(min, Math.min(max, value));
}

function getBeachLabel(score) {
  if (score >= 8) return "хороший пляжный день";
  if (score >= 6) return "нормально для пляжа";
  if (score >= 4) return "так себе для пляжа";
  return "лучше не планировать пляж";
}

function getSurfLabel(score) {
  if (score >= 8) return "хорошие условия для сёрфа";
  if (score >= 6) return "нормально для сёрфа";
  if (score >= 4) return "средние условия для сёрфа";
  return "не лучшие условия для сёрфа";
}

function getWetsuitAdvice(tempC) {
  if (typeof tempC !== "number") return "";

  if (tempC < 10) return "5/4 мм или толще";
  if (tempC < 14) return "4/3 мм рекомендуется";
  if (tempC < 18) return "3/2 мм рекомендуется";
  if (tempC < 21) return "shorty или 3/2 мм по комфорту";

  return "обычно не нужен";
}

function getScores({
  water,
  wind,
  wave,
  weather,
  shoreCurrentRisk,
  nwsAlerts,
  marineWave,
}) {
  let beachScore = 10;
  let surfScore = 5;

  const notes = [];

  // Serious NWS alerts
  if (nwsAlerts?.maxImpact >= 3) {
    beachScore -= 5;
    surfScore -= 3;
    notes.push("есть серьёзное погодное предупреждение");
  } else if (nwsAlerts?.maxImpact >= 2) {
    beachScore -= 3;
    surfScore -= 1;
    notes.push("есть погодное предупреждение");
  }

  // Dangerous shore currents / rip currents
  if (shoreCurrentRisk?.level === "high") {
    beachScore -= 4;
    surfScore -= 2;
    notes.push("опасные течения у берега");
  } else if (shoreCurrentRisk?.level === "moderate") {
    beachScore -= 2;
    surfScore -= 1;
    notes.push("возможны сильные течения у берега");
  }

  // Water temperature
  if (typeof water.tempC === "number") {
    if (water.tempC < 14) {
      beachScore -= 4;
      surfScore -= 1;
      notes.push("вода очень холодная");
    } else if (water.tempC < 18) {
      beachScore -= 3;
      notes.push("вода холодная");
    } else if (water.tempC < 21) {
      beachScore -= 1;
      notes.push("вода прохладная");
    } else {
      beachScore += 1;
    }
  }

  // Wind
  if (typeof wind.speed === "number") {
    if (wind.speed <= 5) {
      beachScore += 1;
      surfScore += 1;
    } else if (wind.speed > 8 && wind.speed <= 14) {
      beachScore -= 2;
      surfScore -= 1;
      notes.push("ветер заметный");
    } else if (wind.speed > 14) {
      beachScore -= 4;
      surfScore -= 2;
      notes.push("очень сильный ветер");
    }
  }

  const waveHeightForScore =
    typeof wave.height === "number"
      ? wave.height
      : typeof marineWave?.currentHeight === "number"
      ? marineWave.currentHeight
      : null;

  const wavePeriodForScore =
    typeof wave.period === "number"
      ? wave.period
      : typeof marineWave?.peakPeriod === "number"
      ? marineWave.peakPeriod
      : null;

  // Current wave or fallback from marine forecast
  if (typeof waveHeightForScore === "number") {
    if (waveHeightForScore < 0.5) {
      beachScore += 1;
      surfScore -= 2;
    } else if (waveHeightForScore >= 0.8 && waveHeightForScore <= 1.8) {
      surfScore += 3;
      notes.push("волна хорошая для сёрфа");
    } else if (waveHeightForScore > 1.8 && waveHeightForScore <= 2.4) {
      beachScore -= 1;
      surfScore += 1;
      notes.push("волна крупновата");
    } else if (waveHeightForScore > 2.4) {
      beachScore -= 3;
      surfScore -= 1;
      notes.push("волна слишком крупная");
    }
  }

  // Wave forecast peak
  if (
    typeof marineWave?.peakHeight === "number" &&
    typeof waveHeightForScore === "number"
  ) {
    if (marineWave.peakHeight > waveHeightForScore + 0.4) {
      notes.push("волна может усилиться");
    }

    if (marineWave.peakHeight > 2.4) {
      beachScore -= 2;
      surfScore -= 1;
      notes.push("по прогнозу волна станет слишком крупной");
    }
  }

  // Wave period
  if (typeof wavePeriodForScore === "number") {
    if (wavePeriodForScore >= 6 && wavePeriodForScore <= 12) {
      surfScore += 1;
    } else if (wavePeriodForScore < 5) {
      surfScore -= 1;
    }
  }

  // Rain / storm forecast for Ocean City
  const next12h = weather.oceanCityForecast?.slice(0, 4) || [];

  const willRain = next12h.some((p) => {
    const main = p.weather?.[0]?.main || "";
    return (
      ["Rain", "Thunderstorm", "Drizzle", "Snow"].includes(main) ||
      p.pop >= 0.35
    );
  });

  const willStorm = next12h.some((p) => {
    const id = p.weather?.[0]?.id;
    return id >= 200 && id < 300;
  });

  if (willStorm) {
    beachScore -= 5;
    surfScore -= 3;
    notes.push("возможна гроза");
  } else if (willRain) {
    beachScore -= 2;
    surfScore -= 1;
    notes.push("возможен дождь");
  }

  beachScore = clamp(Math.round(beachScore));
  surfScore = clamp(Math.round(surfScore));

  const mainNotes = notes
    .slice(0, 2)
    .join(", ")
    .replace(
      "волна хорошая для сёрфа, вода очень холодная",
      "хорошая волна, но вода очень холодная"
    )
    .replace(
      "вода очень холодная, волна хорошая для сёрфа",
      "хорошая волна, но вода очень холодная"
    );

  const surfNote = mainNotes ? ` — ${mainNotes}` : "";

  return {
    beachScore,
    surfScore,
    text: md(
      `🏖️ Beach score: ${beachScore}/10 — ${getBeachLabel(beachScore)}\n` +
        `🏄 Surf score: ${surfScore}/10 — ${getSurfLabel(surfScore)}${surfNote}`
    ),
  };
}

/* ─── Best time window ───────────────────────────────────────────────── */
function getNYDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getNYHour(date) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).format(date);

  return Number(hour);
}

function formatNYTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
    timeZone: "America/New_York",
  });
}

function getBestTimeWindow(
  forecast = [],
  { water, scores, shoreCurrentRisk, nwsAlerts } = {}
) {
  if (!forecast.length) {
    return { text: "" };
  }

  /*
    Если есть серьёзный weather alert или высокий риск течений,
    лучше не говорить "лучшее окно для пляжа".
    Можно оставить только прогулку у океана.
  */
  const forceWalkOnly =
    nwsAlerts?.maxImpact >= 3 || shoreCurrentRisk?.level === "high";

  const todayNY = getNYDateKey(new Date());

  let slots = forecast
    .map((p) => {
      const date = new Date(p.dt * 1000);
      const hour = getNYHour(date);

      return {
        date,
        hour,
        temp: p.main?.temp,
        wind: p.wind?.speed,
        pop: p.pop ?? 0,
        weatherMain: p.weather?.[0]?.main || "",
      };
    })
    .filter((slot) => {
      const sameDay = getNYDateKey(slot.date) === todayNY;
      return sameDay && slot.hour >= 7 && slot.hour <= 19;
    });

  if (!slots.length) {
    slots = forecast.slice(0, 8).map((p) => {
      const date = new Date(p.dt * 1000);

      return {
        date,
        hour: getNYHour(date),
        temp: p.main?.temp,
        wind: p.wind?.speed,
        pop: p.pop ?? 0,
        weatherMain: p.weather?.[0]?.main || "",
      };
    });
  }

  const scoredSlots = slots.map((slot) => {
    let score = 0;

    if (slot.temp >= 24 && slot.temp <= 32) {
      score += 3;
    } else if (slot.temp >= 20 && slot.temp < 24) {
      score += 2;
    } else if (slot.temp < 18) {
      score -= 1;
    }

    if (slot.wind < 5) {
      score += 3;
    } else if (slot.wind < 8) {
      score += 1;
    } else {
      score -= 2;
    }

    if (slot.pop < 0.2) {
      score += 2;
    } else if (slot.pop >= 0.4) {
      score -= 2;
    }

    if (["Rain", "Thunderstorm", "Drizzle", "Snow"].includes(slot.weatherMain)) {
      score -= 5;
    }

    if (slot.hour >= 12 && slot.hour <= 15) {
      score -= 1;
    }

    return {
      ...slot,
      score,
    };
  });

  const best = scoredSlots.sort((a, b) => b.score - a.score)[0];

  if (!best) {
    return { text: "" };
  }

  const start = formatNYTime(best.date);
  const end = formatNYTime(new Date(best.date.getTime() + 3 * 60 * 60 * 1000));

  const details = [];

  if (typeof best.temp === "number") {
    const tempC = Math.round(best.temp);
    const tempF = toF(tempC);
    details.push(`воздух около ${tempC}°C (${tempF}°F)`);
  }

  if (typeof best.wind === "number") {
    details.push(`ветер ${best.wind.toFixed(1)} м/с`);
  }

  if (typeof best.pop === "number" && best.pop >= 0.3) {
    details.push(`шанс дождя ${Math.round(best.pop * 100)}%`);
  }

  const detailsText = details.length ? ` — ${details.join(", ")}` : "";

  const waterIsComfortable =
    typeof water?.tempC === "number" && water.tempC >= 18;

  const beachIsReasonable =
    typeof scores?.beachScore === "number" && scores.beachScore >= 6;

  const windowType =
    !forceWalkOnly && waterIsComfortable && beachIsReasonable
      ? "для пляжа"
      : "для прогулки у океана";

  return {
    text: md(`🕒 Лучшее окно ${windowType}: ${start}–${end}${detailsText}`),
  };
}

/* ─── wrappers ───────────────────────────────────────────────────────── */
async function wrap(name, fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(
      `[${name}] -- ${e.response?.status} ${
        e.response?.data?.message ?? e.message
      }`
    );
    throw e;
  }
}

async function optionalWrap(name, fn, fallback) {
  try {
    return await fn();
  } catch (e) {
    console.warn(
      `[${name}] optional block failed:`,
      e.response?.status ?? e.message
    );

    return typeof fallback === "function" ? fallback(e) : fallback;
  }
}

/* ─── Сборка и отправка дайджеста ────────────────────────────────────── */
(async () => {
  try {
    const [
      weather,
      water,
      wind,
      wave,
      marineWave,
      shoreCurrentRiskRaw,
      nwsAlerts,
      events,
    ] = await Promise.all([
      wrap("weather", getWeather),
      wrap("water", getWaterTemp),
      wrap("wind", getWind),
      wrap("wave", getWave),

      optionalWrap("marine-wave", getMarineWaveForecast, {
        status: "optional_failed",
        hasData: false,
        points: [],
        peakHeight: null,
        peakPeriod: null,
        peakDirection: null,
        peakTime: "",
        currentHeight: null,
      }),

      optionalWrap("shore-current-risk", getShoreCurrentRisk, {
        level: null,
        text: "",
        status: "optional_failed",
        source: "nws_surf_zone_forecast",
      }),

      optionalWrap("nws-alerts", getNWSActiveAlerts, {
        text: "",
        alerts: [],
        totalActive: 0,
        seriousCount: 0,
        maxImpact: 0,
        status: "optional_failed",
      }),

      getOceanCityEvents().catch((e) => {
        console.warn("[ocnj-events] optional block failed:", e.message);

        return {
          text: "",
          status: "optional_block_failed",
          error: e.message,
          totalFound: 0,
          totalMatched: 0,
        };
      }),
    ]);

    if (!events?.text) {
      console.log(
        `[ocnj-events] block skipped: ${events?.status || "unknown"} | found: ${
          events?.totalFound ?? 0
        } | matched: ${events?.totalMatched ?? 0}`
      );
    }

    if (!marineWave?.hasData) {
      console.log(`[marine-wave] forecast skipped: ${marineWave?.status}`);
    }

    if (!shoreCurrentRiskRaw?.level) {
      console.log(
        `[shore-current-risk] block skipped: ${shoreCurrentRiskRaw?.status}`
      );
    }

    if (!nwsAlerts?.seriousCount) {
      console.log(`[nws-alerts] no serious alerts | status: ${nwsAlerts?.status}`);
    }

    const shoreCurrentRisk = applyShoreCurrentRiskAlertFallback(
      shoreCurrentRiskRaw,
      nwsAlerts
    );

    const nwsAlertsText = buildNWSAlertsText(nwsAlerts, shoreCurrentRisk);
    const waveText = buildWaveText(wave, marineWave);

    const scores = getScores({
      weather,
      water,
      wind,
      wave,
      marineWave,
      shoreCurrentRisk,
      nwsAlerts,
    });

    const bestWindow = getBestTimeWindow(weather.oceanCityForecast, {
      water,
      scores,
      shoreCurrentRisk,
      nwsAlerts,
    });

    const msg =
      "🌅 Доброе утро\n\n" +
      weather.text +
      (nwsAlertsText ? "\n\n" + nwsAlertsText : "") +
      (shoreCurrentRisk?.text ? "\n" + shoreCurrentRisk.text : "") +
      "\n\n" +
      wind.text +
      "\n" +
      waveText +
      "\n" +
      water.text +
      "\n\n" +
      scores.text +
      (bestWindow.text ? "\n\n" + bestWindow.text : "") +
      (events?.text ? "\n\n" + events.text : "");

    console.log(">>> telegram payload <<<\n", msg);

    await sendTelegramMessage(msg);

    console.log("Digest sent ✅");
  } catch (err) {
    console.error("Digest error:", err.message);
  }
})();