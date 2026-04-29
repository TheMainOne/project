import express from "express";
import { requireAuth } from "../../middlewares/auth.js";
import ComplianceCase from "../sf-compliance/models/ComplianceCase.js";
import Supplier from "../sf-compliance/models/Supplier.js";
import SupplierEvidence from "../sf-compliance/models/SupplierEvidence.js";
import ComplianceAssertion from "../sf-compliance/models/ComplianceAssertion.js";
import SupplierOutreach from "../sf-compliance/models/SupplierOutreach.js";
import Regulation from "../sf-compliance/models/Regulation.js";

const router = express.Router();

router.use(requireAuth);

// GET /api/compliance-dashboard/stats
router.get("/stats", async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [caseStats, supplierCount, evidenceStats, assertionStats, outreachStats] =
      await Promise.all([
        ComplianceCase.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        Supplier.countDocuments(),
        SupplierEvidence.aggregate([
          {
            $facet: {
              byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
              expiringSoon: [
                {
                  $match: {
                    status: "active",
                    validTo: { $gte: now, $lte: thirtyDaysFromNow },
                  },
                },
                { $count: "count" },
              ],
              total: [{ $count: "count" }],
            },
          },
        ]),
        ComplianceAssertion.aggregate([
          { $group: { _id: "$assertionType", count: { $sum: 1 } } },
        ]),
        SupplierOutreach.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
      ]);

    const casesByStatus = {};
    let totalCases = 0;
    for (const s of caseStats) {
      casesByStatus[s._id] = s.count;
      totalCases += s.count;
    }

    const evidenceFacet = evidenceStats[0];
    const evidenceByStatus = {};
    for (const s of evidenceFacet.byStatus) evidenceByStatus[s._id] = s.count;
    const evidenceTotal = evidenceFacet.total[0]?.count ?? 0;
    const evidenceExpiringSoon = evidenceFacet.expiringSoon[0]?.count ?? 0;

    const assertionsByType = {};
    let totalAssertions = 0;
    for (const s of assertionStats) {
      assertionsByType[s._id] = s.count;
      totalAssertions += s.count;
    }

    const outreachByStatus = {};
    let totalOutreach = 0;
    for (const s of outreachStats) {
      outreachByStatus[s._id] = s.count;
      totalOutreach += s.count;
    }

    res.json({
      cases: {
        total: totalCases,
        byStatus: {
          new: casesByStatus.new ?? 0,
          in_progress: casesByStatus.in_progress ?? 0,
          pending_supplier: casesByStatus.pending_supplier ?? 0,
          resolved: casesByStatus.resolved ?? 0,
          closed: casesByStatus.closed ?? 0,
        },
      },
      suppliers: { total: supplierCount },
      evidence: {
        total: evidenceTotal,
        active: evidenceByStatus.active ?? 0,
        expired: evidenceByStatus.expired ?? 0,
        superseded: evidenceByStatus.superseded ?? 0,
        expiringSoon: evidenceExpiringSoon,
      },
      assertions: {
        total: totalAssertions,
        byType: assertionsByType,
      },
      outreach: {
        total: totalOutreach,
        overdue: outreachByStatus.overdue ?? 0,
        awaiting: outreachByStatus.awaiting ?? 0,
        sent: outreachByStatus.sent ?? 0,
        responded: outreachByStatus.responded ?? 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance-dashboard/cases
router.get("/cases", async (req, res) => {
  try {
    const { status, dateFrom, dateTo, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [cases, total] = await Promise.all([
      ComplianceCase.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ComplianceCase.countDocuments(filter),
    ]);

    res.json({
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      cases,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance-dashboard/suppliers
router.get("/suppliers", async (req, res) => {
  try {
    const { q, page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const matchStage = q
      ? {
          $match: {
            $or: [
              { supplierName: { $regex: q, $options: "i" } },
              { supplierCode: { $regex: q, $options: "i" } },
            ],
          },
        }
      : { $match: {} };

    const [result] = await Supplier.aggregate([
      matchStage,
      {
        $facet: {
          total: [{ $count: "count" }],
          suppliers: [
            { $sort: { supplierName: 1 } },
            { $skip: skip },
            { $limit: limitNum },
            {
              $lookup: {
                from: "complianceassertions",
                localField: "_id",
                foreignField: "supplierId",
                as: "assertions",
              },
            },
            {
              $lookup: {
                from: "supplieroutreaches",
                let: { sid: "$_id" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$supplierId", "$$sid"] } } },
                  { $sort: { sentAt: -1 } },
                  { $limit: 1 },
                  { $project: { status: 1, sentAt: 1, _id: 0 } },
                ],
                as: "latestOutreachArr",
              },
            },
            {
              $addFields: {
                assertionCounts: {
                  total: { $size: "$assertions" },
                  active: {
                    $size: {
                      $filter: {
                        input: "$assertions",
                        cond: { $eq: ["$$this.status", "active"] },
                      },
                    },
                  },
                  expired: {
                    $size: {
                      $filter: {
                        input: "$assertions",
                        cond: { $eq: ["$$this.status", "expired"] },
                      },
                    },
                  },
                },
                latestOutreach: { $arrayElemAt: ["$latestOutreachArr", 0] },
                contactCount: { $size: "$contacts" },
              },
            },
            {
              $project: {
                assertions: 0,
                latestOutreachArr: 0,
              },
            },
          ],
        },
      },
    ]);

    res.json({
      total: result.total[0]?.count ?? 0,
      page: pageNum,
      limit: limitNum,
      suppliers: result.suppliers,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance-dashboard/evidence
router.get("/evidence", async (req, res) => {
  try {
    const {
      supplierCode,
      regulation,
      status,
      expiringDays,
      page = 1,
      limit = 25,
    } = req.query;

    const filter = {};
    if (supplierCode) filter.supplierCode = { $regex: supplierCode, $options: "i" };
    if (regulation) filter.regulation = { $regex: regulation, $options: "i" };
    if (status && status !== "all") {
      filter.status = status;
    } else if (expiringDays) {
      const days = parseInt(expiringDays);
      const now = new Date();
      const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      filter.status = "active";
      filter.validTo = { $gte: now, $lte: cutoff };
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [evidence, total] = await Promise.all([
      SupplierEvidence.find(filter)
        .sort({ validTo: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SupplierEvidence.countDocuments(filter),
    ]);

    res.json({
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      evidence,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance-dashboard/regulations
router.get("/regulations", async (req, res) => {
  try {
    const regulations = await Regulation.find({ isActive: true })
      .select("code name category")
      .sort({ code: 1 })
      .lean();
    res.json({ regulations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance-dashboard/outreach
router.get("/outreach", async (req, res) => {
  try {
    const { status, supplierId, page = 1, limit = 25 } = req.query;

    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (supplierId) filter.supplierId = supplierId;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [records, total] = await Promise.all([
      SupplierOutreach.find(filter)
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select(
          "supplierId supplierName subject method status sentAt nextFollowUpAt followUpCount respondedAt regulationTags"
        )
        .lean(),
      SupplierOutreach.countDocuments(filter),
    ]);

    res.json({
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      records,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
