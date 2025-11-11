//aiwStatsController.js
import mongoose from "mongoose";
import AiwSession from "../models/AiwSession.js";
import AiwMessage from "../models/AiwMessage.js";
import AiwGap from "../models/AiwGap.js";

/* =========================
   Helpers (общие для всех)
   ========================= */
function parseSites(req) {
  const sitesParam = req.query.siteId || req.query.sites;
  const siteIds = sitesParam
    ? String(sitesParam).split(",").map(s => s.trim()).filter(Boolean)
    : null;
  return siteIds;
}

function parseSince(req) {
  const days = Math.max(1, Number(req.query.days || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { days, since };
}

function buildMatchBase({ since, siteIds }) {
  const m = {};
  if (since) m.startedAt = { $gte: since }; // для AiwSession
  if (siteIds) m.siteId = { $in: siteIds };
  return m;
}

// для $dateTrunc/$dateToString
function resolveTz(req) {
  return req.query.tz || "UTC";
}

function resolveBucket(req, def = "day") {
  const v = (req.query.bucket || def).toLowerCase();
  return ["hour", "day", "week"].includes(v) ? v : def;
}

function pagination(req, { defLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit || defLimit)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/* =========================
   1) СЕССИИ
   ========================= */

// GET /api/aiw/sessions/active/count?days=30&uniqueBy=visitor&siteId=mysite.com::default
//     /api/aiw/sessions/active/count?sites=a.com::default,b.com::shop
export async function countActiveSessions(req, res) {
  try {
    const days = Math.max(1, Number(req.query.days || 30));
    const uniqueBy = (req.query.uniqueBy === "session") ? "sessionId" : "visitorId";

    const sitesParam = req.query.siteId || req.query.sites;
    const siteIds = sitesParam
      ? String(sitesParam).split(",").map(s => s.trim()).filter(Boolean)
      : null;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const match = { startedAt: { $gte: since } };
    if (siteIds) match.siteId = { $in: siteIds };

    // group по visitorId (или sessionId), затем считаем количество уникальных
    const pipeline = [
      { $match: match },
      { $group: { _id: `$${uniqueBy}` } },
      { $group: { _id: null, count: { $sum: 1 } } },
    ];

    const agg = await AiwSession.aggregate(pipeline);
    const total = agg?.[0]?.count || 0;

    return res.json({
      total,
      days,
      uniqueBy,
      scope: siteIds ? { sites: siteIds } : { sites: "all" },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}


// GET /api/aiw/sessions/count?days=30&siteId=...
export async function countSessionsRaw(req, res) {
  try {
    const { days, since } = parseSince(req);
    const siteIds = parseSites(req);

    const match = { startedAt: { $gte: since } };
    if (siteIds) match.siteId = { $in: siteIds };

    const total = await AiwSession.countDocuments(match);

    return res.json({
      total,
      days,
      scope: siteIds ? { sites: siteIds } : { sites: "all" },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// GET /api/aiw/sessions/timeseries?bucket=day&days=30&siteId=...
export async function sessionsTimeseries(req, res) {
  try {
    const { days, since } = parseSince(req);
    const siteIds = parseSites(req);
    const tz = resolveTz(req);
    const bucket = resolveBucket(req, "day");

    const match = { startedAt: { $gte: since } };
    if (siteIds) match.siteId = { $in: siteIds };

    // map bucket -> dateTrunc unit
    const unit = bucket; // "hour" | "day" | "week"

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          bucketStart: {
            $dateTrunc: { date: "$startedAt", unit, timezone: tz }
          }
        }
      },
      { $group: { _id: "$bucketStart", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          ts: "$_id",
          count: 1
        }
      }
    ];

    const rows = await AiwSession.aggregate(pipeline);
    return res.json({ bucket, days, tz, rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// GET /api/aiw/sessions/list?days=30&siteId=...&page=1&limit=20
export async function sessionsList(req, res) {
  try {
    const { days, since } = parseSince(req);
    const siteIds = parseSites(req);
    const { page, limit, skip } = pagination(req);

    const match = { startedAt: { $gte: since } };
    if (siteIds) match.siteId = { $in: siteIds };

    const [items, total] = await Promise.all([
      AiwSession
        .find(match, {
          _id: 0,
          siteId: 1,
          sessionId: 1,
          visitorId: 1,
          pageUrl: 1,
          referrer: 1,
          startedAt: 1,
          endedAt: 1,
          messagesCount: 1,
          userMessages: 1,
          assistantMessages: 1,
          topics: 1,
          lastUserQuestion: 1
        })
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AiwSession.countDocuments(match)
    ]);

    return res.json({
      page, limit, total,
      days,
      scope: siteIds ? { sites: siteIds } : { sites: "all" },
      items
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/* =========================
   2) СООБЩЕНИЯ
   ========================= */

// GET /api/aiw/messages/summary?days=30&siteId=...
export async function messagesSummary(req, res) {
  try {
    const { days, since } = parseSince(req);
    const siteIds = parseSites(req);

    const match = { createdAt: { $gte: since } };
    if (siteIds) match.siteId = { $in: siteIds };

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: 1 },
          userMessages: { $sum: { $cond: [{ $eq: ["$role", "user"] }, 1, 0] } },
          assistantMessages: { $sum: { $cond: [{ $eq: ["$role", "assistant"] }, 1, 0] } },
          avgLatencyMs: { $avg: "$latencyMs" },
          minLatencyMs: { $min: "$latencyMs" },
          maxLatencyMs: { $max: "$latencyMs" },
          totalPromptTokens: { $sum: "$promptTokens" },
          totalCompletionTokens: { $sum: "$completionTokens" }
        }
      }
    ];

    const [agg, sessionsCount] = await Promise.all([
      AiwMessage.aggregate(pipeline),
      AiwSession.countDocuments({ startedAt: { $gte: since }, ...(siteIds ? { siteId: { $in: siteIds } } : {}) })
    ]);

    const row = agg?.[0] || {};
    const avgMsgsPerSession =
      sessionsCount > 0 ? (row.totalMessages || 0) / sessionsCount : 0;

    return res.json({
      days,
      scope: siteIds ? { sites: siteIds } : { sites: "all" },
      totals: {
        totalMessages: row.totalMessages || 0,
        userMessages: row.userMessages || 0,
        assistantMessages: row.assistantMessages || 0,
        avgMsgsPerSession: Number(avgMsgsPerSession.toFixed(2)),
      },
      tokens: {
        prompt: row.totalPromptTokens || 0,
        completion: row.totalCompletionTokens || 0
      },
      latency: {
        avgMs: row.avgLatencyMs ?? null,
        minMs: row.minLatencyMs ?? null,
        maxMs: row.maxLatencyMs ?? null
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// GET /api/aiw/messages/timeseries?bucket=day&days=30&siteId=...
export async function messagesTimeseries(req, res) {
  try {
    const { days, since } = parseSince(req);
    const siteIds = parseSites(req);
    const tz = resolveTz(req);
    const bucket = resolveBucket(req, "day");
    const unit = bucket;

    const match = { createdAt: { $gte: since } };
    if (siteIds) match.siteId = { $in: siteIds };

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          bucketStart: {
            $dateTrunc: { date: "$createdAt", unit, timezone: tz }
          }
        }
      },
      {
        $group: {
          _id: { ts: "$bucketStart" },
          total: { $sum: 1 },
          users: { $sum: { $cond: [{ $eq: ["$role", "user"] }, 1, 0] } },
          assistants: { $sum: { $cond: [{ $eq: ["$role", "assistant"] }, 1, 0] } }
        }
      },
      { $sort: { "_id.ts": 1 } },
      { $project: { _id: 0, ts: "$_id.ts", total: 1, users: 1, assistants: 1 } }
    ];

    const rows = await AiwMessage.aggregate(pipeline);
    return res.json({ bucket, days, tz, rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// GET /api/aiw/messages/top?days=30&siteId=...&limit=20
// Топ одинаковых пользовательских фраз (простая частота по content)
export async function topUserMessages(req, res) {
  try {
    const { days, since } = parseSince(req);
    const siteIds = parseSites(req);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

    const match = { createdAt: { $gte: since }, role: "user" };
    if (siteIds) match.siteId = { $in: siteIds };

    const pipeline = [
      { $match: match },
      { $group: { _id: "$content", count: { $sum: 1 }, lastAt: { $max: "$createdAt" } } },
      { $sort: { count: -1, lastAt: -1 } },
      { $limit: limit },
      { $project: { _id: 0, content: "$_id", count: 1, lastAt: 1 } }
    ];

    const rows = await AiwMessage.aggregate(pipeline);
    return res.json({ days, total: rows.length, items: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/* =========================
   3) ГЭПЫ (AiwGap)
   ========================= */

// GET /api/aiw/gaps/summary?days=30&siteId=...&clientId=...
export async function gapsSummary(req, res) {
  try {
    const { days, since } = parseSince(req);
    const siteIds = parseSites(req);
    const clientId = req.query.clientId || null;

    const match = { createdAt: { $gte: since } };
    if (siteIds) match.siteId = { $in: siteIds };
    if (clientId) match.clientId = clientId;

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unresolved: { $sum: { $cond: [{ $or: [{ $eq: ["$resolvedAt", null] }, { $not: ["$resolvedAt"] } ] }, 1, 0] } },
          byPhase: {
            $push: "$phase"
          }
        }
      },
      {
        $project: {
          total: 1,
          unresolved: 1,
          resolved: { $subtract: ["$total", "$unresolved"] },
          // агрегируем по фазам
        }
      }
    ];

    const [summary] = await AiwGap.aggregate(pipeline);

    // отдельный срез по фазам
    const byPhaseAgg = await AiwGap.aggregate([
      { $match: match },
      {
        $group: {
          _id: { phase: "$phase" },
          count: { $sum: 1 },
          unresolved: { $sum: { $cond: [{ $or: [{ $eq: ["$resolvedAt", null] }, { $not: ["$resolvedAt"] }] }, 1, 0] } }
        }
      },
      { $project: { _id: 0, phase: "$_id.phase", count: 1, unresolved: 1 } },
      { $sort: { count: -1 } }
    ]);

    return res.json({
      days,
      scope: siteIds ? { sites: siteIds } : { sites: "all" },
      clientId: clientId || undefined,
      totals: {
        total: summary?.total || 0,
        unresolved: summary?.unresolved || 0,
        resolved: summary ? (summary.total - summary.unresolved) : 0
      },
      byPhase: byPhaseAgg
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// GET /api/aiw/gaps/timeseries?bucket=day&days=30&siteId=...&clientId=...
export async function gapsTimeseries(req, res) {
  try {
    const { days, since } = parseSince(req);
    const siteIds = parseSites(req);
    const clientId = req.query.clientId || null;
    const tz = resolveTz(req);
    const bucket = resolveBucket(req, "day");
    const unit = bucket;

    const match = { createdAt: { $gte: since } };
    if (siteIds) match.siteId = { $in: siteIds };
    if (clientId) match.clientId = clientId;

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          bucketStart: { $dateTrunc: { date: "$createdAt", unit, timezone: tz } },
          isUnresolved: { $cond: [{ $or: [{ $eq: ["$resolvedAt", null] }, { $not: ["$resolvedAt"] }] }, 1, 0] }
        }
      },
      {
        $group: {
          _id: "$bucketStart",
          total: { $sum: 1 },
          unresolved: { $sum: "$isUnresolved" }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, ts: "$_id", total: 1, unresolved: 1, resolved: { $subtract: ["$total", "$unresolved"] } } }
    ];

    const rows = await AiwGap.aggregate(pipeline);
    return res.json({ bucket, days, tz, rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// GET /api/aiw/gaps/top-unresolved?days=30&siteId=...&clientId=...&limit=20
export async function topUnresolvedGaps(req, res) {
  try {
    const { days, since } = parseSince(req);
    const siteIds = parseSites(req);
    const clientId = req.query.clientId || null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

    const match = {
      createdAt: { $gte: since },
      $or: [{ resolvedAt: { $exists: false } }, { resolvedAt: null }]
    };
    if (siteIds) match.siteId = { $in: siteIds };
    if (clientId) match.clientId = clientId;

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: "$normalizedQuestion",
          question: { $first: "$question" },
          count: { $sum: 1 },
          lastSeenAt: { $max: "$lastSeenAt" },
          sampleCitations: { $first: "$citations" },
          phase: { $first: "$phase" }
        }
      },
      { $sort: { count: -1, lastSeenAt: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          normalizedQuestion: "$_id",
          question: 1,
          count: 1,
          lastSeenAt: 1,
          phase: 1,
          citations: "$sampleCitations"
        }
      }
    ];

    const rows = await AiwGap.aggregate(pipeline);
    return res.json({ days, total: rows.length, items: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
