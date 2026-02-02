import mongoose from "mongoose";
import Lead from "../models/Lead.js";

const LEAD_STATUSES = ["new", "processed"];

function isValidObjectId(value) {
  return mongoose.isValidObjectId(value);
}

function parseDate(value, fallback = null) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parsePagination(query) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function normalizeStringOrNull(value, { maxLen = 255 } = {}) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLen);
}

function applyContactUpdates(payload = {}, set = {}) {
  const contact = payload?.answers?.contact || payload?.contact;
  if (!contact || typeof contact !== "object") return false;

  let touched = false;
  const map = [
    ["name", 120],
    ["email", 200],
    ["phone", 80],
    ["handle", 120],
    ["lang", 20],
  ];

  for (const [field, maxLen] of map) {
    if (!(field in contact)) continue;
    touched = true;
    const value = normalizeStringOrNull(contact[field], { maxLen });
    set[`answers.contact.${field}`] = value === undefined ? null : value;
    if (["name", "email", "phone", "handle"].includes(field)) {
      set[`meta.lead.${field}`] = value === undefined ? null : value;
    }
  }

  if ("confidence" in contact) {
    touched = true;
    const confidenceRaw = Number(contact.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : null;
    set["meta.lead.confidence"] = confidence;
  }

  if ("contact" in contact) {
    touched = true;
    set["meta.lead.contact"] = Boolean(contact.contact);
  }

  const hasContactValue = ["name", "email", "phone", "handle"].some((f) => {
    const v = set[`answers.contact.${f}`];
    return typeof v === "string" && v.length > 0;
  });
  if (hasContactValue) {
    set["meta.lead.contact"] = true;
  }

  return touched;
}

function sanitizeLead(doc) {
  if (!doc) return doc;
  const lead = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  if (lead.clientId && typeof lead.clientId === "object") {
    lead.clientId = String(lead.clientId);
  }
  return lead;
}

// GET /api/leads
export async function listLeads(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const {
      siteId,
      sessionId,
      visitorId,
      status,
      clientId,
      q,
      from,
      to,
    } = req.query;

    const filter = {};

    if (siteId) filter.siteId = String(siteId).trim();
    if (sessionId) filter.sessionId = String(sessionId).trim();
    if (visitorId) filter.visitorId = String(visitorId).trim();

    if (status) {
      const normalizedStatus = String(status).trim();
      if (!LEAD_STATUSES.includes(normalizedStatus)) {
        return res
          .status(400)
          .json({ error: `status must be one of: ${LEAD_STATUSES.join(", ")}` });
      }
      filter.status = normalizedStatus;
    }

    if (clientId) {
      if (!isValidObjectId(clientId)) {
        return res.status(400).json({ error: "clientId must be a valid ObjectId" });
      }
      filter.clientId = new mongoose.Types.ObjectId(clientId);
    }

    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (from && !fromDate) return res.status(400).json({ error: "Invalid from date" });
    if (to && !toDate) return res.status(400).json({ error: "Invalid to date" });
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ error: "from must be <= to" });
    }
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = fromDate;
      if (toDate) filter.createdAt.$lte = toDate;
    }

    const qNorm = typeof q === "string" ? q.trim() : "";
    if (qNorm) {
      const rx = new RegExp(qNorm, "i");
      filter.$or = [
        { siteId: rx },
        { sessionId: rx },
        { visitorId: rx },
        { "answers.contact.name": rx },
        { "answers.contact.email": rx },
        { "answers.contact.phone": rx },
        { "answers.contact.handle": rx },
        { "meta.lead.name": rx },
        { "meta.lead.email": rx },
        { "meta.lead.phone": rx },
        { "meta.lead.handle": rx },
      ];
    }

    const [items, total, byStatus] = await Promise.all([
      Lead.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Lead.countDocuments(filter),
      Lead.aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $project: { _id: 0, status: "$_id", count: 1 } },
      ]),
    ]);

    return res.json({
      page,
      limit,
      total,
      byStatus,
      items: items.map(sanitizeLead),
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/leads/:id
export async function getLeadById(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid lead id" });
    }

    const lead = await Lead.findById(id).lean();
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    return res.json({ lead: sanitizeLead(lead) });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/leads/:id
export async function updateLead(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid lead id" });
    }

    const body = req.body || {};
    const set = {};

    if ("status" in body) {
      const nextStatus = String(body.status || "").trim();
      if (!LEAD_STATUSES.includes(nextStatus)) {
        return res
          .status(400)
          .json({ error: `status must be one of: ${LEAD_STATUSES.join(", ")}` });
      }
      set.status = nextStatus;
    }

    if ("clientId" in body) {
      if (body.clientId === null || body.clientId === "") {
        set.clientId = null;
      } else if (!isValidObjectId(body.clientId)) {
        return res.status(400).json({ error: "clientId must be a valid ObjectId" });
      } else {
        set.clientId = new mongoose.Types.ObjectId(body.clientId);
      }
    }

    if ("meta" in body && body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)) {
      if ("lead" in body.meta && body.meta.lead && typeof body.meta.lead === "object") {
        const leadMeta = body.meta.lead;

        if ("contact" in leadMeta) set["meta.lead.contact"] = Boolean(leadMeta.contact);
        if ("confidence" in leadMeta) {
          const confidenceRaw = Number(leadMeta.confidence);
          set["meta.lead.confidence"] = Number.isFinite(confidenceRaw)
            ? Math.max(0, Math.min(1, confidenceRaw))
            : null;
        }

        const fields = [
          ["name", 120],
          ["email", 200],
          ["phone", 80],
          ["handle", 120],
        ];
        for (const [field, maxLen] of fields) {
          if (!(field in leadMeta)) continue;
          const value = normalizeStringOrNull(leadMeta[field], { maxLen });
          set[`meta.lead.${field}`] = value === undefined ? null : value;
          set[`answers.contact.${field}`] = value === undefined ? null : value;
        }
      }
    }

    applyContactUpdates(body, set);

    if (Object.keys(set).length === 0) {
      return res.status(400).json({
        error:
          "No valid fields to update. Allowed: status, clientId, answers.contact.*, meta.lead.*",
      });
    }

    const lead = await Lead.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true }).lean();
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    return res.json({ ok: true, lead: sanitizeLead(lead) });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/leads/:id
export async function deleteLead(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid lead id" });
    }

    const result = await Lead.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    return res.json({ ok: true, message: "Lead deleted" });
  } catch (err) {
    return next(err);
  }
}
