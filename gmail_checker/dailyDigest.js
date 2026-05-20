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

const OCNJ_HOME_URL = "https://oceancityvacation.com/";
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
    const items = [];

    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const rawText = cleanText($(el).text());

      if (!rawText) return;
      if (!rawText.includes("Learn More")) return;

      // На главной странице карточки обычно выглядят примерно так:
      // May 22 Unlocking of the Ocean ... May 22, 2026 12:00 PM – 1:00 PM Learn More
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

      if (score <= 0) return;

      items.push({
        title,
        dateText,
        link,
        score,
      });
    });

    const events = items
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((event) => {
        const title = truncateText(event.title, 55);

        const eventTitle = event.link
          ? `[${md(title)}](${tgUrl(event.link)})`
          : md(title);

        return `• ${md(event.dateText)} — ${eventTitle}`;
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
        `[${md("Все события OCNJ")}](${tgUrl(OCNJ_EVENTS_URL)})`,
    };
  } catch (e) {
    console.warn("[ocnj-events]", e.response?.status ?? e.message);
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
        const tempC = Math.round(+data.data[0].v); // ← tempC
        const good = tempC >= 21; // ≥ 21 °C ≈ 70 °F
        const tempF = toF(tempC);
        let text = md(
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

  // если до сюда дошли — нет ни одной свежей записи
  return {
  text: md("💨 Данных о ветре нет"),
  speed: null,
  gust: null,
};
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
      return {
  text: md(
    `🏄 Волна (Ocean City): ${H} м • ${T} с между гребнями → ${comment}`
  ),
  height: +H,
  period: T !== "–" ? Number(T) : null,
};
    } catch (e) {
      console.warn(`[wave] ${b.name} – ${e}`);
    }
  }

  // если оба буя молчат — не падаем, а возвращаем заглушку
  return {
  text: md("🏄 Данных о волне нет"),
  height: null,
  period: null,
};
}

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

function getScores({ water, wind, wave, weather }) {
  let beachScore = 10;
  let surfScore = 5;

  const notes = [];

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

  // Waves
  if (typeof wave.height === "number") {
    if (wave.height < 0.5) {
      beachScore += 1;
      surfScore -= 2;
    } else if (wave.height >= 0.8 && wave.height <= 1.8) {
      surfScore += 3;
      notes.push("волна хорошая для сёрфа");
    } else if (wave.height > 1.8 && wave.height <= 2.4) {
      beachScore -= 1;
      surfScore += 1;
      notes.push("волна крупновата");
    } else if (wave.height > 2.4) {
      beachScore -= 3;
      surfScore -= 1;
      notes.push("волна слишком крупная");
    }
  }

  // Wave period
  if (typeof wave.period === "number") {
    if (wave.period >= 6 && wave.period <= 12) {
      surfScore += 1;
    } else if (wave.period < 5) {
      surfScore -= 1;
    }
  }

  // Rain / storm forecast for Ocean City
  const next12h = weather.oceanCityForecast?.slice(0, 4) || [];
  const willRain = next12h.some((p) => {
    const main = p.weather?.[0]?.main || "";
    return ["Rain", "Thunderstorm", "Drizzle", "Snow"].includes(main) || p.pop >= 0.35;
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
  .replace("волна хорошая для сёрфа, вода очень холодная", "хорошая волна, но вода очень холодная")
  .replace("вода очень холодная, волна хорошая для сёрфа", "хорошая волна, но вода очень холодная");
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

function getBestTimeWindow(forecast = [], { water, scores } = {}) {
  if (!forecast.length) {
    return { text: "" };
  }

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

  // Если скрипт запустится поздно и на сегодня слотов уже нет — берем ближайшие доступные
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
    const reasons = [];

    if (slot.temp >= 24 && slot.temp <= 32) {
      score += 3;
      reasons.push("теплее");
    } else if (slot.temp >= 20 && slot.temp < 24) {
      score += 2;
    } else if (slot.temp < 18) {
      score -= 1;
    }

    if (slot.wind < 5) {
      score += 3;
      reasons.push("слабый ветер");
    } else if (slot.wind < 8) {
      score += 1;
    } else {
      score -= 2;
    }

    if (slot.pop < 0.2) {
      score += 2;
    } else if (slot.pop >= 0.4) {
      score -= 2;
      reasons.push("есть шанс дождя");
    }

    if (["Rain", "Thunderstorm", "Drizzle", "Snow"].includes(slot.weatherMain)) {
      score -= 5;
    }

    // Небольшой минус для самого активного солнца
    if (slot.hour >= 12 && slot.hour <= 15) {
      score -= 1;
    }

    return {
      ...slot,
      score,
      reasons,
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

const waterIsComfortable = typeof water?.tempC === "number" && water.tempC >= 18;
const beachIsReasonable = typeof scores?.beachScore === "number" && scores.beachScore >= 6;

const windowType =
  waterIsComfortable && beachIsReasonable
    ? "для пляжа"
    : "для прогулки у океана";

return {
  text: md(`🕒 Лучшее окно ${windowType}: ${start}–${end}${detailsText}`),
};
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

      getOceanCityEvents().catch((e) => {
        console.warn("[ocnj-events] optional block failed:", e.message);
        return { text: "" };
      }),
    ]);

    const scores = getScores({ weather, water, wind, wave });
const bestWindow = getBestTimeWindow(weather.oceanCityForecast, {
  water,
  scores,
});

    const msg =
      "🌅 Доброе утро\n\n" +
      weather.text +
      "\n\n" +
      wind.text +
      "\n" +
      wave.text +
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
