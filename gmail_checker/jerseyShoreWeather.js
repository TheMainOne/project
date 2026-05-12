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

const toF = (c) => Math.round((c * 9) / 5 + 32);

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
  let dryFlag = false; // флаг для Ocean City

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
    const next12h = fc.data.list.slice(0, 4); // 4×3 ч = 12 ч
    const willStorm = next12h.some(
      (p) => p.weather[0].id >= 200 && p.weather[0].id < 300
    );
    const willRain = next12h.some(
      (p) =>
        ["Rain", "Thunderstorm", "Drizzle", "Snow"].includes(
          p.weather[0].main
        ) || p.pop >= 0.3
    );
    const temps = fc.data.list.map((p) => p.main.temp);
    const tMinC = Math.round(Math.min(...temps));
    const tMaxC = Math.round(Math.max(...temps));
    const tMinF = toF(tMinC);
    const tMaxF = toF(tMaxC);
    const descRaw = cur.data.weather[0].description;
    const isDry = !(willRain || willStorm);

    out.push(
      md(`*${c.name}:* ${tMinC}°→${tMaxC}°C (${tMinF}°→${tMaxF}°F), ${descRaw}`)
    );
    if (c.name === "Ocean City") {
      dryFlag = isDry;
    }
  }

  return { text: out.join("\n"), isDry: dryFlag };
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
        let text = md(
          `🌊 Температура воды (Ocean City): *${tempC}°C (${tempF}°F)*`
        );
        return { text, temp: tempC };
      }
      console.log(`[water] ${s.name} – нет свежих данных`);
    } catch (err) {
      console.log(`[water] ${s.name} – ${err.response?.status ?? err.code}`);
    }
  }

  return { text: md("🌡️ Нет данных о температуре воды"), temp: -Infinity };
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

        return { text: md(line), speed: spd };
      }
      console.warn(`[wind] ${s.name} – пустой ответ`);
    } catch (e) {
      console.warn(`[wind] ${s.name} – ${e.response?.status ?? e.code}`);
    }
  }

  // если до сюда дошли — нет ни одной свежей записи
  return { text: "💨 Данных о ветре нет", speed: Infinity };
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

      return {
        text: md(
          `🏄 Волна (Ocean City): *${H} м* • *${T} с между гребнями* → ${comment}`
        ),
        height: +H,
      };
    } catch (e) {
      console.warn(`[wave] ${b.name} – ${e}`);
    }
  }

  return { text: md("🏄 Данных о волне нет"), height: Infinity };
}

/* ─── UV index ─────────────────────────── */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getUV() {
  const { OCEANCITY_LAT, OCEANCITY_LON } = process.env;
  const url = "https://api.open-meteo.com/v1/forecast";

  const params = {
    latitude: Number(OCEANCITY_LAT),
    longitude: Number(OCEANCITY_LON),
    daily: "uv_index_max",
    forecast_days: 1,
    timezone: "America/New_York",
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data } = await axios.get(url, {
        params,
        timeout: 15000,
      });

      const uviMax = data.daily?.uv_index_max?.[0];

      if (typeof uviMax !== "number") {
        console.warn("[uv] missing uv_index_max:", JSON.stringify(data));
        return { text: md("🔆 Нет данных UV"), uvi: -1 };
      }

      let level = "низкий 🟢";

      if (uviMax >= 11) {
        level = "экстремальный ☠️ | Избегай солнца; SPF 50+, тень";
      } else if (uviMax >= 8) {
        level = "очень высокий 🔴 | SPF 50, шляпа, тень";
      } else if (uviMax >= 6) {
        level = "высокий 🟠 | SPF 30-50, очки, кепка";
      } else if (uviMax >= 3) {
        level = "умеренный 🟡 | SPF 30, очки";
      }

      const text = md(
        `🔆 UV-индекс (пик днём): *${uviMax.toFixed(1)}* — ${level}`
      );

      return { text, uvi: uviMax };
    } catch (e) {
      console.warn(`[uv] attempt ${attempt} failed:`, {
        status: e.response?.status,
        code: e.code,
        message: e.message,
        response: e.response?.data,
      });

      if (attempt < 3) {
        await sleep(2000);
      }
    }
  }

  return { text: md("🔆 Нет данных UV"), uvi: -1 };
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
    const [weather, water, wind, wave, uv] = await Promise.all([
      wrap("weather", getWeather),
      wrap("water", getWaterTemp),
      wrap("wind", getWind),
      wrap("wave", getWave),
      wrap("uv", getUV),
    ]);

    const beachOK =
      water.temp >= 22 &&
      weather.isDry &&
      wind.speed < 7 &&
      wave.height < 1.5 &&
      uv.uvi < 8;

    const msg =
      "🌅 *Доброе утро*\n\n" +
      weather.text +
      "\n\n" +
      wind.text +
      "\n" +
      wave.text +
      "\n" +
      water.text +
      "\n" +
      uv.text +
      (beachOK ? `\n\n${md("☀️ Хороший день, чтобы поехать на пляж")}` : "");

    console.log(">>> telegram payload <<<\n", msg);
    await sendTelegramMessage(msg, TELEGRAM_BOT_TOKEN, CHAT_ID);
    console.log("Digest sent ✅");
  } catch (err) {
    console.error("Digest error:", err.message);
  }
})();
