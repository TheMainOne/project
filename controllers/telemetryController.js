import geoip from "geoip-lite";
import TelemetryEvent from "../models/TelemetryEvent.js";

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimits = new Map();

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

    const geo = ip ? geoip.lookup(ip) : null;
    const country = geo?.country || null;
    const region = geo?.region || null;

    // Privacy: store no raw IPs, cookies, or identifiers; only derived geo + minimal fields.
    await TelemetryEvent.create({
      siteId,
      pagePath,
      referrerDomain,
      deviceType: device,
      country,
      region,
    });

    return res.status(204).end();
  } catch (e) {
    return res.status(500).json({ error: "Telemetry error" });
  }
}

export async function telemetrySummary(req, res) {
  try {
    const siteId = typeof req.query.siteId === "string" ? req.query.siteId.trim() : "";
    if (!siteId) {
      return res.status(400).json({ error: "siteId is required" });
    }

    const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const from = parseDate(req.query.from, defaultFrom);
    const to = parseDate(req.query.to, new Date());

    if (!from || !to) {
      return res.status(400).json({ error: "Invalid from/to date" });
    }
    if (from > to) {
      return res.status(400).json({ error: "from must be <= to" });
    }

    const match = {
      siteId,
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
            { $match: { country: { $nin: [null, ""] } } },
            { $group: { _id: "$country", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $project: { _id: 0, country: "$_id", count: 1 } },
          ],
          topRegions: [
            { $match: { region: { $nin: [null, ""] } } },
            { $group: { _id: "$region", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $project: { _id: 0, region: "$_id", count: 1 } },
          ],
        },
      },
    ]);

    return res.json({
      siteId,
      from,
      to,
      total: summary?.total?.[0]?.count || 0,
      byDevice: summary?.byDevice || [],
      topCountries: summary?.topCountries || [],
      topRegions: summary?.topRegions || [],
    });
  } catch (e) {
    return res.status(500).json({ error: "Telemetry summary error" });
  }
}
