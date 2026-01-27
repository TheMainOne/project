import mongoose from "mongoose";
import NotificationDestination from "../models/NotificationDestination.js";

function parseBoolean(v, fallback = undefined) {
  if (v === undefined) return fallback;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase().trim();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

function resolveClientId(req, { required = false } = {}) {
  const raw =
    req.body?.clientId ||
    req.query?.clientId ||
    req.header("x-aiw-client") ||
    null;

  if (!raw) {
    if (required) {
      return { error: "clientId is required" };
    }
    return { clientId: null };
  }

  if (!mongoose.isValidObjectId(raw)) {
    return { error: "clientId must be a valid ObjectId" };
  }

  return { clientId: new mongoose.Types.ObjectId(raw) };
}

function normalizeChatId(raw) {
  const chatId = raw == null ? "" : String(raw).trim();
  return chatId;
}

// POST /api/notification-destinations
export async function createNotificationDestination(req, res, next) {
  try {
    const { error, clientId } = resolveClientId(req, { required: true });
    if (error) return res.status(400).json({ error });

    const type = String(req.body?.type || "telegram").trim();
    if (type !== "telegram") {
      return res.status(400).json({ error: "Only telegram destinations are supported" });
    }

    const chatId = normalizeChatId(req.body?.chatId ?? req.body?.config?.chatId);
    if (!chatId) {
      return res.status(400).json({ error: "chatId is required" });
    }

    const siteId = req.body?.siteId ?? null;
    const enabled = parseBoolean(req.body?.enabled, true);
    const notes = req.body?.notes ?? "";

    const doc = await NotificationDestination.create({
      type,
      clientId,
      siteId,
      enabled: enabled !== undefined ? enabled : true,
      config: { chatId },
      notes,
    });

    return res.status(201).json({ ok: true, destination: doc });
  } catch (err) {
    return next(err);
  }
}

// GET /api/notification-destinations
export async function listNotificationDestinations(req, res, next) {
  try {
    const { error, clientId } = resolveClientId(req, { required: false });
    if (error) return res.status(400).json({ error });

    const filter = {};
    if (clientId) filter.clientId = clientId;

    const siteId = req.query?.siteId ?? null;
    if (siteId) filter.siteId = siteId;

    const type = req.query?.type;
    if (type) filter.type = String(type).trim();

    const enabled = parseBoolean(req.query?.enabled, undefined);
    if (enabled !== undefined) filter.enabled = enabled;

    const page = Math.max(1, Number(req.query?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 50)));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      NotificationDestination.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      NotificationDestination.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      page,
      limit,
      total,
      items,
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/notification-destinations/:id
export async function getNotificationDestination(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid destination id" });
    }

    const doc = await NotificationDestination.findById(id).lean();
    if (!doc) return res.status(404).json({ error: "Destination not found" });

    return res.json({ ok: true, destination: doc });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/notification-destinations/:id
export async function updateNotificationDestination(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid destination id" });
    }

    const update = {};

    if (req.body?.type !== undefined) {
      const type = String(req.body.type).trim();
      if (type !== "telegram") {
        return res.status(400).json({ error: "Only telegram destinations are supported" });
      }
      update.type = type;
    }

    if (req.body?.clientId !== undefined) {
      const { error, clientId } = resolveClientId(req, { required: true });
      if (error) return res.status(400).json({ error });
      update.clientId = clientId;
    }

    if (req.body?.siteId !== undefined) {
      update.siteId = req.body.siteId || null;
    }

    if (req.body?.enabled !== undefined) {
      const enabled = parseBoolean(req.body.enabled, undefined);
      if (enabled === undefined) {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }
      update.enabled = enabled;
    }

    if (req.body?.notes !== undefined) {
      update.notes = String(req.body.notes || "");
    }

    const chatIdRaw = req.body?.chatId ?? req.body?.config?.chatId;
    if (chatIdRaw !== undefined) {
      const chatId = normalizeChatId(chatIdRaw);
      if (!chatId) return res.status(400).json({ error: "chatId cannot be empty" });
      update["config.chatId"] = chatId;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const doc = await NotificationDestination.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).lean();

    if (!doc) return res.status(404).json({ error: "Destination not found" });

    return res.json({ ok: true, destination: doc });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/notification-destinations/:id
export async function deleteNotificationDestination(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid destination id" });
    }

    const result = await NotificationDestination.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Destination not found" });
    }

    return res.json({ ok: true, message: "Destination deleted" });
  } catch (err) {
    return next(err);
  }
}

