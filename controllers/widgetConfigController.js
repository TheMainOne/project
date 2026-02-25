import mongoose from "mongoose";
import WidgetConfig from "../models/WidgetConfig.js";
import Client from "../models/Client.js";
import { getDefaultWidgetVersion } from "../services/widgetRelease/getDefaultWidgetVersion.js";

function resolveClientFilter(idOrSlug) {
  if (!idOrSlug) return null;
  return /^[0-9a-fA-F]{24}$/.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
}

function parseInlineAutostart(raw) {
  if (!raw) return undefined;

  // ÐµÑÐ»Ð¸ Ð¿Ñ€Ð¸Ð»ÐµÑ‚Ð°ÐµÑ‚ JSON-ÑÑ‚Ñ€Ð¾ÐºÐ¾Ð¹ (ÑƒÐ´Ð¾Ð±Ð½Ð¾ Ð´Ð»Ñ form-data)
  if (typeof raw === "string") {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj;
    } catch (e) {
      console.warn("inlineAutostart JSON parse error:", e);
      return undefined;
    }
  }

  // ÐµÑÐ»Ð¸ ÑƒÐ¶Ðµ Ð¾Ð±ÑŠÐµÐºÑ‚ (application/json)
  if (typeof raw === "object") {
    return raw;
  }

  return undefined;
}

function parseLeadCapture(raw) {
  if (!raw) return undefined;

  // ÐµÑÐ»Ð¸ Ð¿Ñ€Ð¸Ð»ÐµÑ‚Ð°ÐµÑ‚ JSON-ÑÑ‚Ñ€Ð¾ÐºÐ¾Ð¹ (Ð½Ð°Ð¿Ñ€Ð¸Ð¼ÐµÑ€, Ð¸Ð· form-data)
  if (typeof raw === "string") {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj;
    } catch (e) {
      console.warn("leadCapture JSON parse error:", e);
      return undefined;
    }
  }

  // ÐµÑÐ»Ð¸ ÑƒÐ¶Ðµ Ð¾Ð±ÑŠÐµÐºÑ‚ (application/json)
  if (typeof raw === "object") {
    return raw;
  }

  return undefined;
}

function parseBehavior(raw) {
  if (!raw) return undefined;

  if (typeof raw === "string") {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj;
    } catch (e) {
      console.warn("behavior JSON parse error:", e);
      return undefined;
    }
  }

  if (typeof raw === "object") {
    return raw;
  }

  return undefined;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function setNestedPatch(target, prefix, value) {
  if (!target || !prefix) return;
  if (!isPlainObject(value)) {
    target[prefix] = value;
    return;
  }
  const keys = Object.keys(value);
  for (const key of keys) {
    const next = value[key];
    if (next === undefined) continue;
    const path = `${prefix}.${key}`;
    if (isPlainObject(next)) {
      setNestedPatch(target, path, next);
    } else {
      target[path] = next;
    }
  }
}

function toIntOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolOr(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value || "").trim().toLowerCase();
  if (!text) return fallback;
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function normalizeRenderMode(rawMode) {
  const mode = String(rawMode || "").trim().toLowerCase();
  if (mode === "inline") return "inline";
  if (mode === "float" || mode === "floating") return "float";
  if (
    mode === "hybrid" ||
    mode === "both" ||
    mode === "inline+float" ||
    mode === "float+inline"
  ) return "hybrid";
  return "";
}

function normalizeFloatLauncherAction(rawAction) {
  const action = rawAction && typeof rawAction === "object" ? rawAction : {};
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(action, key);
  const normalized = {};

  const variantRaw = String(action.variant || "").trim().toLowerCase();
  if (variantRaw === "pill" || variantRaw === "circle") {
    normalized.variant = variantRaw;
  }

  if (hasOwn("text")) {
    const v = String(action.text || "").trim();
    if (v) normalized.text = v;
  }
  if (hasOwn("iconText")) {
    const v = String(action.iconText || "").trim();
    if (v) normalized.iconText = v;
  }

  if (hasOwn("widthPx") && action.widthPx !== null && action.widthPx !== "") {
    const widthRaw = Number(action.widthPx);
    if (Number.isFinite(widthRaw)) {
      normalized.widthPx = Math.max(160, Math.min(900, Math.round(widthRaw)));
    }
  }
  if (hasOwn("heightPx") && action.heightPx !== null && action.heightPx !== "") {
    const heightRaw = Number(action.heightPx);
    if (Number.isFinite(heightRaw)) {
      normalized.heightPx = Math.max(40, Math.min(120, Math.round(heightRaw)));
    }
  }

  if (hasOwn("bgColor")) {
    const v = String(action.bgColor || "").trim();
    if (v) normalized.bgColor = v;
  }
  if (hasOwn("textColor")) {
    const v = String(action.textColor || "").trim();
    if (v) normalized.textColor = v;
  }
  if (hasOwn("iconBgColor")) {
    const v = String(action.iconBgColor || "").trim();
    if (v) normalized.iconBgColor = v;
  }
  if (hasOwn("iconTextColor")) {
    const v = String(action.iconTextColor || "").trim();
    if (v) normalized.iconTextColor = v;
  }
  if (hasOwn("borderColor")) {
    const v = String(action.borderColor || "").trim();
    if (v) normalized.borderColor = v;
  }
  if (hasOwn("shadow")) {
    const v = String(action.shadow || "").trim();
    if (v) normalized.shadow = v;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeFloatLauncherDynamicRule(rawRule, index) {
  if (!rawRule || typeof rawRule !== "object") return null;

  const event = String(rawRule.event || rawRule.when || "").trim();
  if (!event) return null;

  const action = normalizeFloatLauncherAction(
    rawRule.action || rawRule.style || rawRule.patch || rawRule
  );
  if (!action) return null;

  return {
    id: String(rawRule.id || `rule_${index}`),
    event,
    section: String(rawRule.section || ""),
    tab: String(rawRule.tab || ""),
    path: String(rawRule.path || ""),
    minDurationMs: Math.max(0, toIntOr(rawRule.minDurationMs, 0)),
    minScrollDepth: Math.max(0, toIntOr(rawRule.minScrollDepth, 0)),
    minVisibleMs: Math.max(0, toIntOr(rawRule.minVisibleMs, 0)),
    priority: toIntOr(rawRule.priority, 0),
    once: toBoolOr(rawRule.once, false),
    cooldownMs: Math.max(0, toIntOr(rawRule.cooldownMs, 0)),
    maxShows: Math.max(0, toIntOr(rawRule.maxShows, 0)),
    action,
  };
}

function normalizeFloatLauncherDynamic(rawDynamic) {
  const dynamic = rawDynamic && typeof rawDynamic === "object" ? rawDynamic : {};
  const sourceRules = Array.isArray(dynamic.rules) ? dynamic.rules : [];
  const rules = [];
  for (let i = 0; i < sourceRules.length; i += 1) {
    const normalized = normalizeFloatLauncherDynamicRule(sourceRules[i], i);
    if (normalized) rules.push(normalized);
  }

  return {
    enabled: rules.length > 0 && toBoolOr(dynamic.enabled, false),
    resetOnNoMatch: toBoolOr(dynamic.resetOnNoMatch, true),
    transitionMs: Math.max(80, Math.min(1200, toIntOr(dynamic.transitionMs, 220))),
    rules,
  };
}

function normalizeInlineAnchorButton(rawConfig, fallbackEnabled) {
  const cfg = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  const parseOptionalOffset = (value) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    if (!text) return null;
    const n = Number(text);
    if (!Number.isFinite(n)) return null;
    return Math.max(-5000, Math.min(5000, Math.round(n)));
  };
  const blockRaw = String(cfg.anchorBlock || cfg.scrollBlock || cfg.block || "").trim().toLowerCase();
  const behaviorRaw = String(cfg.anchorBehavior || cfg.scrollBehavior || cfg.behavior || "").trim().toLowerCase();
  const engineRaw = String(cfg.scrollEngine || cfg.engine || "").trim().toLowerCase();
  const safeBlock = ["start", "center", "end", "nearest"].includes(blockRaw) ? blockRaw : "start";
  const safeBehavior = behaviorRaw === "auto" ? "auto" : "smooth";
  const safeEngine = [
    "auto",
    "window",
    "lenis",
    "locomotive",
    "smoother",
    "smooth-scrollbar",
    "fullpage",
    "host",
  ].includes(engineRaw) ? engineRaw : "auto";
  return {
    enabled: toBoolOr(cfg.enabled, !!fallbackEnabled),
    label: String(cfg.label || cfg.text || ""),
    anchorTarget: String(cfg.anchorTarget || cfg.anchorSelector || cfg.anchorId || cfg.target || ""),
    anchorBehavior: safeBehavior,
    anchorBlock: safeBlock,
    anchorOffsetPx: Math.max(-5000, Math.min(5000, toIntOr(cfg.anchorOffsetPx ?? cfg.offsetPx, 0))),
    anchorOffsetPxMobile: parseOptionalOffset(
      cfg.anchorOffsetPxMobile ?? cfg.offsetPxMobile ?? cfg.mobileAnchorOffsetPx ?? cfg.mobileOffsetPx
    ),
    anchorOffsetPxIos: parseOptionalOffset(
      cfg.anchorOffsetPxIos ?? cfg.offsetPxIos ?? cfg.iosAnchorOffsetPx ?? cfg.iosOffsetPx
    ),
    wheelFallbackEnabled: toBoolOr(cfg.wheelFallbackEnabled ?? cfg.enableWheelFallback, true),
    scrollEngine: safeEngine,
    scrollEngineKey: String(cfg.scrollEngineKey || cfg.engineKey || cfg.globalKey || ""),
  };
}

function normalizeBehavior(rawBehavior) {
  const behavior = rawBehavior && typeof rawBehavior === "object" ? rawBehavior : {};
  const notifications = behavior.notifications || {};
  const limits = notifications?.limits || {};
  const hybrid = behavior.hybrid && typeof behavior.hybrid === "object" ? behavior.hybrid : {};
  const hybridFloat = hybrid.float && typeof hybrid.float === "object" ? hybrid.float : {};
  const floatLauncher = behavior.floatLauncher && typeof behavior.floatLauncher === "object"
    ? behavior.floatLauncher
    : {};

  const renderMode = normalizeRenderMode(behavior.renderMode || behavior.mode);
  const hybridEnabledFromConfig =
    (typeof hybridFloat.enabled === "boolean") ? hybridFloat.enabled :
    ((typeof hybrid.enabled === "boolean") ? hybrid.enabled : undefined);
  const hybridEnabled = (typeof hybridEnabledFromConfig === "boolean")
    ? hybridEnabledFromConfig
    : (renderMode === "hybrid");
  const resolvedRenderMode = renderMode || (hybridEnabled ? "hybrid" : "float");
  const launcherVariant = String(floatLauncher.variant || "").trim().toLowerCase() === "pill" ? "pill" : "circle";
  const launcherIconText = String(floatLauncher.iconText || "AI").trim() || "AI";
  const launcherDynamic = normalizeFloatLauncherDynamic(floatLauncher.dynamic);
  const legacyAnchorEnabled = String(floatLauncher.clickAction || "").trim().toLowerCase() === "anchor";
  const inlineAnchorButton = normalizeInlineAnchorButton(behavior.inlineAnchorButton, legacyAnchorEnabled);

  return {
    renderMode: resolvedRenderMode,
    hybrid: {
      enabled: !!hybridEnabled,
      float: {
        enabled: !!hybridEnabled,
      },
    },
    floatLauncher: {
      variant: launcherVariant,
      text: String(floatLauncher.text || ""),
      iconText: launcherIconText,
      hideLabelWhenEmpty: toBoolOr(floatLauncher.hideLabelWhenEmpty, false),
      widthPx: Math.max(160, Math.min(900, toIntOr(floatLauncher.widthPx, 420))),
      heightPx: Math.max(40, Math.min(120, toIntOr(floatLauncher.heightPx, 56))),
      bgColor: String(floatLauncher.bgColor || ""),
      textColor: String(floatLauncher.textColor || ""),
      iconBgColor: String(floatLauncher.iconBgColor || ""),
      iconTextColor: String(floatLauncher.iconTextColor || ""),
      borderColor: String(floatLauncher.borderColor || ""),
      shadow: String(floatLauncher.shadow || ""),
      dynamic: launcherDynamic,
    },
    inlineAnchorButton,
    notifications: {
      enabled: !!notifications.enabled,
      rulesVersion: Math.max(1, toIntOr(notifications.rulesVersion, 1)),
      limits: {
        globalCooldownMs: Math.max(0, toIntOr(limits.globalCooldownMs, 8000)),
        maxPerSession: Math.max(0, toIntOr(limits.maxPerSession, 3)),
      },
      rules: Array.isArray(notifications.rules) ? notifications.rules : [],
    },
  };
}

// GET /api/clients/:idOrSlug/widget-config  (Ð¸Ð»Ð¸ /api/widget-config?siteId= | ?clientId=)
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

// PUT /api/clients/:idOrSlug/widget-config  (form-data: logo=file; body: Ð¾ÑÑ‚Ð°Ð»ÑŒÐ½Ñ‹Ðµ Ð¿Ð¾Ð»Ñ)
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

    // ÑÐ¾Ð±ÐµÑ€Ñ‘Ð¼ payload Ð¸Ð· body
    const payload = {
      // Ð±Ð°Ð·Ð¾Ð²Ñ‹Ðµ UI
      widgetTitle:        req.body.widgetTitle,
      welcomeMessage:     req.body.welcomeMessage,
      primaryColor:       req.body.primaryColor,
      borderColor:        req.body.borderColor,
      backgroundColor:    req.body.backgroundColor,
      textColor:          req.body.textColor,
      lang:               req.body.lang,
      position:           req.body.position,

      // ÑÑ‚Ð¸Ð»Ð¸ Ð¸Ð½Ð¿ÑƒÑ‚Ð° / Ð¿ÑƒÐ·Ñ‹Ñ€ÐµÐ¹ / Ñ…ÐµÐ´ÐµÑ€Ð° (ÐÐžÐ’Ð«Ð•)
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

      //  ÑˆÑ€Ð¸Ñ„Ñ‚Ñ‹
        fontFamily:  req.body.fontFamily,
  fontCssUrl:  req.body.fontCssUrl,
  fontFileUrl: req.body.fontFileUrl,

  

      // LLM / ÑÐ¸ÑÑ‚ÐµÐ¼Ð½Ñ‹Ð¹ Ð¿Ñ€Ð¾Ð¼Ð¿Ñ‚
      customSystemPrompt: req.body.customSystemPrompt,

      // Ð¿Ð¾Ð²ÐµÐ´ÐµÐ½Ð¸Ðµ
      autostart:               req.body.autostart,
      autostartDelay:          req.body.autostartDelay,
      autostartMode:           req.body.autostartMode,
      autostartMessage:        req.body.autostartMessage,
      autostartPrompt:         req.body.autostartPrompt,
      autostartCooldownHours:  req.body.autostartCooldownHours,
      preserveHistory:         req.body.preserveHistory,
      resetHistoryOnOpen:      req.body.resetHistoryOnOpen,
      stream:                  req.body.stream,

      widgetVersionOverride: req.body.widgetVersionOverride,
      isActive:           req.body.isActive ?? true,
    };

        if (req.body.baseFontSize !== undefined) {
      const n = Number(req.body.baseFontSize);
      if (!Number.isNaN(n)) {
        payload.baseFontSize = Math.max(10, Math.min(24, n));
      }
    }

    // inlineAutostart Ð¼Ð¾Ð¶Ð½Ð¾ Ð¿Ñ€Ð¸ÑÐ»Ð°Ñ‚ÑŒ JSON-ÑÑ‚Ñ€Ð¾ÐºÐ¾Ð¹ Ð² form-data
    const inlineAutostart = parseInlineAutostart(req.body.inlineAutostart);
    if (inlineAutostart) {
      payload.inlineAutostart = inlineAutostart;
    }

    // leadCapture â€” Ñ‚Ð¾Ð¶Ðµ ÐºÐ°Ðº ÑÑ‹Ñ€Ð¾Ð¹ JSON (Ð¾Ð±ÑŠÐµÐºÑ‚ Ð¸Ð»Ð¸ ÑÑ‚Ñ€Ð¾ÐºÐ°)
const leadCapture = parseLeadCapture(req.body.leadCapture);
if (leadCapture) {
  payload.leadCapture = leadCapture;
}

    // behavior patch (merge): Ð½Ðµ Ð·Ð°Ñ‚Ð¸Ñ€Ð°ÐµÐ¼ Ð²ÐµÑÑŒ behavior, Ð¾Ð±Ð½Ð¾Ð²Ð»ÑÐµÐ¼ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð¿ÐµÑ€ÐµÐ´Ð°Ð½Ð½Ñ‹Ðµ Ð²ÐµÑ‚ÐºÐ¸
    const behavior = parseBehavior(req.body.behavior);
    if (behavior && typeof behavior === "object") {
      const rm = normalizeRenderMode(behavior.renderMode || behavior.mode);
      if (rm) {
        payload["behavior.renderMode"] = rm;
      }
      if (behavior.hybrid && typeof behavior.hybrid === "object") {
        setNestedPatch(payload, "behavior.hybrid", behavior.hybrid);
      }
      if (behavior.floatLauncher && typeof behavior.floatLauncher === "object") {
        setNestedPatch(payload, "behavior.floatLauncher", behavior.floatLauncher);
      }
      if (behavior.inlineAnchorButton && typeof behavior.inlineAnchorButton === "object") {
        setNestedPatch(payload, "behavior.inlineAnchorButton", behavior.inlineAnchorButton);
      }
      if (behavior.notifications && typeof behavior.notifications === "object") {
        setNestedPatch(payload, "behavior.notifications", behavior.notifications);
      }
    }

    // shortcut: Ð¼Ð¾Ð¶Ð½Ð¾ Ð¿Ñ€Ð¸ÑÐ»Ð°Ñ‚ÑŒ notifications Ð¾Ñ‚Ð´ÐµÐ»ÑŒÐ½Ð¾
    const notifications = parseBehavior(req.body.notifications);
    if (notifications) {
      setNestedPatch(payload, "behavior.notifications", notifications);
    }

    // shortcut: renderMode Ð¼Ð¾Ð¶Ð½Ð¾ Ð¿ÐµÑ€ÐµÐ´Ð°Ñ‚ÑŒ Ð¾Ñ‚Ð´ÐµÐ»ÑŒÐ½Ñ‹Ð¼ Ð¿Ð¾Ð»ÐµÐ¼ (float | inline | hybrid)
    const renderModeShortcut = normalizeRenderMode(req.body.renderMode);
    if (renderModeShortcut) {
      payload["behavior.renderMode"] = renderModeShortcut;
    }

    // shortcut: floatLauncher Ð¼Ð¾Ð¶Ð½Ð¾ Ð¿ÐµÑ€ÐµÐ´Ð°Ñ‚ÑŒ Ð¾Ñ‚Ð´ÐµÐ»ÑŒÐ½Ñ‹Ð¼ Ð¿Ð¾Ð»ÐµÐ¼
    const floatLauncher = parseBehavior(req.body.floatLauncher);
    if (floatLauncher) {
      setNestedPatch(payload, "behavior.floatLauncher", floatLauncher);
    }
    const inlineAnchorButton = parseBehavior(req.body.inlineAnchorButton);
    if (inlineAnchorButton) {
      setNestedPatch(payload, "behavior.inlineAnchorButton", inlineAnchorButton);
    }

    // ÐµÑÐ»Ð¸ Ð¿Ñ€Ð¸ÑˆÑ‘Ð» Ñ„Ð°Ð¹Ð» Ð»Ð¾Ð³Ð¾ â€” Ð´Ð¾Ð±Ð°Ð²Ð¸Ð¼ Ð¾Ð±ÑŠÐµÐºÑ‚ logo
    if (req.file) {
      payload.logo = {
        s3Key:        req.file.key,
        url:          req.file.location, // Ð´Ð¾Ð±Ð°Ð²Ð»ÑÐµÑ‚ multer-s3
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

// ÐŸÑƒÐ±Ð»Ð¸Ñ‡Ð½Ñ‹Ð¹ ÐºÐ¾Ð½Ñ„Ð¸Ð³ Ð´Ð»Ñ Ð²Ð¸Ð´Ð¶ÐµÑ‚Ð° (loader / widget.js)
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

    // Ð¿Ñ€Ð¸ ÑÐ¾Ð²Ð¿Ð°Ð´ÐµÐ½Ð¸Ð¸ â€” Ð²Ñ‹Ð¸Ð³Ñ€Ñ‹Ð²Ð°ÐµÑ‚ clientId
    const filter = {
      ...(siteId   ? { siteId } : {}),
      ...(clientId ? { clientId } : {}),
      isActive: { $ne: false },
    };

    // Ð¾Ð³Ñ€Ð°Ð½Ð¸Ñ‡Ð¸Ð¼ Ð¿Ð¾Ð»Ñ (Ð±ÐµÐ· ÑÐ»ÑƒÐ¶ÐµÐ±Ð½Ñ‹Ñ…)
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

      // Ð½Ð¾Ð²Ñ‹Ðµ UI-Ð¿Ð¾Ð»Ñ
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
   baseFontSize: 1,

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
      leadCapture: 1,
      behavior: 1,

      siteId: 1,
      clientId: 1,
      widgetVersionOverride: 1,
      isActive: 1,
    };

    const cfg = await WidgetConfig.findOne(filter, projection).lean();
    const defaultWidgetVersion = await getDefaultWidgetVersion();
    const override = (cfg?.widgetVersionOverride || "").trim();
    const resolvedWidgetVersion = override || defaultWidgetVersion;

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
  baseFontSize: cfg.baseFontSize ?? 14,

  autostart:          !!cfg.autostart,
  autostartDelay:     Number(cfg.autostartDelay ?? 5000),
  autostartMode:     (cfg.autostartMode || "local").toLowerCase(),
  autostartMessage:   cfg.autostartMessage   ?? "",
  autostartPrompt:    cfg.autostartPrompt    ?? "",
  autostartCooldownHours: Number(cfg.autostartCooldownHours ?? 12),
  preserveHistory:    cfg.preserveHistory !== false,
  resetHistoryOnOpen: !!cfg.resetHistoryOnOpen,
  inlineAutostart:    cfg.inlineAutostart || null,
  behavior: normalizeBehavior(cfg.behavior),
  resolvedWidgetVersion,

  // NEW: leadCapture Ð² Ð½Ð¾Ñ€Ð¼Ð°Ð»Ð¸Ð·Ð¾Ð²Ð°Ð½Ð½Ð¾Ð¼ Ð²Ð¸Ð´Ðµ
leadCapture: (() => {
  const raw = cfg.leadCapture || {};
  const triggers = raw.triggers || {};

  const llm = triggers.llm || {};
  const afterN = triggers.afterN || {};

  const defaultTriggers = {
    llm: {
      enabled: llm.enabled ?? true,
      strongThreshold:
        typeof llm.strongThreshold === "number" ? llm.strongThreshold : 0.75,
    },
    afterN: {
      enabled: afterN.enabled ?? true,
      minUserMessages:
        typeof afterN.minUserMessages === "number" ? afterN.minUserMessages : 6,
      cooldownMinutes:
        typeof afterN.cooldownMinutes === "number" ? afterN.cooldownMinutes : 60,
      maxPromptsPerSession:
        typeof afterN.maxPromptsPerSession === "number"
          ? afterN.maxPromptsPerSession
          : 1,
    },
  };

  return {
    enabled: !!raw.enabled,
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    triggers: defaultTriggers,
  };
})(),
} : {
  siteId: siteId || null,
  clientId: clientId || null,
  behavior: normalizeBehavior({}),
  resolvedWidgetVersion,
};

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

