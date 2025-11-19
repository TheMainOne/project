import mongoose from "mongoose";
import WidgetConfig from "../models/WidgetConfig.js";
import Client from "../models/Client.js";

function resolveClientFilter(idOrSlug) {
  if (!idOrSlug) return null;
  return /^[0-9a-fA-F]{24}$/.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
}

function parseInlineAutostart(raw) {
  if (!raw) return undefined;

  // если прилетает JSON-строкой (удобно для form-data)
  if (typeof raw === "string") {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj;
    } catch (e) {
      console.warn("inlineAutostart JSON parse error:", e);
      return undefined;
    }
  }

  // если уже объект (application/json)
  if (typeof raw === "object") {
    return raw;
  }

  return undefined;
}

// GET /api/clients/:idOrSlug/widget-config  (или /api/widget-config?siteId= | ?clientId=)
export async function getWidgetConfig(req, res) {
  try {
    const { idOrSlug } = req.params;
    const siteId = req.query.siteId || req.header("x-aiw-site") || null;

    const rawClientId = req.query.clientId || req.header("x-aiw-client") || null;
    const clientIdFromQuery =
      rawClientId && mongoose.isValidObjectId(rawClientId)
        ? new mongoose.Types.ObjectId(rawClientId)
        : null;

    let client = null;
    if (idOrSlug) {
      client = await Client.findOne(resolveClientFilter(idOrSlug))
        .select("_id")
        .lean();
    }

    const filter = {
      ...(clientIdFromQuery ? { clientId: clientIdFromQuery } : {}),
      ...(client?._id ? { clientId: client._id } : {}),
      ...(siteId ? { siteId } : {})
    };

    if (!filter.clientId && !filter.siteId) {
      return res.status(400).json({ error: "Provide client or siteId" });
    }

    const cfg = await WidgetConfig.findOne(filter).lean();
    return res.json({ ok: true, config: cfg || null });
  } catch (e) {
    console.error("getWidgetConfig", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
}

// PUT /api/clients/:idOrSlug/widget-config  (form-data: logo=file; body: остальные поля)
export async function upsertWidgetConfig(req, res) {
  try {
    const { idOrSlug } = req.params;
    const siteId =
      req.body.siteId || req.query.siteId || req.header("x-aiw-site") || null;

    const rawClientId =
      req.body.clientId || req.query.clientId || req.header("x-aiw-client") || null;
    const clientIdFromReq =
      rawClientId && mongoose.isValidObjectId(rawClientId)
        ? new mongoose.Types.ObjectId(rawClientId)
        : null;

    let client = null;
    if (idOrSlug) {
      client = await Client.findOne(resolveClientFilter(idOrSlug))
        .select("_id")
        .lean();
    }

    const filter = {
      ...(clientIdFromReq ? { clientId: clientIdFromReq } : {}),
      ...(client?._id ? { clientId: client._id } : {}),
      ...(siteId ? { siteId } : {})
    };

    if (!filter.clientId && !filter.siteId) {
      return res.status(400).json({ error: "Provide client or siteId" });
    }

    // соберём payload из body
    const payload = {
      // базовые UI
      widgetTitle:        req.body.widgetTitle,
      welcomeMessage:     req.body.welcomeMessage,
      primaryColor:       req.body.primaryColor,
      borderColor:        req.body.borderColor,
      backgroundColor:    req.body.backgroundColor,
      textColor:          req.body.textColor,
      lang:               req.body.lang,
      position:           req.body.position,

      // стили инпута / пузырей / хедера (НОВЫЕ)
      inputPlaceholder:         req.body.inputPlaceholder,
      headerBackgroundColor:    req.body.headerBackgroundColor,
      headerTextColor:          req.body.headerTextColor,
      assistantBubbleColor:     req.body.assistantBubbleColor,
      assistantBubbleTextColor: req.body.assistantBubbleTextColor,
      userBubbleColor:          req.body.userBubbleColor,
      userBubbleTextColor:      req.body.userBubbleTextColor,
      bubbleBorderColor:        req.body.bubbleBorderColor,
      inputBackgroundColor:     req.body.inputBackgroundColor,
      inputTextColor:           req.body.inputTextColor,
      inputBorderColor:         req.body.inputBorderColor,
      sendButtonBackgroundColor: req.body.sendButtonBackgroundColor,
      sendButtonIconColor:       req.body.sendButtonIconColor,
      showAvatars:              req.body.showAvatars,
      showTimestamps:           req.body.showTimestamps,

      //  шрифты
        fontFamily:  req.body.fontFamily,
  fontCssUrl:  req.body.fontCssUrl,
  fontFileUrl: req.body.fontFileUrl,

      // LLM / системный промпт
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
      stream:                  req.body.stream,

      isActive:           req.body.isActive ?? true,
    };

    // inlineAutostart можно прислать JSON-строкой в form-data
    const inlineAutostart = parseInlineAutostart(req.body.inlineAutostart);
    if (inlineAutostart) {
      payload.inlineAutostart = inlineAutostart;
    }

    // если пришёл файл лого — добавим объект logo
    if (req.file) {
      payload.logo = {
        s3Key:        req.file.key,
        url:          req.file.location, // добавляет multer-s3
        originalName: req.file.uploadedOriginalName || req.file.originalname,
        contentType:  req.file.uploadedMimeType || req.file.mimetype,
        size:         req.file.size,
        uploadedAt:   new Date(),
      };
    }

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

// Публичный конфиг для виджета (loader / widget.js)
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

    // при совпадении — выигрывает clientId
    const filter = {
      ...(siteId   ? { siteId } : {}),
      ...(clientId ? { clientId } : {}),
      isActive: { $ne: false },
    };

    // ограничим поля (без служебных)
    const projection = {
      widgetTitle: 1,
      welcomeMessage: 1,
      primaryColor: 1,
      backgroundColor: 1,
      textColor: 1,
      borderColor: 1,
      logo: 1,
      lang: 1,
      position: 1,

      // новые UI-поля
      inputPlaceholder: 1,
      headerBackgroundColor: 1,
      headerTextColor: 1,
      assistantBubbleColor: 1,
      assistantBubbleTextColor: 1,
      userBubbleColor: 1,
      userBubbleTextColor: 1,
      bubbleBorderColor: 1,
      inputBackgroundColor: 1,
      inputTextColor: 1,
      inputBorderColor: 1,
      sendButtonBackgroundColor: 1,
      sendButtonIconColor: 1,
      showAvatars: 1,
      showTimestamps: 1,
        fontFamily: 1,
  fontCssUrl: 1,
  fontFileUrl: 1,

      // behavior...
      autostart: 1,
      autostartDelay: 1,
      autostartMode: 1,
      autostartMessage: 1,
      autostartPrompt: 1,
      autostartCooldownHours: 1,
      preserveHistory: 1,
      resetHistoryOnOpen: 1,
      inlineAutostart: 1,
      stream: 1,

      siteId: 1,
      clientId: 1,
      isActive: 1,
    };

    const cfg = await WidgetConfig.findOne(filter, projection).lean();

    const out = cfg ? {
      siteId:   cfg.siteId   || null,
      clientId: cfg.clientId || null,

      widgetTitle:    cfg.widgetTitle    ?? "AI Assistant",
      welcomeMessage: cfg.welcomeMessage ?? "Hi! How can I help?",
      primaryColor:   cfg.primaryColor   ?? "#6D28D9",
      backgroundColor: cfg.backgroundColor ?? "#0f0f0f",
      textColor:        cfg.textColor      ?? "#ffffff",
      borderColor:      cfg.borderColor    ?? (cfg.primaryColor || "#6D28D9"),

      logo:         cfg.logo || null,
      lang:         cfg.lang      ?? "en",
      position:     cfg.position  ?? "br",
      stream:       cfg.stream    ?? false,

      // стили (как есть, без жёстких дефолтов — виджет сам добьёт)
      inputPlaceholder:         cfg.inputPlaceholder ?? "",
      headerBackgroundColor:    cfg.headerBackgroundColor ?? null,
      headerTextColor:          cfg.headerTextColor ?? null,
      assistantBubbleColor:     cfg.assistantBubbleColor ?? null,
      assistantBubbleTextColor: cfg.assistantBubbleTextColor ?? null,
      userBubbleColor:          cfg.userBubbleColor ?? null,
      userBubbleTextColor:      cfg.userBubbleTextColor ?? null,
      bubbleBorderColor:        cfg.bubbleBorderColor ?? null,
      inputBackgroundColor:     cfg.inputBackgroundColor ?? null,
      inputTextColor:           cfg.inputTextColor ?? null,
      inputBorderColor:         cfg.inputBorderColor ?? null,
      sendButtonBackgroundColor: cfg.sendButtonBackgroundColor ?? null,
      sendButtonIconColor:       cfg.sendButtonIconColor ?? null,
      showAvatars:              cfg.showAvatars !== false,
      showTimestamps:           cfg.showTimestamps !== false,
       fontFamily:  cfg.fontFamily  || "",
  fontCssUrl:  cfg.fontCssUrl  || "",
  fontFileUrl: cfg.fontFileUrl || "",

      autostart:          !!cfg.autostart,
      autostartDelay:     Number(cfg.autostartDelay ?? 5000),
      autostartMode:     (cfg.autostartMode || "local").toLowerCase(),
      autostartMessage:   cfg.autostartMessage   ?? "",
      autostartPrompt:    cfg.autostartPrompt    ?? "",
      autostartCooldownHours: Number(cfg.autostartCooldownHours ?? 12),
      preserveHistory:    cfg.preserveHistory !== false,
      resetHistoryOnOpen: !!cfg.resetHistoryOnOpen,
      inlineAutostart:    cfg.inlineAutostart || null,
    } : null;

    return res.json({ ok: true, config: out });
  } catch (e) {
    console.error("getPublicWidgetConfig", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
}



// upload widget font file controller

export async function uploadWidgetFont(req, res) {
  try {
    const { idOrSlug } = req.params;
    const siteId =
      req.body.siteId || req.query.siteId || req.header("x-aiw-site") || null;

    const rawClientId =
      req.body.clientId || req.query.clientId || req.header("x-aiw-client") || null;
    const clientIdFromReq =
      rawClientId && mongoose.isValidObjectId(rawClientId)
        ? new mongoose.Types.ObjectId(rawClientId)
        : null;

    let client = null;
    if (idOrSlug) {
      client = await Client.findOne(resolveClientFilter(idOrSlug))
        .select("_id")
        .lean();
    }

    const filter = {
      ...(clientIdFromReq ? { clientId: clientIdFromReq } : {}),
      ...(client?._id ? { clientId: client._id } : {}),
      ...(siteId ? { siteId } : {}),
    };

    if (!filter.clientId && !filter.siteId) {
      return res
        .status(400)
        .json({ ok: false, error: "Provide client or siteId" });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ ok: false, error: "font file is required (field 'font')" });
    }

    const payload = {
      fontFileUrl: req.file.location,
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

    return res.json({
      ok: true,
      url: req.file.location,
      s3Key: req.file.key,
      contentType: req.file.mimetype,
      size: req.file.size,
      config: cfg,
    });
  } catch (e) {
    console.error("uploadWidgetFont", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
}
