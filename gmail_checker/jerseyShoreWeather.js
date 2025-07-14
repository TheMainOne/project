import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import sendTelegramMessage from "../services/telegram/telegramNotify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_TOKEN_FOR_WEATHER_CHANNEL;
const CHAT_ID = process.env.CHANNEL_ID_FOR_WEATHER_CHANNEL;

/* экранирование Markdown-V2 */
const md = (s = "") =>
  s // 1) экранируем все спец-символы
    .replace(/([\-_*[\]()~`>#+=|{}.!\\])/g, "\\$1")
    //               ↑  дефис первый в классе ─ теперь захватывается
    // 2) убираем угловые скобки (Telegram их не любит)
    .replace(/[<>]/g, "");

/* безопасный URL для Markdown-V2 */
const safeUrl = (u = "") =>
  encodeURI(u) // пробелы, Unicode и т.п.
    .replace(/\(/g, "%28") // (
    .replace(/\)/g, "%29") // )
    .replace(/!/g, "%21") // !
    .replace(/\./g, "\\.") //
    .replace(/-/g, "\\-"); //

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
    const cur = await axios.get(
      "https://api.openweathermap.org/data/2.5/weather",
      {
        params: {
          lat: c.lat,
          lon: c.lon,
          units: "metric",
          lang: "ru",
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
          lang: "ru",
          appid: OPENWEATHER_KEY,
        },
      }
    );

    const temps = fc.data.list.map((p) => p.main.temp);
    const tMin = Math.round(Math.min(...temps));
    const tMax = Math.round(Math.max(...temps));
    const desc = md(cur.data.weather[0].description);

    out.push(`*${c.name}:* ${tMin}°→${tMax}°C, ${desc}`);
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
        let text = md(`🌊 Температура воды (Ocean City): *${tempC}°C*`); // ← tempC и s.name
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
          `💨 Ветер (Ocean City): *${fmt(spd)} м/с*` +
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
  return "💨 *Данных о ветре нет*";
}

/* ─── 4. Волны ───────────────────────────────────────────────────────── */
async function getWave() {
  const buoys = [
    { id: "44091", name: "AC" }, // Atlantic City
    { id: "44009", name: "DB" }, // Delaware Bay (fallback)
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
      const byKey = (k) => values[header.indexOf(k)];

      let wvht = byKey("WVHT"); // м
      const dpd = byKey("DPD"); // с

      // резерв: высота может прийти только в футах (WWH / SwH)
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

      return md(
        `🏄 Волна (${b.name}): *${H} м* • *${T} с между гребнями* → ${comment}`
      );
    } catch (e) {
      console.warn(`[wave] ${b.name} – ${e}`);
    }
  }

  return md("🏄 *Данных о волне нет*");
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
    throw e; // пробрасываем выше, чтобы дайджест не ушёл пустым
  }
}

/* ─── 4. Сборка и отправка дайджеста ──────────────────────────────────── */
(async () => {
  try {
    const [weather, water, wind, wave] = await Promise.all([
      wrap("weather", getWeather),
      wrap("water", getWaterTemp),
      wrap("wind", getWind),
      wrap("wave", getWave),
    ]);

    const msg =
      "🌅 *Доброе утро*\n\n" +
      weather +
      "\n\n" +
      wind +
      "\n" +
      wave +
      "\n" +
      water;

    console.log(">>> telegram payload <<<\n", msg);
    await sendTelegramMessage(msg, TELEGRAM_BOT_TOKEN, CHAT_ID);
    console.log("Digest sent ✅");
  } catch (err) {
    console.error("Digest error:", err.message);
  }
})();
