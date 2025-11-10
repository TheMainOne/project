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
      customSystemPrompt: req.body.customSystemPrompt,
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
