import AiwSession from "../models/AiwSession.js";

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
