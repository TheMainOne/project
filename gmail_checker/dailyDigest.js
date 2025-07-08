import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import sendTelegramMessage from "../services/telegramNotify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

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
  // основной буй возле Atlantic City + запасной в проливе Делавэр
  const buoys = [
    { id: "44091", name: "Atlantic City" }, // 8 км от берега, часто даёт волну
    { id: "44009", name: "Delaware Bay" }, // fallback, если 44091 молчит
  ];

  for (const b of buoys) {
    try {
      const url = `https://www.ndbc.noaa.gov/data/latest_obs/${b.id}.json`;
      const { data } = await axios.get(url, { timeout: 4000 });

      if (!data || !data.WVHT || +data.WVHT < 0) throw "пустой ответ";

      // высота волны (метры) и доминирующий период (сек)
      const H = (+data.WVHT).toFixed(1);
      const T = (+data.DPD || +data.WH).toFixed(0); // иногда DPD == M<something>
      const dir = data.MWD ? `, ${data.MWD}°` : ""; // сред. направление

      // классификация волны
      const comment =
        H < 0.5
          ? "почти штиль"
          : H < 1
          ? "невысокая волна"
          : H < 2
          ? "для бодиборда/сёрфа"
          : "крупная волна";

      const line = `🌊 Волна (${b.name}): *${H} м* @ *${T} с*${dir} — ${comment}`;

      return md(line);
    } catch (e) {
      console.error(`[wave] ${b.name} – ${e.message || e}`);
      // пробуем следующий буй
    }
  }
  throw new Error("нет свежих данных о волне");
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
    const [weather, water, wind] = await Promise.all([
      wrap("weather", getWeather),
      wrap("water", getWaterTemp),
      wrap("wind", getWind),
      //   wrap("wave", getWave),
    ]);

    const msg =
      "🌅 *Доброе утро\\.*\n\n" + weather + "\n\n" + wind + "\n" + water;

    console.log(">>> telegram payload <<<\n", msg);
    await sendTelegramMessage(msg); // sendTelegramMessage уже использует MarkdownV2
    console.log("Digest sent ✅");
  } catch (err) {
    console.error("Digest error:", err.message);
  }
})();
