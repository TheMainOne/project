import mongoose from "mongoose";
import Client from "../models/Client.js";
import WidgetDemoScript from "../models/WidgetDemoScript.js";
import { invalidateWidgetDemoScriptCache } from "../services/widgetDemoScript/cache.js";

function resolveClientFilter(idOrSlug) {
  if (!idOrSlug) return null;
  if (mongoose.isValidObjectId(idOrSlug)) {
    return { _id: new mongoose.Types.ObjectId(idOrSlug) };
  }
  return { slug: String(idOrSlug).trim().toLowerCase() };
}

async function resolveClientLite(idOrSlug) {
  const filter = resolveClientFilter(idOrSlug);
  if (!filter) return null;
  return Client.findOne(filter)
    .select("_id slug name siteId")
    .lean();
}

function toBool(value, fallback = undefined) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return fallback;
  }
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(v)) return true;
    if (["false", "0", "no", "off"].includes(v)) return false;
  }
  return fallback;
}

function toNonNegativeInt(value, fallback = NaN) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseMessages(raw) {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { error: "messages must be a valid JSON array" };
    }
  }

  if (!Array.isArray(value)) {
    return { error: "messages must be an array" };
  }

  const out = [];

  for (let i = 0; i < value.length; i += 1) {
    const item = value[i] || {};
    const role = String(item.role || "").trim();
    if (role !== "user" && role !== "assistant") {
      return { error: `messages[${i}].role must be 'user' or 'assistant'` };
    }

    const text = String(item.text || "").trim();
    if (!text) {
      return { error: `messages[${i}].text is required` };
    }

    const typingMs = item.typingMs === undefined
      ? 800
      : toNonNegativeInt(item.typingMs, NaN);
    if (!Number.isFinite(typingMs)) {
      return { error: `messages[${i}].typingMs must be a non-negative number` };
    }

    const delayAfterMs = item.delayAfterMs === undefined
      ? 1200
      : toNonNegativeInt(item.delayAfterMs, NaN);
    if (!Number.isFinite(delayAfterMs)) {
      return { error: `messages[${i}].delayAfterMs must be a non-negative number` };
    }

    out.push({ role, text, typingMs, delayAfterMs });
  }

  return { value: out };
}

function toScriptDto(doc) {
  if (!doc) return null;
  return {
    siteId: doc.siteId,
    enabled: doc.enabled === true,
    lang: "en",
    loop: doc.loop !== false,
    startDelayMs: toNonNegativeInt(doc.startDelayMs, 1200),
    messages: Array.isArray(doc.messages)
      ? doc.messages.map((m) => ({
        role: m.role,
        text: m.text,
        typingMs: toNonNegativeInt(m.typingMs, 800),
        delayAfterMs: toNonNegativeInt(m.delayAfterMs, 1200),
      }))
      : [],
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

function emptyScript(siteId) {
  return {
    siteId,
    enabled: false,
    lang: "en",
    loop: true,
    startDelayMs: 1200,
    messages: [],
    createdAt: null,
    updatedAt: null,
  };
}

export async function listWidgetDemoScripts(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
    const scope = req.accessScope;
    const enabled = toBool(req.query.enabled, undefined);
    const q = String(req.query.q || "").trim();
    const siteId = String(req.query.siteId || "").trim();

    const filter = {};
    const and = [];

    if (scope && !scope.isSuperadmin) {
      if (!Array.isArray(scope.allowedSiteIds) || !scope.allowedSiteIds.length) {
        return res.json({ ok: true, total: 0, page, limit, scripts: [] });
      }
      and.push({ siteId: { $in: scope.allowedSiteIds } });
    }

    if (siteId) and.push({ siteId });
    if (typeof enabled === "boolean") and.push({ enabled });
    if (q) and.push({ siteId: { $regex: escapeRegex(q), $options: "i" } });

    if (and.length === 1) Object.assign(filter, and[0]);
    if (and.length > 1) filter.$and = and;

    const [docs, total] = await Promise.all([
      WidgetDemoScript.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WidgetDemoScript.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      total,
      page,
      limit,
      scripts: docs.map(toScriptDto),
    });
  } catch (error) {
    console.error("listWidgetDemoScripts", error);
    return res.status(500).json({ ok: false, error: "failed_to_list_demo_scripts" });
  }
}

export async function getWidgetDemoScript(req, res) {
  try {
    const { idOrSlug } = req.params;
    const client = await resolveClientLite(idOrSlug);
    if (!client) return res.status(404).json({ ok: false, error: "Client not found" });

    const doc = await WidgetDemoScript.findOne({ siteId: client.siteId }).lean();
    return res.json({
      ok: true,
      client: {
        id: client._id,
        slug: client.slug,
        name: client.name,
        siteId: client.siteId,
      },
      script: doc ? toScriptDto(doc) : emptyScript(client.siteId),
    });
  } catch (error) {
    console.error("getWidgetDemoScript", error);
    return res.status(500).json({ ok: false, error: "failed_to_get_demo_script" });
  }
}

export async function upsertWidgetDemoScript(req, res) {
  try {
    const { idOrSlug } = req.params;
    const client = await resolveClientLite(idOrSlug);
    if (!client) return res.status(404).json({ ok: false, error: "Client not found" });
    if (!client.siteId) {
      return res.status(400).json({ ok: false, error: "Client has no siteId. Set client.siteId first." });
    }

    const body = (req.body && typeof req.body === "object") ? req.body : null;
    if (!body) {
      return res.status(400).json({
        ok: false,
        error: "Invalid request body. Use JSON object and Content-Type: application/json",
      });
    }

    const payload = {};

    if (Object.prototype.hasOwnProperty.call(body, "enabled")) {
      const parsed = toBool(body.enabled, undefined);
      if (typeof parsed !== "boolean") {
        return res.status(400).json({ ok: false, error: "enabled must be boolean" });
      }
      payload.enabled = parsed;
    }

    if (Object.prototype.hasOwnProperty.call(body, "loop")) {
      const parsed = toBool(body.loop, undefined);
      if (typeof parsed !== "boolean") {
        return res.status(400).json({ ok: false, error: "loop must be boolean" });
      }
      payload.loop = parsed;
    }

    if (Object.prototype.hasOwnProperty.call(body, "lang")) {
      const lang = String(body.lang || "").trim().toLowerCase();
      if (lang && !lang.startsWith("en")) {
        return res.status(400).json({ ok: false, error: "Only English demo scripts are supported (lang='en')" });
      }
      payload.lang = "en";
    }

    if (Object.prototype.hasOwnProperty.call(body, "startDelayMs")) {
      const parsed = toNonNegativeInt(body.startDelayMs, NaN);
      if (!Number.isFinite(parsed)) {
        return res.status(400).json({ ok: false, error: "startDelayMs must be a non-negative number" });
      }
      payload.startDelayMs = parsed;
    }

    if (Object.prototype.hasOwnProperty.call(body, "messages")) {
      const parsed = parseMessages(body.messages);
      if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });
      payload.messages = parsed.value;
    }

    if (!Object.keys(payload).length) {
      return res.status(400).json({
        ok: false,
        error: "No updatable fields provided",
      });
    }

    const existing = await WidgetDemoScript.findOne({ siteId: client.siteId }).lean();
    const nextEnabled = Object.prototype.hasOwnProperty.call(payload, "enabled")
      ? payload.enabled
      : (existing?.enabled === true);
    const nextMessages = Object.prototype.hasOwnProperty.call(payload, "messages")
      ? payload.messages
      : (Array.isArray(existing?.messages) ? existing.messages : []);

    if (nextEnabled && (!Array.isArray(nextMessages) || nextMessages.length === 0)) {
      return res.status(400).json({
        ok: false,
        error: "Cannot enable script without messages",
      });
    }

    const doc = await WidgetDemoScript.findOneAndUpdate(
      { siteId: client.siteId },
      { $set: payload, $setOnInsert: { siteId: client.siteId } },
      { new: true, upsert: true, runValidators: true }
    );
    invalidateWidgetDemoScriptCache(client.siteId);

    return res.json({
      ok: true,
      client: {
        id: client._id,
        slug: client.slug,
        name: client.name,
        siteId: client.siteId,
      },
      script: toScriptDto(doc),
    });
  } catch (error) {
    console.error("upsertWidgetDemoScript", error);
    if (error?.code === 11000) {
      return res.status(409).json({ ok: false, error: "demo_script_conflict", details: error?.message || null });
    }
    if (error?.name === "ValidationError" || error?.name === "CastError") {
      return res.status(400).json({ ok: false, error: "demo_script_validation_failed", details: error?.message || null });
    }
    return res.status(500).json({ ok: false, error: "failed_to_upsert_demo_script", details: error?.message || null });
  }
}

export async function setWidgetDemoScriptEnabled(req, res) {
  try {
    const { idOrSlug } = req.params;
    const client = await resolveClientLite(idOrSlug);
    if (!client) return res.status(404).json({ ok: false, error: "Client not found" });
    if (!client.siteId) {
      return res.status(400).json({ ok: false, error: "Client has no siteId. Set client.siteId first." });
    }

    const body = (req.body && typeof req.body === "object") ? req.body : null;
    if (!body) {
      return res.status(400).json({
        ok: false,
        error: "Invalid request body. Use JSON object and Content-Type: application/json",
      });
    }

    const enabled = toBool(body.enabled, undefined);
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ ok: false, error: "enabled must be boolean" });
    }

    const doc = await WidgetDemoScript.findOne({ siteId: client.siteId });
    if (!doc) {
      if (enabled) {
        return res.status(400).json({
          ok: false,
          error: "Script does not exist. Create it with messages before enabling",
        });
      }
      invalidateWidgetDemoScriptCache(client.siteId);
      return res.json({
        ok: true,
        client: {
          id: client._id,
          slug: client.slug,
          name: client.name,
          siteId: client.siteId,
        },
        script: emptyScript(client.siteId),
      });
    }

    if (enabled && (!Array.isArray(doc.messages) || doc.messages.length === 0)) {
      return res.status(400).json({
        ok: false,
        error: "Cannot enable script without messages",
      });
    }

    doc.enabled = enabled;
    await doc.save();
    invalidateWidgetDemoScriptCache(client.siteId);

    return res.json({
      ok: true,
      client: {
        id: client._id,
        slug: client.slug,
        name: client.name,
        siteId: client.siteId,
      },
      script: toScriptDto(doc),
    });
  } catch (error) {
    console.error("setWidgetDemoScriptEnabled", error);
    if (error?.name === "ValidationError" || error?.name === "CastError") {
      return res.status(400).json({ ok: false, error: "demo_script_validation_failed", details: error?.message || null });
    }
    return res.status(500).json({ ok: false, error: "failed_to_toggle_demo_script", details: error?.message || null });
  }
}

export async function deleteWidgetDemoScript(req, res) {
  try {
    const { idOrSlug } = req.params;
    const client = await resolveClientLite(idOrSlug);
    if (!client) return res.status(404).json({ ok: false, error: "Client not found" });

    const result = await WidgetDemoScript.deleteOne({ siteId: client.siteId });
    invalidateWidgetDemoScriptCache(client.siteId);
    return res.json({
      ok: true,
      siteId: client.siteId,
      deleted: result.deletedCount > 0,
    });
  } catch (error) {
    console.error("deleteWidgetDemoScript", error);
    return res.status(500).json({ ok: false, error: "failed_to_delete_demo_script" });
  }
}
