import mongoose from "mongoose";
import WidgetConfig from "../models/WidgetConfig.js";
import Client from "../models/Client.js";

function resolveClientFilter(idOrSlug) {
  if (!idOrSlug) return null;
  return /^[0-9a-fA-F]{24}$/.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
}

// GET /api/clients/:idOrSlug/widget-config  (или /api/widget-config?siteId= | ?clientId=)
export async function getWidgetConfig(req, res) {
  try {
    const { idOrSlug } = req.params;
    const siteId = req.query.siteId || req.header("x-aiw-site") || null;

    // ← добавлено: поддержка clientId из query/header
    const rawClientId = req.query.clientId || req.header("x-aiw-client") || null;
    const clientIdFromQuery =
      rawClientId && mongoose.isValidObjectId(rawClientId) ? new mongoose.Types.ObjectId(rawClientId) : null;

    let client = null;
    if (idOrSlug) client = await Client.findOne(resolveClientFilter(idOrSlug)).select("_id").lean();

    const filter = {
      ...(clientIdFromQuery ? { clientId: clientIdFromQuery } : {}),
      ...(client?._id ? { clientId: client._id } : {}),
      ...(siteId      ? { siteId } : {})
    };
    if (!filter.clientId && !filter.siteId) return res.status(400).json({ error: "Provide client or siteId" });

    const cfg = await WidgetConfig.findOne(filter).lean();
    return res.json({ ok: true, config: cfg || null });
  } catch (e) {
    console.error("getWidgetConfig", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
}

// PUT /api/clients/:idOrSlug/widget-config  (body: поля конфигурации)
export async function upsertWidgetConfig(req, res) {
  try {
    const { idOrSlug } = req.params;
    const siteId = req.body.siteId || req.query.siteId || req.header("x-aiw-site") || null;

    // ← добавлено: поддержка clientId из body/query/header
    const rawClientId =
      req.body.clientId || req.query.clientId || req.header("x-aiw-client") || null;
    const clientIdFromReq =
      rawClientId && mongoose.isValidObjectId(rawClientId) ? new mongoose.Types.ObjectId(rawClientId) : null;

    let client = null;
    if (idOrSlug) client = await Client.findOne(resolveClientFilter(idOrSlug)).select("_id").lean();

    const filter = {
      ...(clientIdFromReq ? { clientId: clientIdFromReq } : {}),
      ...(client?._id ? { clientId: client._id } : {}),
      ...(siteId      ? { siteId } : {})
    };
    if (!filter.clientId && !filter.siteId) return res.status(400).json({ error: "Provide client or siteId" });

const payload = {
  widgetTitle:        req.body.widgetTitle,
  welcomeMessage:     req.body.welcomeMessage,
  primaryColor:       req.body.primaryColor,
  borderColor:        req.body.borderColor,
  backgroundColor:    req.body.backgroundColor,
  textColor:          req.body.textColor,
  logoUrl:            req.body.logoUrl,          // <== добавить
  lang:               req.body.lang,             // <== добавить
  position:           req.body.position,         // <== добавить

  customSystemPrompt: req.body.customSystemPrompt,

  // поведение
  autostart:               req.body.autostart,
  autostartDelay:          req.body.autostartDelay,
  autostartMode:           req.body.autostartMode,
  autostartMessage:        req.body.autostartMessage,
  autostartPrompt:         req.body.autostartPrompt,
  autostartCooldownHours:  req.body.autostartCooldownHours,
  preserveHistory:         req.body.preserveHistory,
  resetHistoryOnOpen:      req.body.resetHistoryOnOpen,

  isActive:           req.body.isActive ?? true,
};

    const cfg = await WidgetConfig.findOneAndUpdate(
      filter,
      { $set: payload, $setOnInsert: { ...filter } },
      { new: true, upsert: true }
    );

    if (global.__WIDGET_CFG_CACHE) {
      const key = JSON.stringify(filter);
      global.__WIDGET_CFG_CACHE.delete(key);
    }

    return res.json({ ok: true, config: cfg });
  } catch (e) {
    console.error("upsertWidgetConfig", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
}

export async function getPublicWidgetConfig(req, res) {
  try {
    const siteId  = req.query.siteId || req.header("x-aiw-site") || null;
    const rawClientId = req.query.clientId || req.header("x-aiw-client") || null;

    const clientId = (rawClientId && mongoose.isValidObjectId(rawClientId))
      ? new mongoose.Types.ObjectId(rawClientId)
      : null;

    if (!siteId && !clientId) {
      return res.status(400).json({ ok: false, error: "Provide siteId or clientId" });
    }

    // при совпадении — пусть выигрывает clientId (точнее)
    const filter = {
      ...(siteId   ? { siteId } : {}),
      ...(clientId ? { clientId } : {}),
      isActive: { $ne: false },
    };

    // ограничим поля, чтобы не утекло лишнее
  const projection = {
  widgetTitle: 1,
  welcomeMessage: 1,
  primaryColor: 1,
  backgroundColor: 1,
  textColor: 1,
  borderColor: 1,
  logoUrl: 1,
  lang: 1,          // <== добавить
  position: 1,      // <== добавить
  // behavior...
  autostart: 1,
  autostartDelay: 1,
  autostartMode: 1,
  autostartMessage: 1,
  autostartPrompt: 1,
  autostartCooldownHours: 1,
  preserveHistory: 1,
  resetHistoryOnOpen: 1,
  siteId: 1,
  clientId: 1,
  isActive: 1,
};


    const cfg = await WidgetConfig.findOne(filter, projection).lean();

    // отдаём нормализованный «плоский» объект (без обёртки admin-полей)
    const out = cfg ? {
  siteId: cfg.siteId || null,
  clientId: cfg.clientId || null,
  widgetTitle:        cfg.widgetTitle        ?? "AI Assistant",
  welcomeMessage:     cfg.welcomeMessage     ?? "Hi! How can I help?",
  primaryColor:       cfg.primaryColor       ?? "#6D28D9",
  backgroundColor:    cfg.backgroundColor    ?? "#0f0f0f",
  textColor:          cfg.textColor          ?? "#ffffff",
  borderColor:        cfg.borderColor        ?? (cfg.primaryColor || "#6D28D9"),
  logoUrl:            cfg.logoUrl            ?? null,
  lang:               cfg.lang               ?? "en",     // <== добавить
  position:           cfg.position           ?? "br",     // <== добавить

  autostart:          !!cfg.autostart,
  autostartDelay:     Number(cfg.autostartDelay ?? 5000),
  autostartMode:     (cfg.autostartMode || "local").toLowerCase(),
  autostartMessage:   cfg.autostartMessage   ?? "",
  autostartPrompt:    cfg.autostartPrompt    ?? "",
  autostartCooldownHours: Number(cfg.autostartCooldownHours ?? 12),
  preserveHistory:    cfg.preserveHistory !== false,
  resetHistoryOnOpen: !!cfg.resetHistoryOnOpen,
} : null;


    // CORS + cache (можно смягчить)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=60"); // 1 минута
    return res.json({ ok: true, config: out });
  } catch (e) {
    console.error("getPublicWidgetConfig", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
}
