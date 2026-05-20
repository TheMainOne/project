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
  s // 1) экранируем все спец-символы
    .replace(/([\-_*[\]()~`>#+=|{}.!\\])/g, "\\$1")
    //               ↑  дефис первый в классе ─ теперь захватывается
    // 2) убираем угловые скобки (Telegram их не любит)
    .replace(/[<>]/g, "");

const toF = (c) => Math.round((c * 9) / 5 + 32);

/* безопасный URL для Markdown-V2 */
const safeUrl = (u = "") =>
  encodeURI(u) // пробелы, Unicode и т.п.
    .replace(/\(/g, "%28") // (
    .replace(/\)/g, "%29") // )
    .replace(/!/g, "%21") // !
    .replace(/\./g, "\\.") //
    .replace(/-/g, "\\-"); //


    const tgUrl = (u = "") =>
  encodeURI(u)
    .replace(/\\/g, "\\\\")
    .replace(/\)/g, "\\)");

const interestingEventKeywords = [
  "festival",
  "concert",
  "parade",
  "fireworks",
  "beach",
  "boardwalk",
  "farmers market",
  "surf",
  "race",
  "challenge",
  "memorial",
  "music",
  "family",
];

const boringEventKeywords = [
  "membership",
  "networking",
  "workshop",
  "meeting",
  "support group",
];

function isInterestingEvent(item) {
  const text = `${item.title || ""} ${item.contentSnippet || ""}`.toLowerCase();

  const hasInterestingWord = interestingEventKeywords.some((word) =>
    text.includes(word)
  );

  const hasBoringWord = boringEventKeywords.some((word) =>
    text.includes(word)
  );

  return hasInterestingWord && !hasBoringWord;
}

function truncateText(text = "", max = 65) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trim() + "…" : clean;
}

function scoreOceanCityEvent(item) {
  const text = `${item.title || ""} ${item.contentSnippet || ""}`.toLowerCase();

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
    "sundaes in the park",
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
  ];

  if (highInterest.some((word) => text.includes(word))) score += 3;
  if (mediumInterest.some((word) => text.includes(word))) score += 2;

  return score;
}

const OCNJ_EVENTS_URL = "https://oceancityvacation.com/events/list/";

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
    const today = getTodayInNewYork();

    const { data: html } = await axios.get(
      `${OCNJ_EVENTS_URL}?tribe-bar-date=${today}`,
      {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      }
    );

    const $ = cheerio.load(html);
    const items = [];

    $(".tribe-events-calendar-list__event").each((_, el) => {
      const title = cleanText(
        $(el).find(".tribe-events-calendar-list__event-title-link").first().text()
      );

      const href = $(el)
        .find(".tribe-events-calendar-list__event-title-link")
        .first()
        .attr("href");

      const dateRaw = cleanText(
        $(el).find(".tribe-events-calendar-list__event-datetime").first().text()
      );

      const venue = cleanText(
        $(el).find(".tribe-events-calendar-list__event-venue-title").first().text()
      );

      const description = cleanText(
        $(el).find(".tribe-events-calendar-list__event-description").first().text()
      );

      if (!title) return;

      const date = parseOCNJDate(dateRaw);
      const link = href ? new URL(href, OCNJ_EVENTS_URL).toString() : "";
      const score = scoreOceanCityEvent({ title, description, venue });

      if (score <= 0) return;

      items.push({
        title,
        date,
        venue,
        link,
        score,
      });
    });

    const now = new Date();
    const daysAhead = 21;
    const maxDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const events = items
      .filter((event) => !event.date || event.date <= maxDate)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (a.date || 0) - (b.date || 0);
      })
      .slice(0, 2)
      .map((event) => {
        const title = truncateText(event.title);
        const dateText = event.date ? formatEventDate(event.date) : "";
        const venueText = event.venue ? ` (${event.venue})` : "";

        const eventTitle = event.link
          ? `[${md(title)}](${tgUrl(event.link)})`
          : md(title);

        return dateText
          ? `• ${md(dateText)} — ${eventTitle}${md(venueText)}`
          : `• ${eventTitle}${md(venueText)}`;
      });

    if (!events.length) {
      return { text: "" };
    }

    return {
      text:
        md("🎉 Интересное в Ocean City, NJ:") +
        "\n" +
        events.join("\n") +
        "\n" +
        `[${md("Все события OCNJ")}](${tgUrl(
          `${OCNJ_EVENTS_URL}?tribe-bar-date=${today}`
        )})`,
    };
  } catch (e) {
    console.warn("[ocnj-events]", e.message);
    return { text: "" };
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

  for (const c of cities) {
    /* текущая погода */
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

    /* прогноз на ближайшие 24 ч (8×3 ч) */
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

    /* —–– расчёт мин/макс температур —–– */
    const temps = fc.data.list.map((p) => p.main.temp); // ← переменная обязательно нужна
    const tMinC = Math.round(Math.min(...temps));
    const tMaxC = Math.round(Math.max(...temps));
    const tMinF = toF(tMinC);
    const tMaxF = toF(tMaxC);

    const descRaw = cur.data.weather[0].description;

    out.push(
      md(`${c.name}: ${tMinC}°→${tMaxC}°C (${tMinF}°→${tMaxF}°F), ${descRaw}`)
    );
  }

  return out.join("\n");
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
        const tempC = Math.round(+data.data[0].v); // ← tempC
        const good = tempC >= 21; // ≥ 21 °C ≈ 70 °F
        const tempF = toF(tempC);
        let text = md(
          `🌊 Температура воды (Ocean City): ${tempC}°C (${tempF}°F)`
        );
        if (good) {
          text += `\n${md("☀️ Хороший день, чтобы поехать на пляж")}`; //  ← без «!»
        }
        return text;
      }
      console.log(`[water] ${s.name} – нет свежих данных`);
    } catch (err) {
      console.log(`[water] ${s.name} – ${err.response?.status ?? err.code}`);
    }
  }

  throw new Error("Нет свежих данных о температуре воды");
}

/* ─── 3. Ветер ───────────────────────────────────────────────────────── */
/*  getWind()  – берём последние 6-минутные данные ветра с той же станции.
    stationId — ID, который мы уже используем для температуры воды             */
async function getWind() {
  const stations = [
    { id: "8534720", name: "Atlantic City" }, // основная
    { id: "8536110", name: "Cape May" }, // резерв
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
        const spd = +w.s; // скорость, м/с
        const gust = +w.g || spd; // порыв
        const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1);

        let remark = "лёгкий бриз";
        if (spd > 7 && spd <= 14) remark = "сильный ветер";
        else if (spd > 14) remark = "штормовой ветер";

        const line =
          `💨 Ветер (Ocean City): ${fmt(spd)} м/с` +
          (gust > spd + 2 ? ` (порывы до ${fmt(gust)} м/с)` : "") +
          ` — ${md(remark)}`;

        return md(line);
      }
      console.warn(`[wind] ${s.name} – пустой ответ`);
    } catch (e) {
      console.warn(`[wind] ${s.name} – ${e.response?.status ?? e.code}`);
    }
  }

  // если до сюда дошли — нет ни одной свежей записи
  return md("💨 Данных о ветре нет");
}

/* ─── 4. Волны ───────────────────────────────────────────────────────── */
async function getWave() {
  // основной буй + запасной
  const buoys = [
    { id: "44091", name: "AC" }, // Atlantic City
    { id: "44009", name: "DB" }, // Delaware Bay
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

      let wvht = byKey("WVHT"); // высота, м
      const dpd = byKey("DPD"); // период, c

      // резерв: иногда высота только в футах (WWH или SwH)
      if ((!wvht || wvht === "MM") && (byKey("WWH") || byKey("SwH"))) {
        const seaFt = byKey("WWH") !== "MM" ? byKey("WWH") : byKey("SwH");
        if (seaFt && seaFt !== "MM") wvht = (+seaFt * 0.3048).toFixed(2);
      }

      // если высота невалидна — пробуем следующий буй
      if (!wvht || wvht === "MM" || +wvht <= 0) throw "нет высоты";

      const H = (+wvht).toFixed(1);
      const T = dpd !== "MM" ? (+dpd).toFixed(0) : "–";

      // короткая классификация
      const comment =
        H < 0.5
          ? "почти штиль"
          : H < 1
          ? "невысокая"
          : H < 2
          ? "для сёрфа"
          : "крупная";

      // готовая лаконичная строка
      return md(
        `🏄 Волна (Ocean City): ${H} м • ${T} с между гребнями → ${comment}`
      );
    } catch (e) {
      console.warn(`[wave] ${b.name} – ${e}`);
    }
  }

  // если оба буя молчат — не падаем, а возвращаем заглушку
  return md("🏄 Данных о волне нет");
}

/* ─── вспомогательная обёртка для диагностики ─────────────────────────── */
async function wrap(name, fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(
      `[${name}] -- ${e.response?.status} ${
        e.response?.data?.message ?? e.message
      }`
    );
    throw e; // пробрасываем выше, чтобы дайджест не ушёл «пустым»
  }
}

/* ─── 4. Сборка и отправка дайджеста ──────────────────────────────────── */
(async () => {
  try {
    const [weather, water, wind, wave, events] = await Promise.all([
  wrap("weather", getWeather),
  wrap("water", getWaterTemp),
  wrap("wind", getWind),
  wrap("wave", getWave),
  wrap("oc-events", getOceanCityEvents),
]);

    const msg =
  "🌅 Доброе утро\n\n" +
  weather +
  "\n\n" +
  wind +
  "\n" +
  wave +
  "\n" +
  water +
  (events?.text ? "\n\n" + events.text : "");

    console.log(">>> telegram payload <<<\n", msg);
    await sendTelegramMessage(msg); // sendTelegramMessage уже использует MarkdownV2
    console.log("Digest sent ✅");
  } catch (err) {
    console.error("Digest error:", err.message);
  }
})();
