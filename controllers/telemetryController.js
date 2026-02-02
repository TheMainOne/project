import geoip from "geoip-lite";
import TelemetryEvent from "../models/TelemetryEvent.js";
import Client from "../models/Client.js";

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimits = new Map();
const COUNTRY_DISPLAY_NAMES =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

const REGION_NAMES_BY_COUNTRY = {
  PT: {
    "01": "Aveiro",
    "02": "Beja",
    "03": "Braga",
    "04": "Braganca",
    "05": "Castelo Branco",
    "06": "Coimbra",
    "07": "Evora",
    "08": "Faro",
    "09": "Guarda",
    "10": "Leiria",
    "11": "Lisboa",
    "12": "Portalegre",
    "13": "Porto",
    "14": "Santarem",
    "15": "Setubal",
    "16": "Viana do Castelo",
    "17": "Vila Real",
    "18": "Viseu",
    "20": "Acores",
    "30": "Madeira",
  },
  US: {
    AL: "Alabama",
    AK: "Alaska",
    AZ: "Arizona",
    AR: "Arkansas",
    CA: "California",
    CO: "Colorado",
    CT: "Connecticut",
    DE: "Delaware",
    FL: "Florida",
    GA: "Georgia",
    HI: "Hawaii",
    ID: "Idaho",
    IL: "Illinois",
    IN: "Indiana",
    IA: "Iowa",
    KS: "Kansas",
    KY: "Kentucky",
    LA: "Louisiana",
    ME: "Maine",
    MD: "Maryland",
    MA: "Massachusetts",
    MI: "Michigan",
    MN: "Minnesota",
    MS: "Mississippi",
    MO: "Missouri",
    MT: "Montana",
    NE: "Nebraska",
    NV: "Nevada",
    NH: "New Hampshire",
    NJ: "New Jersey",
    NM: "New Mexico",
    NY: "New York",
    NC: "North Carolina",
    ND: "North Dakota",
    OH: "Ohio",
    OK: "Oklahoma",
    OR: "Oregon",
    PA: "Pennsylvania",
    RI: "Rhode Island",
    SC: "South Carolina",
    SD: "South Dakota",
    TN: "Tennessee",
    TX: "Texas",
    UT: "Utah",
    VT: "Vermont",
    VA: "Virginia",
    WA: "Washington",
    WV: "West Virginia",
    WI: "Wisconsin",
    WY: "Wyoming",
    DC: "District of Columbia",
  },
};

function getClientIp(req) {
  const ip = String(req.ip || "");
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count += 1;
  return false;
}

function normalizePath(input) {
  if (!input || typeof input !== "string") return "/";
  try {
    const url = new URL(input, "http://local");
    return url.pathname || "/";
  } catch {
    const base = input.split("?")[0].split("#")[0];
    return base || "/";
  }
}

function normalizeReferrer(input) {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.hostname.toLowerCase();
  } catch {
    try {
      const url = new URL(`http://${trimmed}`);
      return url.hostname.toLowerCase();
    } catch {
      return "";
    }
  }
}

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen);
}

function parseDate(value, fallback) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeCountryCode(value) {
  if (!value) return null;
  const code = String(value).trim().toUpperCase();
  return code || null;
}

function resolveCountryName(countryCode) {
  if (!countryCode) return null;
  if (!COUNTRY_DISPLAY_NAMES) return countryCode;
  try {
    return COUNTRY_DISPLAY_NAMES.of(countryCode) || countryCode;
  } catch {
    return countryCode;
  }
}

function normalizeRegionCode(countryCode, value) {
  if (!value) return null;
  let code = String(value).trim();
  if (!code) return null;
  if (countryCode === "PT" && /^\d+$/.test(code)) {
    code = code.padStart(2, "0");
  } else {
    code = code.toUpperCase();
  }
  return code;
}

function resolveRegionName(countryCode, regionCode) {
  if (!countryCode || !regionCode) return null;
  return REGION_NAMES_BY_COUNTRY[countryCode]?.[regionCode] || null;
}

function parsePayloadBody(rawBody) {
  if (!rawBody) return {};
  if (typeof rawBody === "object") return rawBody;
  if (typeof rawBody !== "string") return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
}

function parsePagination(query) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function parseTelemetryRange(query) {
  const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const from = parseDate(query.from, defaultFrom);
  const to = parseDate(query.to, new Date());
  if (!from || !to) return { error: "Invalid from/to date" };
  if (from > to) return { error: "from must be <= to" };
  return { from, to };
}

function clampViewport(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0) return 0;
  if (rounded > 20000) return 20000;
  return rounded;
}

function isObjectId(value) {
  return /^[0-9a-fA-F]{24}$/.test(String(value || ""));
}

async function findClientByIdOrSlug(idOrSlug) {
  if (!idOrSlug) return null;
  const key = String(idOrSlug).trim();
  const filter = isObjectId(key) ? { _id: key } : { slug: key };
  return Client.findOne(filter).select("_id siteId slug name").lean();
}

function buildEventsFilter({ siteId, query, from, to }) {
  const filter = {
    siteId: String(siteId).trim(),
    createdAt: { $gte: from, $lte: to },
  };

  if (query.deviceType) {
    const device = String(query.deviceType).toLowerCase().trim();
    if (!["mobile", "desktop"].includes(device)) {
      return { error: "deviceType must be mobile or desktop" };
    }
    filter.deviceType = device;
  }

  if (query.countryCode) {
    filter.countryCode = normalizeCountryCode(query.countryCode);
  }

  if (query.pagePath) {
    filter.pagePath = normalizePath(String(query.pagePath));
  }

  if (query.referrerDomain) {
    filter.referrerDomain = normalizeReferrer(String(query.referrerDomain));
  }

  return { filter };
}

async function getTelemetryEventsPayload({ siteId, query }) {
  if (!siteId || !String(siteId).trim()) {
    return { status: 400, payload: { error: "siteId is required" } };
  }

  const range = parseTelemetryRange(query);
  if (range.error) return { status: 400, payload: { error: range.error } };

  const { page, limit, skip } = parsePagination(query);
  const { from, to } = range;
  const built = buildEventsFilter({ siteId, query, from, to });
  if (built.error) return { status: 400, payload: { error: built.error } };

  const projection = {
    siteId: 1,
    pagePath: 1,
    referrerDomain: 1,
    deviceType: 1,
    viewportW: 1,
    viewportH: 1,
    countryCode: 1,
    country: 1,
    regionCode: 1,
    region: 1,
    createdAt: 1,
  };

  const [items, total] = await Promise.all([
    TelemetryEvent.find(built.filter, projection)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TelemetryEvent.countDocuments(built.filter),
  ]);

  return {
    status: 200,
    payload: {
      siteId: String(siteId).trim(),
      from,
      to,
      page,
      limit,
      total,
      items,
    },
  };
}

export async function recordPageVisit(req, res) {
  try {
    const body = parsePayloadBody(req.body);
    const errors = [];

    if (typeof body.siteId !== "string" || !body.siteId.trim()) errors.push("siteId");
    if (typeof body.pagePath !== "string") errors.push("pagePath");
    if (typeof body.referrerDomain !== "string") errors.push("referrerDomain");

    const device = typeof body.deviceType === "string" ? body.deviceType.toLowerCase() : "";
    if (device !== "mobile" && device !== "desktop") errors.push("deviceType");

    const viewportW = Number(body.viewportW);
    const viewportH = Number(body.viewportH);
    if (!Number.isFinite(viewportW)) errors.push("viewportW");
    if (!Number.isFinite(viewportH)) errors.push("viewportH");

    if (typeof body.tz !== "string") errors.push("tz");
    if (typeof body.lang !== "string") errors.push("lang");

    const ts = Number(body.ts);
    if (!Number.isFinite(ts)) errors.push("ts");

    if (errors.length) {
      return res.status(400).json({ error: "Invalid telemetry payload", fields: errors });
    }

    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: "Rate limited" });
    }

    const pagePath = clampString(normalizePath(body.pagePath), 512);
    const referrerDomain = clampString(normalizeReferrer(body.referrerDomain), 255);
    const siteId = clampString(body.siteId.trim(), 200);
    const viewportWidth = clampViewport(viewportW);
    const viewportHeight = clampViewport(viewportH);

    const geo = ip ? geoip.lookup(ip) : null;
    const countryCode = normalizeCountryCode(geo?.country);
    const regionCode = normalizeRegionCode(countryCode, geo?.region);
    const country = resolveCountryName(countryCode);
    const region = resolveRegionName(countryCode, regionCode) || regionCode;

    // Privacy: store no raw IPs, cookies, or identifiers; only derived geo + minimal fields.
    await TelemetryEvent.create({
      siteId,
      pagePath,
      referrerDomain,
      deviceType: device,
      viewportW: viewportWidth,
      viewportH: viewportHeight,
      countryCode,
      country,
      regionCode,
      region,
    });

    return res.status(204).end();
  } catch (e) {
    return res.status(500).json({ error: "Telemetry error" });
  }
}

async function getTelemetrySummaryPayload({ siteId, query }) {
  if (!siteId || !String(siteId).trim()) {
    return { status: 400, payload: { error: "siteId is required" } };
  }

  const range = parseTelemetryRange(query);
  if (range.error) return { status: 400, payload: { error: range.error } };
  const { from, to } = range;

  const match = {
    siteId: String(siteId).trim(),
    createdAt: { $gte: from, $lte: to },
  };

  const [summary] = await TelemetryEvent.aggregate([
    { $match: match },
    {
      $facet: {
        total: [{ $count: "count" }],
        byDevice: [
          { $group: { _id: "$deviceType", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $project: { _id: 0, deviceType: "$_id", count: 1 } },
        ],
        topCountries: [
          {
            $addFields: {
              countryCodeNorm: { $ifNull: ["$countryCode", "$country"] },
              countryNorm: { $ifNull: ["$country", "$countryCode"] },
            },
          },
          { $match: { countryCodeNorm: { $nin: [null, ""] } } },
          {
            $group: {
              _id: { countryCode: "$countryCodeNorm", country: "$countryNorm" },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
          { $project: { _id: 0, countryCode: "$_id.countryCode", country: "$_id.country", count: 1 } },
        ],
        topRegions: [
          {
            $addFields: {
              countryCodeNorm: { $ifNull: ["$countryCode", "$country"] },
              regionCodeNorm: { $ifNull: ["$regionCode", "$region"] },
              regionNorm: { $ifNull: ["$region", "$regionCode"] },
            },
          },
          { $match: { regionCodeNorm: { $nin: [null, ""] } } },
          {
            $group: {
              _id: {
                countryCode: "$countryCodeNorm",
                regionCode: "$regionCodeNorm",
                region: "$regionNorm",
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $project: {
              _id: 0,
              countryCode: "$_id.countryCode",
              regionCode: "$_id.regionCode",
              region: "$_id.region",
              count: 1,
            },
          },
        ],
        topViewports: [
          { $match: { viewportW: { $ne: null }, viewportH: { $ne: null } } },
          {
            $group: {
              _id: { viewportW: "$viewportW", viewportH: "$viewportH" },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $project: {
              _id: 0,
              viewportW: "$_id.viewportW",
              viewportH: "$_id.viewportH",
              count: 1,
            },
          },
        ],
      },
    },
  ]);

  return {
    status: 200,
    payload: {
      siteId: String(siteId).trim(),
      from,
      to,
      total: summary?.total?.[0]?.count || 0,
      byDevice: summary?.byDevice || [],
      topCountries: summary?.topCountries || [],
      topRegions: summary?.topRegions || [],
      topViewports: summary?.topViewports || [],
    },
  };
}

export async function telemetryEvents(req, res) {
  try {
    const siteId = typeof req.query.siteId === "string" ? req.query.siteId.trim() : "";
    const result = await getTelemetryEventsPayload({ siteId, query: req.query || {} });
    return res.status(result.status).json(result.payload);
  } catch (e) {
    return res.status(500).json({ error: "Telemetry events error" });
  }
}

export async function telemetryEventsByClient(req, res) {
  try {
    const client = await findClientByIdOrSlug(req.params.id);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const result = await getTelemetryEventsPayload({
      siteId: client.siteId,
      query: req.query || {},
    });

    if (result.status !== 200) {
      return res.status(result.status).json(result.payload);
    }
    return res.json({
      clientId: String(client._id),
      clientSlug: client.slug,
      ...result.payload,
    });
  } catch (e) {
    return res.status(500).json({ error: "Client telemetry events error" });
  }
}

export async function telemetrySummary(req, res) {
  try {
    const siteId = typeof req.query.siteId === "string" ? req.query.siteId.trim() : "";
    const result = await getTelemetrySummaryPayload({ siteId, query: req.query || {} });
    return res.status(result.status).json(result.payload);
  } catch (e) {
    return res.status(500).json({ error: "Telemetry summary error" });
  }
}

export async function telemetrySummaryByClient(req, res) {
  try {
    const client = await findClientByIdOrSlug(req.params.id);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const result = await getTelemetrySummaryPayload({
      siteId: client.siteId,
      query: req.query || {},
    });
    if (result.status !== 200) {
      return res.status(result.status).json(result.payload);
    }

    return res.json({
      clientId: String(client._id),
      clientSlug: client.slug,
      ...result.payload,
    });
  } catch (e) {
    return res.status(500).json({ error: "Client telemetry summary error" });
  }
}
