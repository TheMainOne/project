/*
====================================================
aiw widget v0.1.2 -
====================================================
*/
(function widget () {
  const CFG = (window.__AIW_CONFIG__ || {});
  const STREAM = (typeof CFG.stream === "boolean") ? CFG.stream : true;
const RAW_FONT_FAMILY = (CFG.fontFamily || "").trim();       // ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¶ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™ ""
const FONT_FILE_URL   = (CFG.fontFileUrl || "").trim() || null;
const FONT_CSS_URL    = (CFG.fontCssUrl || "").trim() || null;

  // --- ÃƒÂÃ‚ÂÃƒÂÃ…Â¾ÃƒÂÃ¢â‚¬â„¢ÃƒÂÃ…Â¾ÃƒÂÃ¢â‚¬Â¢: Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ÃƒÂÃ‚Â° ÃƒÂÃ‚Â¾ÃƒÂÃ‚ÂºÃƒÂÃ‚Â½ÃƒÂÃ‚Â° (ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â inline Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ÃƒÂÃ‚Â° iframe) ---
  const VIEWPORT_W =
    window.innerWidth ||
    document.documentElement?.clientWidth ||
    document.body?.clientWidth ||
    0;

  const IS_MOBILE = VIEWPORT_W <= 480;         // Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¾ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Â¹
  const IS_TABLET = !IS_MOBILE && VIEWPORT_W <= 768; // ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â»ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â‚¬Â¹
  const UA = navigator.userAgent || "";
  const IS_IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const QUERY = new URLSearchParams(location.search);

// ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼Ãƒâ€˜Ã‚Â, ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â¼Ãƒâ€˜Ã¢â‚¬Â¹ Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â°ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â·Ãƒâ€˜Ã†â€™ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ Ãƒâ€˜Ã‹â€ Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¾Ãƒâ€˜Ã¢â‚¬Å¡
const EFFECTIVE_FONT_NAME = RAW_FONT_FAMILY || (FONT_FILE_URL ? "__aiw_custom" : null);

const BASE_FONT_STACK = EFFECTIVE_FONT_NAME
  ? `'${EFFECTIVE_FONT_NAME}', system-ui,-apple-system,Segoe UI,Roboto,sans-serif`
  : 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
  // ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¼ NEW: Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¶ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼ Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°
const MODE   = (CFG.mode || QUERY.get("mode") || "float").toLowerCase();
const INLINE = MODE === "inline";
const RENDER_MODE = String(
  CFG.renderMode ||
  (CFG.behavior && (CFG.behavior.renderMode || CFG.behavior.mode)) ||
  ""
).trim().toLowerCase();
const HYBRID_HISTORY_SYNC = (CFG.hybridHistorySync === true) || RENDER_MODE === "hybrid";
const FIT_MODE = (QUERY.get("fit") || "container").toLowerCase();
const FILL_CONTAINER = INLINE && FIT_MODE === "container";
const PARENT_ORIGIN = QUERY.get("parentOrigin") || "*";
const INSTANCE_ID = QUERY.get("instanceId") || "";
const MAX_LEN = 1000;
let FIRST_BOOT = true; // ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¶ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° ÃƒÂÃ‚Â·ÃƒÂÃ‚Â° Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã†â€™ ÃƒÂÃ‚Â·ÃƒÂÃ‚Â°ÃƒÂÃ‚Â³Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·ÃƒÂÃ‚ÂºÃƒâ€˜Ã†â€™ Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Â Ãƒâ€˜Ã¢â‚¬Â¹


  if (INLINE) {
    const bodyEl = document.body;
    if (bodyEl) {
      bodyEl.style.margin = "0";
      bodyEl.style.background = bodyEl.style.background || "transparent";
      bodyEl.style.boxSizing = bodyEl.style.boxSizing || "border-box";
    }
  }

  if (INLINE && FILL_CONTAINER) {
    const docEl = document.documentElement;
    if (docEl) {
      docEl.style.height = "100%";
      docEl.style.minHeight = "100%";
    }
    const bodyEl = document.body;
    if (bodyEl) {
      bodyEl.style.height = "100%";
      bodyEl.style.minHeight = "100%";
      bodyEl.style.display = "flex";
      bodyEl.style.flexDirection = "column";
      bodyEl.style.alignItems = "stretch";
      bodyEl.style.justifyContent = "flex-start";
    }
  }

const ENDPOINT = CFG.endpoint;
  const API_ORIGIN = ENDPOINT ? new URL(ENDPOINT).origin : location.origin;
  const SITE_ID  = CFG.siteId || (location.host + "::default");
  const TITLE    = CFG.title || "AI Assistant";
const ACCENT = CFG.primaryColor || CFG.accent || "#6D28D9";
  function toText(value) {
    if (value === undefined || value === null) return "";
    return String(value);
  }
  function toNum(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  function toBool(value, fallback) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const text = toText(value).trim().toLowerCase();
    if (!text) return fallback;
    if (["1", "true", "yes", "on"].includes(text)) return true;
    if (["0", "false", "no", "off"].includes(text)) return false;
    return fallback;
  }
  function normToken(value) {
    return toText(value).trim().toLowerCase();
  }
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function normalizeLauncherVariant(raw) {
    return normToken(raw) === "pill" ? "pill" : "circle";
  }
  function normalizeLauncherAction(rawAction) {
    const action = rawAction && typeof rawAction === "object" ? rawAction : {};
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(action, key);
    const normalized = {};

    const variantRaw = normToken(action.variant);
    if (variantRaw === "pill" || variantRaw === "circle") normalized.variant = variantRaw;

    if (hasOwn("text")) {
      const v = toText(action.text).trim();
      if (v) normalized.text = v;
    }
    if (hasOwn("iconText")) {
      const v = toText(action.iconText).trim();
      if (v) normalized.iconText = v;
    }

    if (hasOwn("widthPx") && action.widthPx !== null && action.widthPx !== "") {
      const widthRaw = Number(action.widthPx);
      if (Number.isFinite(widthRaw)) normalized.widthPx = clamp(Math.round(widthRaw), 160, 900);
    }
    if (hasOwn("heightPx") && action.heightPx !== null && action.heightPx !== "") {
      const heightRaw = Number(action.heightPx);
      if (Number.isFinite(heightRaw)) normalized.heightPx = clamp(Math.round(heightRaw), 40, 120);
    }

    if (hasOwn("bgColor")) {
      const v = toText(action.bgColor).trim();
      if (v) normalized.bgColor = v;
    }
    if (hasOwn("textColor")) {
      const v = toText(action.textColor).trim();
      if (v) normalized.textColor = v;
    }
    if (hasOwn("iconBgColor")) {
      const v = toText(action.iconBgColor).trim();
      if (v) normalized.iconBgColor = v;
    }
    if (hasOwn("iconTextColor")) {
      const v = toText(action.iconTextColor).trim();
      if (v) normalized.iconTextColor = v;
    }
    if (hasOwn("borderColor")) {
      const v = toText(action.borderColor).trim();
      if (v) normalized.borderColor = v;
    }
    if (hasOwn("shadow")) {
      const v = toText(action.shadow).trim();
      if (v) normalized.shadow = v;
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
  }
  function normalizeLauncherDynamicRule(rawRule, index) {
    if (!rawRule || typeof rawRule !== "object") return null;
    const event = toText(rawRule.event || rawRule.when).trim();
    if (!event) return null;
    return {
      id: toText(rawRule.id || ("rule_" + String(index))).trim() || ("rule_" + String(index)),
      event,
      section: toText(rawRule.section || "").trim(),
      tab: toText(rawRule.tab || "").trim(),
      path: toText(rawRule.path || "").trim(),
      minDurationMs: Math.max(0, toNum(rawRule.minDurationMs, 0)),
      minScrollDepth: Math.max(0, toNum(rawRule.minScrollDepth, 0)),
      minVisibleMs: Math.max(0, toNum(rawRule.minVisibleMs, 0)),
      priority: toNum(rawRule.priority, 0),
      once: toBool(rawRule.once, false),
      cooldownMs: Math.max(0, toNum(rawRule.cooldownMs, 0)),
      maxShows: Math.max(0, toNum(rawRule.maxShows, 0)),
      action: normalizeLauncherAction(rawRule.action || rawRule.style || rawRule.patch || rawRule)
    };
  }
  const POSITION = (() => {
    const raw = String(CFG.position || "").trim().toLowerCase();
    if (raw === "bl") return "bl";
    if (raw === "center" || raw === "bc") return "center";
    return "br";
  })();
  const FLOAT_LAUNCHER = (() => {
    const raw = CFG.floatLauncher && typeof CFG.floatLauncher === "object" ? CFG.floatLauncher : {};
    const variant = normalizeLauncherVariant(raw.variant);
    const iconText = toText(raw.iconText || "AI").trim() || "AI";
    const text = toText(raw.text || "").trim();
    const widthPx = clamp(toNum(raw.widthPx, 420), 160, 900);
    const heightPx = clamp(toNum(raw.heightPx, 56), 40, 120);
    const clickActionRaw = normToken(raw.clickAction || raw.clickMode || raw.onClick);
    const clickAction = clickActionRaw === "anchor" ? "anchor" : "toggle";
    const anchorTarget = toText(raw.anchorTarget || raw.anchorSelector || raw.anchorId || "").trim();
    const anchorBehaviorRaw = normToken(raw.anchorBehavior || raw.scrollBehavior || "");
    const anchorBehavior = anchorBehaviorRaw === "auto" ? "auto" : "smooth";
    const anchorBlockRaw = normToken(raw.anchorBlock || raw.scrollBlock || "");
    const anchorBlock = ["start", "center", "end", "nearest"].includes(anchorBlockRaw) ? anchorBlockRaw : "start";
    const anchorOffsetPx = clamp(Math.round(toNum(raw.anchorOffsetPx, 0)), -5000, 5000);
    const dynamicRaw = raw.dynamic && typeof raw.dynamic === "object" ? raw.dynamic : {};
    const sourceRules = Array.isArray(dynamicRaw.rules) ? dynamicRaw.rules : [];
    const dynamicRules = [];
    for (let i = 0; i < sourceRules.length; i += 1) {
      const normalized = normalizeLauncherDynamicRule(sourceRules[i], i);
      if (!normalized) continue;
      if (!normalized.action) continue;
      dynamicRules.push(normalized);
    }
    dynamicRules.sort((a, b) => {
      const pDiff = toNum(b.priority, 0) - toNum(a.priority, 0);
      if (pDiff !== 0) return pDiff;
      return String(a.id).localeCompare(String(b.id));
    });
    return {
      variant,
      iconText,
      text,
      hideLabelWhenEmpty: toBool(raw.hideLabelWhenEmpty, false),
      widthPx,
      heightPx,
      bgColor: toText(raw.bgColor || "").trim(),
      textColor: toText(raw.textColor || "").trim(),
      iconBgColor: toText(raw.iconBgColor || "").trim(),
      iconTextColor: toText(raw.iconTextColor || "").trim(),
      borderColor: toText(raw.borderColor || "").trim(),
      shadow: toText(raw.shadow || "").trim(),
      clickAction,
      anchorTarget,
      anchorBehavior,
      anchorBlock,
      anchorOffsetPx,
      dynamic: {
        enabled: dynamicRules.length > 0 && toBool(dynamicRaw.enabled, false),
        resetOnNoMatch: toBool(dynamicRaw.resetOnNoMatch, true),
        transitionMs: clamp(Math.round(toNum(dynamicRaw.transitionMs, 220)), 80, 1200),
        rules: dynamicRules
      }
    };
  })();
  const INLINE_ANCHOR_BUTTON = (() => {
    const behavior = CFG.behavior && typeof CFG.behavior === "object" ? CFG.behavior : {};
    const raw = behavior.inlineAnchorButton && typeof behavior.inlineAnchorButton === "object"
      ? behavior.inlineAnchorButton
      : (CFG.inlineAnchorButton && typeof CFG.inlineAnchorButton === "object" ? CFG.inlineAnchorButton : {});
    const legacyAnchorMode = !INLINE && FLOAT_LAUNCHER.clickAction === "anchor";
    const enabled = !INLINE && toBool(raw.enabled, legacyAnchorMode);
    const anchorTarget = toText(
      raw.anchorTarget ||
      raw.anchorSelector ||
      raw.anchorId ||
      raw.target ||
      FLOAT_LAUNCHER.anchorTarget ||
      ""
    ).trim();
    const anchorBehaviorRaw = normToken(raw.anchorBehavior || raw.scrollBehavior || raw.behavior || "");
    const anchorBehavior = anchorBehaviorRaw === "auto" ? "auto" : "smooth";
    const anchorBlockRaw = normToken(raw.anchorBlock || raw.scrollBlock || raw.block || "");
    const anchorBlock = ["start", "center", "end", "nearest"].includes(anchorBlockRaw) ? anchorBlockRaw : "start";
    const anchorOffsetPx = clamp(
      Math.round(toNum(raw.anchorOffsetPx ?? raw.offsetPx, FLOAT_LAUNCHER.anchorOffsetPx || 0)),
      -5000,
      5000
    );
    const label = toText(raw.label || raw.text || "").trim();
    return {
      enabled,
      anchorTarget,
      anchorBehavior,
      anchorBlock,
      anchorOffsetPx,
      label
    };
  })();
  const WELCOME  = CFG.welcome || "Hi! How can I help?";
  const LANG     = CFG.lang || "en";
  const AUTOSTART   = CFG.autostart === true;
  const AUTO_DELAY  = Math.max(0, (CFG.autostartDelay ?? 5000));
  const AUTO_MODE   = (CFG.autostartMode ?? "local").toLowerCase();
  const AUTO_MSG    = CFG.autostartMessage || "";
  const AUTO_PROMPT = CFG.autostartPrompt || "";
  const AUTO_COOLDOWN_HOURS = Math.max(0, (CFG.autostartCooldownHours ?? 12));
  const INLINE_AUTOSTART_CFG = CFG.inlineAutostart || null;
  const USER_INTERACTED_KEY = `aiw:userInteracted:session:${SITE_ID}`;
  const IDLE_DEMO_LOOP_GAP_MS = 1500;
  const IDLE_DEMO_BADGE_TEXT = "Example conversation";
let showWelcomeHint = true;
const PRESERVE_HISTORY   = HYBRID_HISTORY_SYNC ? true : (INLINE ? true : (CFG.preserveHistory !== false));
const RESET_HISTORY_ON_OPEN = !INLINE && CFG.resetHistoryOnOpen === true;

const STORAGE = (() => {
  try {
    if ((INLINE || HYBRID_HISTORY_SYNC) && typeof sessionStorage !== "undefined") return sessionStorage;
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {}
  return null;
})();

// ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¿ ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â°Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°
const LOGO =
  CFG.logoUrl ||                              // ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â· loader'ÃƒÂÃ‚Â°
  (typeof CFG.logo === "string" ? CFG.logo :  // ÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¶ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚ÂºÃƒâ€˜Ã†â€™
   CFG.logo && CFG.logo.url) ||               // ÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¶ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã…Â ÃƒÂÃ‚ÂµÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â‚¬Å¡ { url }
  null;

const DEBUG = (CFG.debugAutostart === true) || /\baiwDebug=1\b/.test(location.search);
const log = (...a) => { if (DEBUG) console.debug("[AIW]", ...a); };
const launcherLog = (...a) => { console.log("[AIW][launcher]", ...a); };

log("CFG", {
  site: SITE_ID, AUTOSTART, AUTO_MODE, AUTO_DELAY, AUTO_COOLDOWN_HOURS,
  AUTO_MSG_len: (AUTO_MSG||"").length, preserveHistory: CFG.preserveHistory,
  resetHistoryOnOpen: RESET_HISTORY_ON_OPEN
});
launcherLog("boot", { siteId: SITE_ID, mode: MODE, inline: INLINE, renderMode: RENDER_MODE });

// Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ÃƒÂÃ‚Â° (Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â‚¬ËœÃƒÂÃ‚Â¼ÃƒÂÃ‚Â½ÃƒÂÃ‚Â°Ãƒâ€˜Ã‚Â) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â²Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Ëœ, Ãƒâ€˜Ã¢â‚¬Â¡Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¶ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾, ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬ËœÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â· Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â¶ÃƒÂÃ‚Âµ Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã†â€™Ãƒâ€˜Ã¢â‚¬Â°ÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â²Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã…Â½Ãƒâ€˜Ã¢â‚¬Â°ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Â¦ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¹ ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Å¾ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â³ÃƒÂÃ‚Â°
const THEME = {
  // Ãƒâ€˜Ã¢â‚¬Å¾ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â½ ÃƒÂÃ‚Â²Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂµÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾ inline-ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¶ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° / ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸
  bg: CFG.backgroundColor || "#0b0c0f",
  // ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â²ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¹ Ãƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚ÂºÃƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° (Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â°ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚Â, ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¸, ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒÂÃ‚Â°ÃƒÂÃ‚Â·ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¸)
  text: CFG.textColor || "#e5e7eb",
  // Ãƒâ€˜Ã¢â‚¬Å¾ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â½ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸Ãƒâ€˜Ã…Â½ Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â¶ÃƒÂÃ‚Âµ, ÃƒÂÃ‚ÂºÃƒÂÃ‚Â°ÃƒÂÃ‚Âº backgroundColor
  panel: CFG.backgroundColor || "#0f1318",
  // Ãƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â³Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Â  ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â½ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â»ÃƒÂÃ‚Â° borderColor, ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Å¡
  border: CFG.borderColor || ACCENT,
  // ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Å¡ (Ãƒâ€˜Ã¢â‚¬Â¦ÃƒÂÃ‚ÂµÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬, ÃƒÂÃ‚ÂºÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂºÃƒÂÃ‚Â° send, ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â»ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã…Â½Ãƒâ€˜Ã¢â‚¬Â°ÃƒÂÃ‚Â°Ãƒâ€˜Ã‚Â ÃƒÂÃ‚ÂºÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂºÃƒÂÃ‚Â°)
  accent: ACCENT,
  // Ãƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚ÂºÃƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° ÃƒÂÃ‚Â½ÃƒÂÃ‚Â° ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¼ Ãƒâ€˜Ã¢â‚¬Å¾ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â½ÃƒÂÃ‚Âµ (Ãƒâ€˜Ã¢â‚¬Â¦ÃƒÂÃ‚ÂµÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬, ÃƒÂÃ‚Â¸ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â½ÃƒÂÃ‚ÂºÃƒÂÃ‚Â° send, launcher)
  // ÃƒÂÃ‚ÂÃƒÂÃ…Â¾ÃƒÂÃ¢â‚¬â„¢ÃƒÂÃ‚Â«ÃƒÂÃ‚Â¥ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â² ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Å¾ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â³ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â½ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â½Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â¶ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬ËœÃƒÂÃ‚Â¼ textColor
  accentText: CFG.textColor || "#ffffff",
  // Ãƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â‚¬â‚¬Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾ Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬â€œ ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â²Ãƒâ€¹Ã‚Âµ ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â float ÃƒÂÃ‚Â¸ inline
  headerBg: CFG.headerBackgroundColor || CFG.backgroundColor || "#0f1318",
  headerText: CFG.headerTextColor || CFG.textColor || "#ffffff",
  bubbleAI: CFG.assistantBubbleColor || "rgba(255,255,255,.06)",
  bubbleUser: CFG.userBubbleColor || "#2b2f36",
  bubbleBorder: CFG.bubbleBorderColor || CFG.borderColor || "rgba(255,255,255,.08)",
  userText: CFG.userBubbleTextColor || CFG.textColor || "#ffffff",
  aiText: CFG.assistantBubbleTextColor || CFG.textColor || "#e5e7eb",
  inputBg: CFG.inputBackgroundColor || CFG.backgroundColor || "#0f1318",
  inputText: CFG.inputTextColor || CFG.textColor || "#e5e7eb",
  inputBorder: CFG.inputBorderColor || CFG.borderColor || ACCENT,
  sendBg: CFG.sendButtonBackgroundColor || CFG.borderColor || ACCENT,
  // Ãƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒÂÃ‚Â°ÃƒÂÃ‚Â·ÃƒÂÃ‚Â¾ÃƒÂÃ‚Âº
  time: "rgba(229,231,235,.6)"
};

function colorWithAlpha(color, alpha, fallback) {
  const a = clamp(toNum(alpha, 1), 0, 1);
  const safeFallback = toText(fallback).trim() || `rgba(0,0,0,${a})`;
  const raw = toText(color).trim();
  if (!raw) return safeFallback;

  const hex = raw.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const token = hex[1];
    let r = 0;
    let g = 0;
    let b = 0;
    if (token.length === 3 || token.length === 4) {
      r = parseInt(token[0] + token[0], 16);
      g = parseInt(token[1] + token[1], 16);
      b = parseInt(token[2] + token[2], 16);
    } else {
      r = parseInt(token.slice(0, 2), 16);
      g = parseInt(token.slice(2, 4), 16);
      b = parseInt(token.slice(4, 6), 16);
    }
    return `rgba(${r},${g},${b},${a})`;
  }

  const rgb = raw.match(/^rgba?\(\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/i);
  if (rgb) {
    const toChannel = (v) => {
      const token = String(v || "").trim();
      if (!token) return 0;
      if (token.endsWith("%")) return clamp(Math.round(parseFloat(token) * 2.55), 0, 255);
      return clamp(Math.round(parseFloat(token)), 0, 255);
    };
    const r = toChannel(rgb[1]);
    const g = toChannel(rgb[2]);
    const b = toChannel(rgb[3]);
    return `rgba(${r},${g},${b},${a})`;
  }

  return safeFallback;
}

const GLASS_BORDER_42 = colorWithAlpha(THEME.border, 0.42, "rgba(148,163,184,.42)");
const GLASS_BORDER_35 = colorWithAlpha(THEME.border, 0.35, "rgba(148,163,184,.35)");
const GLASS_BORDER_34 = colorWithAlpha(THEME.border, 0.34, "rgba(148,163,184,.34)");
const GLASS_BORDER_32 = colorWithAlpha(THEME.border, 0.32, "rgba(148,163,184,.32)");
const GLASS_BORDER_24 = colorWithAlpha(THEME.border, 0.24, "rgba(148,163,184,.24)");
const GLASS_BORDER_22 = colorWithAlpha(THEME.border, 0.22, "rgba(148,163,184,.22)");
const GLASS_BORDER_15 = colorWithAlpha(THEME.border, 0.15, "rgba(148,163,184,.15)");
const GLASS_ACCENT_00 = colorWithAlpha(THEME.accent, 0, "rgba(0,0,0,0)");
const GLASS_ACCENT_09 = colorWithAlpha(THEME.accent, 0.09, "rgba(37,99,235,.09)");
const GLASS_ACCENT_14 = colorWithAlpha(THEME.accent, 0.14, "rgba(37,99,235,.14)");
const GLASS_ACCENT_20 = colorWithAlpha(THEME.accent, 0.20, "rgba(37,99,235,.20)");
const GLASS_ACCENT_24 = colorWithAlpha(THEME.accent, 0.24, "rgba(37,99,235,.24)");
const GLASS_ACCENT_32 = colorWithAlpha(THEME.accent, 0.32, "rgba(37,99,235,.32)");
const GLASS_PANEL_TOP = colorWithAlpha(THEME.panel, 0.95, "rgba(9,12,18,.95)");
const GLASS_PANEL_BOTTOM = colorWithAlpha(THEME.bg, 0.97, "rgba(4,7,13,.97)");
const GLASS_PANEL_SOFT_TOP = colorWithAlpha(THEME.panel, 0.90, "rgba(15,23,42,.9)");
const GLASS_PANEL_SOFT_BOTTOM = colorWithAlpha(THEME.bg, 0.92, "rgba(2,6,23,.92)");
const GLASS_SURFACE_44 = colorWithAlpha(THEME.inputBg || THEME.panel, 0.44, "rgba(15,23,42,.44)");
const GLASS_INPUT_PLACEHOLDER = colorWithAlpha(THEME.inputText, 0.78, "rgba(203,213,225,.78)");

  let baseSize = Number(CFG.baseFontSize || 14);

  if (IS_MOBILE) {
    baseSize -= 2;      // Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¾ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Â¹ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ Ãƒâ€˜Ã¢â‚¬Â¡Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™ ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã…â€™Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚Âµ
  } else if (IS_TABLET) {
    baseSize -= 1;      // ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â»ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â‚¬Â¹ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¶ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â½ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã…â€™Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚Âµ
  }

  const BASE_FONT_SIZE = Math.max(
    10,
    Math.min(24, baseSize)
  );


console.debug("[AIW][cfg]", { AUTOSTART, AUTO_MODE, AUTO_DELAY, AUTO_COOLDOWN_HOURS, AUTO_MSG });

  const AUTO_KEY_SESSION = `aiw:autoGreet:session:${SITE_ID}`;
  const AUTO_KEY_LAST_TS = `aiw:autoGreet:lastTs:${SITE_ID}`;

// [AIW-LOGGING] identities + meta
function getVisitorId() {
  try {
    let v = localStorage.getItem("aiw:visitorId");
    if (!v) {
      v = (crypto?.randomUUID?.() || (Date.now() + ":" + Math.random().toString(16).slice(2)));
      localStorage.setItem("aiw:visitorId", v);
    }
    return v;
  } catch {
    return "anon-" + Date.now();
  }
}

function newSessionId() {
  return (crypto?.randomUUID?.() || (Date.now() + ":" + Math.random().toString(16).slice(2)));
}


// Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚Â·ÃƒÂÃ‚Â´ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬ËœÃƒÂÃ‚Â¼/ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â·Ãƒâ€˜Ã†â€™ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¾ÃƒÂÃ‚Â¸ÃƒÂÃ‚ÂºÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬Â¹
const VISITOR_ID = getVisitorId();
// Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â¸Ãƒâ€˜Ã…Â½ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚Â·ÃƒÂÃ‚Â´ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬ËœÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â·ÃƒÂÃ‚Â°ÃƒÂÃ‚Â³Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·ÃƒÂÃ‚ÂºÃƒÂÃ‚Âµ ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¶ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° (Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã‚Â ÃƒÂÃ‚ÂºÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¹ Reset)
let SESSION_ID = newSessionId();

// [AIW-LOGGING] Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â±ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â€šÂ¬ ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â´ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â‚¬Â¦ Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Â Ãƒâ€˜Ã¢â‚¬Â¹ ÃƒÂÃ‚Â¸ UTM
function collectMeta() {
  const url = new URL(location.href);
  const utm = {
    utm_source:  url.searchParams.get("utm_source"),
    utm_medium:  url.searchParams.get("utm_medium"),
    utm_campaign:url.searchParams.get("utm_campaign"),
    utm_term:    url.searchParams.get("utm_term"),
    utm_content: url.searchParams.get("utm_content"),
  };
  return {
    siteId: SITE_ID,
    visitorId: VISITOR_ID,
    sessionId: SESSION_ID,
    pageUrl: location.href,
    referrer: document.referrer || null,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    lang: LANG,
    utm
  };
}

  function isTabVisible() {
    return document.visibilityState === "visible";
  }

function alreadyInteracted() {
  try {
    return sessionStorage.getItem(USER_INTERACTED_KEY) === "1";
  } catch {
    return false;
  }
}

function markUserInteracted() {
  try {
    sessionStorage.setItem(USER_INTERACTED_KEY, "1");
  } catch {}
}

function shouldAutoGreetNow() {
  if (!AUTOSTART) { log("block: AUTOSTART=false"); return false; }
  const sess = sessionStorage.getItem(AUTO_KEY_SESSION);
  if (sess === "1") { log("block: session-flag set", { key: AUTO_KEY_SESSION }); return false; }
  if (!isTabVisible()) { log("block: tab not visible"); return false; }
  if (alreadyInteracted()) { log("block: alreadyInteracted (session)"); return false; }

  const lastTs = +(localStorage.getItem(AUTO_KEY_LAST_TS) || 0);
  const hoursPassed = (Date.now() - lastTs) / 36e5;
  if (hoursPassed < AUTO_COOLDOWN_HOURS) {
    log("block: cooldown", { lastTs, hoursPassed, AUTO_COOLDOWN_HOURS });
    return false;
  }

  log("shouldAutoGreetNow = true");
  return true;
}

function markAutoGreetUsed() {
  sessionStorage.setItem(AUTO_KEY_SESSION, "1");
  localStorage.setItem(AUTO_KEY_LAST_TS, String(Date.now()));
  log("markAutoGreetUsed()", {
    sessionKey: AUTO_KEY_SESSION,
    lastKey: AUTO_KEY_LAST_TS
  });
}

  // ---------- Utilities ----------
const storeKey = `aiw_hist_${SITE_ID}`;
let historySnapshot = "[]";
const HISTORY_SYNC_CHANNEL = (() => {
  if (!HYBRID_HISTORY_SYNC || typeof BroadcastChannel !== "function") return null;
  try { return new BroadcastChannel(`aiw:history:${SITE_ID}`); } catch { return null; }
})();

function historyToSnapshot(arr) {
  try {
    return JSON.stringify((Array.isArray(arr) ? arr : []).slice(-30));
  } catch {
    return "[]";
  }
}

function snapshotToHistory(snapshot) {
  try {
    const parsed = JSON.parse(snapshot || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const readHistory = () => {
  if (PRESERVE_HISTORY === false || !STORAGE) {
    historySnapshot = "[]";
    return [];
  }
  try {
    const rawSnapshot = STORAGE.getItem(storeKey) || "[]";
    const parsed = snapshotToHistory(rawSnapshot);
    historySnapshot = historyToSnapshot(parsed);
    return parsed;
  } catch {
    historySnapshot = "[]";
    return [];
  }
};

const writeHistory = (arr) => {
  const snapshot = historyToSnapshot(arr);
  historySnapshot = snapshot;
  if (PRESERVE_HISTORY !== false && STORAGE) {
    try {
      STORAGE.setItem(storeKey, snapshot);
    } catch {}
  }
  if (HYBRID_HISTORY_SYNC && HISTORY_SYNC_CHANNEL) {
    try {
      HISTORY_SYNC_CHANNEL.postMessage({
        type: "history:update",
        key: storeKey,
        snapshot,
        instanceId: INSTANCE_ID || "",
      });
    } catch {}
  }
  if (HYBRID_HISTORY_SYNC) {
    if (INLINE && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          {
            type: "aiw:history-sync",
            siteId: SITE_ID,
            instanceId: INSTANCE_ID || "",
            snapshot,
            source: "inline",
          },
          PARENT_ORIGIN || "*"
        );
      } catch {}
    } else if (!INLINE) {
      try {
        window.dispatchEvent(new CustomEvent("aiw:history-sync", {
          detail: {
            siteId: SITE_ID,
            instanceId: INSTANCE_ID || "",
            snapshot,
            source: "float",
          },
        }));
      } catch {}
    }
  }
};

if (PRESERVE_HISTORY === false && STORAGE) {
  try { STORAGE.removeItem(storeKey); } catch {}
}

const sanitize = (s) => (s || "").toString().slice(0, MAX_LEN);


  // ---------- DOM ----------
  const root = document.createElement("div");
 // host ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¶ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™ Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â½Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã‚Â ÃƒÂÃ‚Â½ÃƒÂÃ‚Â° ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã†â€™ iframe
 root.style.cssText = "display:block;";
  if (INLINE) {
    root.style.width = "100%";
    root.style.maxWidth = "100%";
  }
  if (FILL_CONTAINER) {
    root.style.height = "100%";
    root.style.minHeight = "0";
    root.style.flex = "1 1 auto";
  }
  const shadow = root.attachShadow({ mode: "open" });

  // styles (Shadow DOM)
const style = document.createElement("style");

  if (FONT_CSS_URL) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_CSS_URL;
    shadow.appendChild(link);
  }

style.textContent = `
 ${FONT_FILE_URL && EFFECTIVE_FONT_NAME ? `
 @font-face {
   font-family: '${EFFECTIVE_FONT_NAME}';
   src: url('${FONT_FILE_URL}') format('truetype');
   font-weight: 400;
   font-style: normal;
   font-display: swap;
 }
 ` : ""}
 
 :host {
   all: initial;
   display:block;
   ${INLINE ? "width:100%;" : ""}
   ${FILL_CONTAINER ? "height:100%; min-height:0;" : "height:auto;"}
 }

 @keyframes aiw-bounce {
   0%,80%,100%{transform:scale(.6);opacity:.45}
   40%{transform:scale(1);opacity:1}
 }

@keyframes aiw-pill-live-dot {
  0% { box-shadow:0 0 0 0 rgba(34,197,94,.38); opacity:.95; }
  70% { box-shadow:0 0 0 10px rgba(34,197,94,0); opacity:.55; }
  100% { box-shadow:0 0 0 0 rgba(34,197,94,0); opacity:.95; }
}

 .aiw-wrap{
   position:fixed;
   z-index:2147483000;
   bottom:20px;
 }

.aiw-btn{
  width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;
  box-shadow:0 8px 20px rgba(0,0,0,.2);
  background:${THEME.accent};
  color:${THEME.accentText};
  font-weight:700;font-size:16px;
  font-family:${BASE_FONT_STACK};
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:0;
  transition:
    background-color var(--aiw-pill-transition-ms, 220ms) ease,
    color var(--aiw-pill-transition-ms, 220ms) ease,
    border-color var(--aiw-pill-transition-ms, 220ms) ease,
    box-shadow var(--aiw-pill-transition-ms, 220ms) ease,
    width var(--aiw-pill-transition-ms, 220ms) ease,
    height var(--aiw-pill-transition-ms, 220ms) ease,
    transform var(--aiw-pill-transition-ms, 220ms) ease;
}

.aiw-btn.aiw-btn-pill{
  width:min(var(--aiw-pill-width, 420px), 92vw);
  height:var(--aiw-pill-height, 56px);
  border-radius:999px;
  border:1px solid var(--aiw-pill-border, rgba(16,18,22,.18));
  background:var(--aiw-pill-bg, #ffffff);
  color:var(--aiw-pill-text, #101216);
  box-shadow:var(--aiw-pill-shadow, 0 8px 20px rgba(0,0,0,.2));
  padding:0 16px 0 10px;
  gap:10px;
  justify-content:flex-start;
  font-weight:600;
  font-size:16px;
  transition:
    background-color var(--aiw-pill-transition-ms, 220ms) ease,
    color var(--aiw-pill-transition-ms, 220ms) ease,
    border-color var(--aiw-pill-transition-ms, 220ms) ease,
    box-shadow var(--aiw-pill-transition-ms, 220ms) ease,
    width var(--aiw-pill-transition-ms, 220ms) ease,
    height var(--aiw-pill-transition-ms, 220ms) ease,
    padding var(--aiw-pill-transition-ms, 220ms) ease,
    gap var(--aiw-pill-transition-ms, 220ms) ease;
}

.aiw-btn.aiw-btn-pill.aiw-btn-pill-compact{
  padding:0 10px;
  gap:0;
  justify-content:flex-start;
}

.aiw-btn.aiw-btn-pill .aiw-btn-icon{
  min-width:46px;
  height:30px;
  border-radius:999px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  background:var(--aiw-pill-icon-bg, #0f1217);
  color:var(--aiw-pill-icon-text, #ffffff);
  font-weight:700;
  font-size:14px;
  letter-spacing:.01em;
  padding:0 7px;
  box-sizing:border-box;
  white-space:nowrap;
  line-height:1;
  overflow:hidden;
  transition:
    background-color var(--aiw-pill-transition-ms, 220ms) ease,
    color var(--aiw-pill-transition-ms, 220ms) ease,
    min-width var(--aiw-pill-transition-ms, 220ms) ease,
    height var(--aiw-pill-transition-ms, 220ms) ease;
}

.aiw-btn.aiw-btn-pill .aiw-btn-label{
  display:block;
  min-width:0;
  max-width:100%;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  line-height:1.2;
  font-weight:600;
  font-size:22px;
  transition:
    color var(--aiw-pill-transition-ms, 220ms) ease,
    font-size var(--aiw-pill-transition-ms, 220ms) ease,
    max-width var(--aiw-pill-transition-ms, 220ms) ease,
    opacity var(--aiw-pill-transition-ms, 220ms) ease,
    transform var(--aiw-pill-transition-ms, 220ms) ease;
}

.aiw-btn.aiw-btn-pill .aiw-btn-label.aiw-btn-label-exit{
  opacity:0;
  transform:translateY(2px);
  max-width:0;
}

.aiw-btn.aiw-btn-open{
  transform:translateY(0);
}

.aiw-btn.aiw-btn-closed,
.aiw-btn.aiw-btn-open{
  position:relative;
}

.aiw-btn.aiw-btn-closed:hover,
.aiw-btn.aiw-btn-open:hover{
  transform:translateY(-1px);
}

.aiw-btn.aiw-btn-closed:active,
.aiw-btn.aiw-btn-open:active{
  transform:translateY(0);
}

.aiw-btn.aiw-btn-closed:focus-visible,  
.aiw-btn.aiw-btn-open:focus-visible{
  outline:2px solid rgba(37,99,235,.45);
  outline-offset:3px;
}

.aiw-btn.aiw-btn-pill.aiw-btn-closed,
.aiw-btn.aiw-btn-pill.aiw-btn-open{
  width:min(var(--aiw-pill-width, 268px), 92vw);
  padding:0 22px 0 8px;
  gap:10px;
  border-color:var(--aiw-pill-border, rgba(16,18,22,.12));
  box-shadow:
    var(--aiw-pill-shadow, 0 10px 24px rgba(15,23,42,.16)),
    inset 0 1px 0 rgba(255,255,255,.86);
  backdrop-filter:blur(8px);
  justify-content:flex-start;
}

.aiw-btn.aiw-btn-pill.aiw-btn-closed .aiw-btn-icon,
.aiw-btn.aiw-btn-pill.aiw-btn-open .aiw-btn-icon{
  min-width:42px;
  width:42px;
  height:42px;
  border-radius:14px;
  padding:0;
  font-size:16px;
  box-shadow:0 6px 14px rgba(15,23,42,.22);
}

.aiw-btn.aiw-btn-pill.aiw-btn-closed .aiw-btn-label,
.aiw-btn.aiw-btn-pill.aiw-btn-open .aiw-btn-label{
  display:block;
  font-size:16px;
  font-weight:600;
  letter-spacing:-.01em;
  line-height:1.1;
  max-width:calc(100% - 70px);
}

.aiw-btn.aiw-btn-pill.aiw-btn-pill-compact.aiw-btn-closed,
.aiw-btn.aiw-btn-pill.aiw-btn-pill-compact.aiw-btn-open{
  padding:0 22px 0 8px;
}

.aiw-btn.aiw-btn-pill.aiw-btn-pill-compact.aiw-btn-closed .aiw-btn-icon,
.aiw-btn.aiw-btn-pill.aiw-btn-pill-compact.aiw-btn-open .aiw-btn-icon{
  min-width:42px;
  width:42px;
  height:42px;
}

.aiw-btn.aiw-btn-pill.aiw-btn-closed::after,
.aiw-btn.aiw-btn-pill.aiw-btn-open::after{
  content:"";
  position:absolute;
  right:9px;
  top:50%;
  width:10px;
  height:10px;
  margin-top:-5px;
  border-radius:50%;
  background:#000000;
  box-shadow:0 0 0 0 rgba(34,197,94,.38);
  animation:aiw-pill-live-dot 2.2s ease-out infinite;
  pointer-events:none;
}

@media (prefers-reduced-motion: reduce) {
  .aiw-btn.aiw-btn-pill.aiw-btn-closed::after,
  .aiw-btn.aiw-btn-pill.aiw-btn-open::after { animation:none; }
}

 .aiw-panel{
   position:absolute;
   bottom:70px;
   width:360px;
   max-width:80vw;
   height:480px;
   max-height:70vh;
   display:none;
   flex-direction:column;
   background:${THEME.panel};
   color:${THEME.text};
   border-radius:16px;
   overflow:hidden;
   box-shadow:0 14px 44px rgba(0,0,0,.25);
   border:1px solid ${THEME.border}22;
 }

.aiw-header-brand{
  display:flex;
  align-items:center;
  gap:8px;
}
  .aiw-header-title{
    display:flex;
    align-items:center;
    gap:8px;
  }

  .aiw-header-title-text{
    font-weight:700;
  }
    
  .aiw-beta-badge{
    display:inline-flex;
    align-items:center;

    /* ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã…â€™Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¹ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¶ */
    padding:1px 5px;
    border-radius:9999px;
    border:1px solid rgba(255,255,255,0.28);
    background:rgba(255,255,255,0.08);

    /* ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã…â€™Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚Âµ Ãƒâ€˜Ã‹â€ Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¾Ãƒâ€˜Ã¢â‚¬Å¡, ÃƒÂÃ‚ÂºÃƒÂÃ‚Â°ÃƒÂÃ‚Âº ÃƒÂÃ‚Â² Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¾ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Âµ */
    font-size:8px;
    letter-spacing:0.08em;
    text-transform:uppercase;
    color:${THEME.headerText};
    white-space:nowrap;
    line-height:1;

    opacity:0;
    /* Ãƒâ€˜Ã¢â‚¬Â¡Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™ ÃƒÂÃ‚Â±ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒÂÃ‚Âµ ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒÂÃ‚Â´ÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â²ÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚Âµ */
    animation: aiw-badge-fade 1.1s ease-out .35s forwards;

    /* ÃƒÂÃ‚Â½ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾ ÃƒÂÃ…Â¸ÃƒÂÃ…Â¾ÃƒÂÃ¢â‚¬â„¢ÃƒÂÃ‚Â«ÃƒÂÃ‚Â¨ÃƒÂÃ¢â‚¬Â¢ ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚ÂºÃƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° */
    transform:translateY(-1px);
  }

  @keyframes aiw-badge-fade{
    from{
      opacity:0;
      transform:translateY(-4px);
    }
    to{
      opacity:1;
      transform:translateY(-1px);
    }
  }



.aiw-header-logo{
  width:24px;
  height:24px;
  border-radius:9999px;
  overflow:hidden;
  background:rgba(0,0,0,.25);
  border:1px solid rgba(255,255,255,.3);
  flex:0 0 24px;
}

.aiw-header-logo img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}

.aiw-header .aiw-actions{
  display:flex;
  align-items:center;
  gap:8px;
}

.aiw-header button{
  background:transparent;
  border:none;
  color:${THEME.headerText};
  font-size:18px;
  cursor:pointer;
}
.aiw-header{
  padding:12px 16px;
  background:${THEME.headerBg};
  color:${THEME.headerText};
  font-weight:700;
  display:flex;
  align-items:center;
  justify-content:space-between;
    font-family:${BASE_FONT_STACK};
  font-size:${BASE_FONT_SIZE + 1}px;
}
.aiw-header .aiw-actions{
  display:flex;
  align-items:center;
  gap:8px;
}
.aiw-header button{
  background:transparent;
  border:none;
  color:${THEME.headerText};
  font-size:18px;
  cursor:pointer;
}

.aiw-fs-toggle{
  width:34px;
  height:34px;
  border-radius:12px !important;
  border:none !important;
  background:transparent !important;
  color:#dbe4f0 !important;
  display:inline-flex !important;
  align-items:center;
  justify-content:center;
  padding:0 !important;
  line-height:1;
  transition:background-color .15s ease, box-shadow .15s ease, color .15s ease;
}

.aiw-fs-toggle:hover{
  background:rgba(255,255,255,.14) !important;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);
  color:#ffffff !important;
}

.aiw-fs-toggle:active{
  background:rgba(255,255,255,.2) !important;
}

.aiw-fs-toggle:focus-visible{
  outline:2px solid rgba(148,163,184,.45);
  outline-offset:1px;
}

.aiw-fs-toggle svg{
  width:16px;
  height:16px;
  display:block;
  stroke:currentColor;
  fill:none;
  stroke-width:1.8;
  stroke-linecap:round;
  stroke-linejoin:round;
}

.aiw-panel.aiw-panel-fullscreen{
  border-radius:0 !important;
  border-width:0 !important;
}

${!INLINE ? `
.aiw-wrap.aiw-wrap-fullscreen{
  top:0 !important;
  right:0 !important;
  bottom:0 !important;
  left:0 !important;
  width:100vw !important;
  height:100vh !important;
  height:100dvh !important;
  transform:none !important;
  z-index:2147483646 !important;
}

.aiw-wrap.aiw-wrap-fullscreen .aiw-panel.aiw-panel-fullscreen{
  position:absolute !important;
  top:0 !important;
  right:0 !important;
  bottom:0 !important;
  left:0 !important;
  width:100% !important;
  max-width:100% !important;
  height:100% !important;
  max-height:100% !important;
  transform:none !important;
  margin:0 !important;
}

.aiw-wrap.aiw-wrap-fullscreen .aiw-header{
  padding:calc(14px + env(safe-area-inset-top)) 24px 14px;
  background:${THEME.headerBg};
  color:${THEME.headerText};
  border-bottom:1px solid ${THEME.border};
}

.aiw-wrap.aiw-wrap-fullscreen .aiw-body{
  padding:24px 24px 14px;
  background:${THEME.bg};
}

.aiw-wrap.aiw-wrap-fullscreen .aiw-footer{
  padding:20px 24px calc(20px + env(safe-area-inset-bottom));
  border-top:none;
  background:${THEME.bg};
  justify-content:stretch;
}

.aiw-wrap.aiw-wrap-fullscreen .aiw-footer-meta{
  display:none !important;
}

.aiw-wrap.aiw-wrap-fullscreen .aiw-input-wrap{
  flex:1 1 auto;
  width:100%;
  max-width:none;
  margin:0;
  border-radius:9999px;
}

.aiw-wrap.aiw-wrap-fullscreen .aiw-input{
  padding:12px 60px 12px 16px;
}

.aiw-wrap.aiw-wrap-fullscreen .aiw-send{
  right:12px;
  width:40px;
  height:40px;
  box-shadow:none;
}

.aiw-wrap.aiw-wrap-fullscreen .aiw-close-btn{
  display:none;
}
` : ""}

.aiw-panel.aiw-panel-fullscreen .aiw-header{
  padding-top:calc(12px + env(safe-area-inset-top));
}

.aiw-panel.aiw-panel-fullscreen .aiw-footer{
  padding-bottom:calc(20px + env(safe-area-inset-bottom));
}

.aiw-footer{
  position:relative;                   
  padding:10px 16px;
  border-top:1px solid ${THEME.bubbleBorder};
  display:flex;
  align-items:center;
  background:${THEME.panel};

  --aiw-input-min-h: 44px; /* 1 Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚ÂºÃƒÂÃ‚Â° */
  --aiw-input-max-h: 92px; /* ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¾ ~3 Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚Âº */
}

.aiw-footer-meta{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:4px 16px 10px;
  font-size:11px;
  color:${THEME.time};
}

.aiw-char-counter{
  flex:0 0 auto;
}
.aiw-body{
  display:flex;
  flex-direction:column;
  flex:1;
  gap:8px;
  padding:12px;
  overflow:auto;
  min-height:0;
    font-family:${BASE_FONT_STACK};
  font-size:${BASE_FONT_SIZE}px;
  background:${THEME.panel};

  scrollbar-width:thin;
  scrollbar-color:${THEME.bubbleBorder} transparent;
}

.aiw-body::-webkit-scrollbar{
  width:8px;
}

/* ===== textarea scrollbar (ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³ÃƒÂÃ‚Â´ÃƒÂÃ‚Â° overflow-y:auto) ===== */
.aiw-input{
  scrollbar-width: none;          /* Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã†â€™ */
}

.aiw-input::-webkit-scrollbar{
  width: 0px;
  height: 0px;
}
.aiw-input::-webkit-scrollbar-thumb{
  background: transparent;
}
.aiw-input::-webkit-scrollbar-track{
  background: transparent;
}

.aiw-body::-webkit-scrollbar-track{
  background:transparent;
}

.aiw-body::-webkit-scrollbar-thumb{
  background:${THEME.bubbleBorder};
  border-radius:4px;
}

${(INLINE && IS_IOS) ? `
/* iOS momentum scroll for inline */
.aiw-body{
  -webkit-overflow-scrolling: touch;
}
.aiw-input{
  -webkit-overflow-scrolling: touch;
}
` : ""}

.aiw-typing-bubble{
  align-self:flex-start;
  margin-top:8px;
  padding:6px 10px;
  border-radius:9999px;
  background:${THEME.bubbleAI};
  color:${THEME.aiText};
  display:flex;
  align-items:center;
  opacity:.8;
}
.aiw-typing-bubble.me{
  align-self:flex-end;
  background:${THEME.bubbleAI};
  color:${THEME.aiText};
}
.aiw-typing-bubble.ai{
  align-self:flex-start;
  background:${THEME.bubbleAI};
  color:${THEME.aiText};
}

.aiw-typing-dots{
  display:flex;
  gap:4px;
}

.aiw-typing-dot{
  width:6px;
  height:6px;
  border-radius:50%;
  background:${THEME.text};
  opacity:.4;
  animation: aiw-dot 1s infinite ease-in-out;
}

/* ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚Â Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Âº */
@keyframes aiw-dot{
  0%, 80%, 100%{
    transform:scale(.6);
    opacity:.3;
  }
  40%{
    transform:scale(1);
    opacity:1;
  }
}

.aiw-row{
  display:flex;
  gap:8px;
}
  .aiw-row + .aiw-row{
  margin-top:12px;
}

.aiw-row.me + .aiw-row.ai,
.aiw-row.ai + .aiw-row.me{
  margin-top:16px;
}

.aiw-row.me{ justify-content:flex-end; }

.aiw-ava{
  width:26px;
  height:26px;
  flex:0 0 26px;
  border-radius:50%;
  border:1px solid ${THEME.bubbleBorder};
  overflow:hidden;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:12px;
  font-weight:600;
    font-family:${BASE_FONT_STACK};
}

/* ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â€šÂ¬ ÃƒÂÃ‚Â°Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° */
.aiw-ava.ai{
  background:${THEME.bubbleAI};
  color:${THEME.aiText};
}

/* ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â€šÂ¬ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â·ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â */
.aiw-ava.me{
  background:${THEME.bubbleUser};
  color:${THEME.userText};
}

.aiw-ava img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}


.aiw-bubble{
  max-width:85%;
  padding:10px 12px;
  border-radius:12px;
   white-space:normal;
  word-break:break-word;
  border:1px solid transparent;
  box-shadow:0 1px 0 rgba(0,0,0,.2);
    line-height:1.5; 
}

.aiw-h1{ font-size:1.15em; font-weight:800; margin:6px 0 4px; }
.aiw-h2{ font-size:1.08em; font-weight:800; margin:6px 0 4px; }
.aiw-h3{ font-size:1.02em; font-weight:800; margin:6px 0 4px; }

.aiw-bubble a {
  color: ${THEME.accent};
  text-decoration: underline;
  word-break: break-all;
}

.aiw-bubble a:hover {
  text-decoration: none;
}
  
.aiw-row.me .aiw-bubble{
  background:${THEME.bubbleUser};
  color:${THEME.userText};
  border-color:transparent;
}

.aiw-row.ai .aiw-bubble{
  background:${THEME.bubbleAI};
  color:${THEME.aiText};
  border-color:${THEME.bubbleBorder};
}
  .aiw-bubble-wrap{
  display:flex;
  flex-direction:column;
  max-width:85%;
}

.aiw-time{
  margin-top:4px;
  font-size:11px;
  color:${THEME.time};
}

/* ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â°ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â°Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼Ãƒâ€˜Ã‚Â Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒÂÃ‚Â²ÃƒÂÃ‚Â° ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬ËœÃƒÂÃ‚Â¼ */
.aiw-row.ai .aiw-bubble-wrap{
  align-items:flex-start;
}

/* ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â°ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â·ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼Ãƒâ€˜Ã‚Â Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â° ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬ËœÃƒÂÃ‚Â¼ */
.aiw-row.me .aiw-bubble-wrap{
  align-items:flex-end;
}



/* textarea autosize */
/* wrapper ÃƒÂÃ‚ÂºÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â» ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â³ÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸Ãƒâ€˜Ã…Â½ */
.aiw-input-wrap{
  position: relative;
  flex: 1 1 auto;
  border-radius: 12px;
  overflow: hidden;                 /* <-- ÃƒÂÃ‚Â³ÃƒÂÃ‚Â»ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Âµ: Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â» ÃƒÂÃ‚Â½ÃƒÂÃ‚Âµ "ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â»ÃƒÂÃ‚Â°ÃƒÂÃ‚Â·ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡" */
  border: 1px solid ${THEME.inputBorder};
  background: ${THEME.inputBg};
  box-sizing: border-box;
}

/* textarea autosize */
.aiw-input {
  width: 100%;
  display: block;

  resize: none;
  border: none;                     /* Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂºÃƒÂÃ‚Â° ÃƒÂÃ‚Â½ÃƒÂÃ‚Â° wrapper */
  background: transparent;          /* Ãƒâ€˜Ã¢â‚¬Å¾ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â½ ÃƒÂÃ‚Â½ÃƒÂÃ‚Â° wrapper */
  color: ${THEME.inputText};
  outline: none;
  box-sizing: border-box;

  font-family: ${BASE_FONT_STACK};
  font-size: ${BASE_FONT_SIZE}px;

  /* ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¶ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼ */
  line-height: 1.35;

  /* autosize: Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â‚¬ËœÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ min ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¾ max */
  height: auto;
  min-height: var(--aiw-input-min-h);
  max-height: var(--aiw-input-max-h);

  /* ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â°ÃƒÂÃ‚Â´ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¸ (ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ ÃƒÂÃ‚ÂºÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂºÃƒâ€˜Ã†â€™ ÃƒÂÃ‚Â² float Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°) */
  padding: 10px 52px 10px 16px;

  /* ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¾ max ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂµÃƒÂÃ‚Â· Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â»ÃƒÂÃ‚Â°, ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚Âµ max ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂºÃƒÂÃ‚Â»Ãƒâ€˜Ã…Â½Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼ Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â· JS */
  overflow-y: hidden;
}


/* ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â‚¬Â¹ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸Ãƒâ€˜Ã…Â½ (desktop) */
.aiw-footer{
  --aiw-input-min-h: 44px;  /* 1 Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚ÂºÃƒÂÃ‚Â° */
  --aiw-input-max-h: 68px;  /* ~2 Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¸ */
}



.aiw-send {
  position:absolute;
  right:24px;
  top:50%;
  transform:translateY(-50%);
  width:32px;              
  height:32px;  
  border:none;
  border-radius:9999px;

  background:${THEME.sendBg};
  color:${THEME.accentText};

  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  flex:none;
  font-family:${BASE_FONT_STACK};
  box-shadow:0 4px 12px rgba(0,0,0,.35);
}

.aiw-send-icon {
  width: 42%;
  height: 42%;
  display: block;
}


.aiw-send:disabled{
  opacity:.6;
  cursor:default;
}

${!INLINE ? `
@keyframes aiw-clean-pop {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes aiw-clean-pop-center {
  from {
    opacity: 0;
    transform: translate(-50%, 8px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.aiw-btn:not(.aiw-btn-pill){
  border:1px solid ${THEME.border};
  background:${THEME.bg};
  color:${THEME.headerText};
  box-shadow:0 10px 22px rgba(0,0,0,.24);
}

.aiw-btn.aiw-btn-pill.aiw-btn-closed,
.aiw-btn.aiw-btn-pill.aiw-btn-open{
  border-color:var(--aiw-pill-border, ${THEME.border});
  background:var(--aiw-pill-bg, #ffffff);
  color:var(--aiw-pill-text, #000000);
  box-shadow:var(--aiw-pill-shadow, 0 10px 24px rgba(0,0,0,.24));
  backdrop-filter:none;
}

.aiw-btn.aiw-btn-pill.aiw-btn-closed .aiw-btn-icon,
.aiw-btn.aiw-btn-pill.aiw-btn-open .aiw-btn-icon{
  background:var(--aiw-pill-icon-bg, #000000);
  color:var(--aiw-pill-icon-text, #ffffff);
  box-shadow:none;
}

.aiw-btn.aiw-btn-pill.aiw-btn-closed::after,
.aiw-btn.aiw-btn-pill.aiw-btn-open::after{
  background:#000000;
  box-shadow:0 0 0 0 ${colorWithAlpha(THEME.headerText, 0.28, "rgba(255,255,255,.28)")};
}

.aiw-panel{
  width:min(392px, 86vw);
  height:min(620px, 76vh);
  max-height:76vh;
  border-radius:24px;
  border:1px solid ${THEME.border};
  background:${THEME.bg};
  box-shadow:0 20px 56px rgba(0,0,0,.28);
  animation:aiw-clean-pop .18s ease-out;
  transform-origin:100% 100%;
  color:${THEME.text};
}

.aiw-panel.aiw-panel-center{
  animation:aiw-clean-pop-center .18s ease-out;
  transform-origin:50% 100%;
}

.aiw-header{
  padding:14px 16px;
  background:${THEME.headerBg};
  border-bottom:1px solid ${THEME.border};
  color:${THEME.headerText};
}

.aiw-header-title-text{
  font-weight:650;
  letter-spacing:.01em;
  color:${THEME.headerText};
}

.aiw-header-logo{
  width:28px;
  height:28px;
  flex:0 0 28px;
  background:${colorWithAlpha(THEME.headerText, 0.12, "rgba(255,255,255,.12)")};
  border:1px solid ${THEME.border};
}

.aiw-header button{
  width:32px;
  height:32px;
  border-radius:8px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  color:${THEME.headerText};
}

.aiw-close-btn{
  padding:0;
}

.aiw-close-btn svg{
  width:16px;
  height:16px;
  display:block;
  stroke:currentColor;
  fill:none;
  stroke-width:1.8;
  stroke-linecap:round;
  stroke-linejoin:round;
}

.aiw-header button:hover{
  background:${colorWithAlpha(THEME.border, 0.2, "rgba(255,255,255,.12)")};
}

.aiw-header .aiw-fs-toggle{
  color:${THEME.headerText} !important;
}

.aiw-header .aiw-fs-toggle:hover{
  color:${THEME.headerText} !important;
  background:${colorWithAlpha(THEME.border, 0.22, "rgba(255,255,255,.14)")} !important;
  box-shadow:none !important;
}

.aiw-header .aiw-fs-toggle:active{
  color:${THEME.headerText} !important;
  background:${colorWithAlpha(THEME.border, 0.3, "rgba(255,255,255,.2)")} !important;
}

.aiw-beta-badge{
  border-color:${THEME.border};
  background:${colorWithAlpha(THEME.headerText, 0.08, "rgba(255,255,255,.08)")};
  color:${colorWithAlpha(THEME.headerText, 0.8, "rgba(255,255,255,.8)")};
}

.aiw-body{
  padding:14px 14px 10px;
  background:${THEME.bg};
  color:${THEME.text};
}

.aiw-ava{
  display:none;
}

.aiw-time{
  display:none;
}

.aiw-bubble{
  border-radius:16px;
  box-shadow:none;
}

.aiw-row.ai .aiw-bubble{
  background:${THEME.bubbleAI};
  color:${THEME.aiText};
  border-color:${THEME.bubbleBorder};
}

.aiw-row.me .aiw-bubble{
  background:${THEME.bubbleUser};
  color:${THEME.userText};
  border-color:transparent;
}

.aiw-footer{
  padding:12px 14px;
  background:${THEME.bg};
  border-top:none;
}

.aiw-footer-meta{
  padding:4px 14px 10px;
}

.aiw-input-wrap{
  border-radius:9999px;
  border-color:${THEME.inputBorder};
  background:${THEME.inputBg};
  box-shadow:none;
}

.aiw-input{
  padding:12px 60px 12px 16px;
  color:${THEME.inputText};
}

.aiw-input::placeholder{
  color:${colorWithAlpha(THEME.inputText, 0.75, "rgba(249,250,251,.75)")};
}

.aiw-send{
  right:12px;
  width:40px;
  height:40px;
  background:${THEME.sendBg};
  box-shadow:none;
}
` : ""}


 ${FILL_CONTAINER ? `
 .aiw-wrap {
   position: relative;
   top: auto;
   right: auto;
   bottom: auto;
   left: auto;
   width: 100%;
   height: 100%;
   min-height: 0;
   display: flex;
   flex-direction: column;
 }
 .aiw-panel {
   position: relative;
   top: auto;
   right: auto;
   bottom: auto;
   left: auto;
   width: 100%;
   max-width: 100%;
   height: 100%;
   max-height: 100%;
   display: flex;
   flex: 1 1 auto;
   min-height: 0;
 }
 .aiw-body { flex: 1 1 auto; min-height: 0; }
 .aiw-footer { flex: 0 0 auto; }
 ` : ""}

 /* INLINE overrides ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ ÃƒÂÃ‚ÂºÃƒÂÃ‚Â°ÃƒÂÃ‚Âº ÃƒÂÃ‚Â½ÃƒÂÃ‚Â° ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂºÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Âµ, ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ Ãƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â· THEME */
${INLINE ? `
  .aiw-wrap {
    position: relative !important;
    inset: auto !important;
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;

    /* Ãƒâ€˜Ã¢â‚¬Â¡Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â¹ ÃƒÂÃ‚Â½ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾ Ãƒâ€šÃ‚Â«ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾Ãƒâ€šÃ‚Â» ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¼ÃƒÂÃ‚Â¾Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚ÂºÃƒÂÃ‚Â° ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¾ÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â³ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ */
    background: transparent !important;

    display:flex;
    align-items:stretch;
  }

.aiw-panel {
  position: relative !important;
  inset: auto !important;
  width: 100% !important;
  max-width: 100% !important;
  height: 100% !important;
  max-height: 100% !important;

  display:flex !important;
  flex-direction:column;

  box-sizing: border-box;
  border: 1px solid ${THEME.border} !important;
  border-radius: 24px !important;
  overflow: hidden;
  box-shadow: none !important;
  background:${THEME.bg};
}



  /* HEADER + ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒÂÃ‚Â° ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â¹Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¼ = borderColor */
  .aiw-header {
    background: ${THEME.headerBg} !important;
    color: ${THEME.headerText} !important;
    border-bottom: 1px solid ${THEME.border};
    padding: 12px 24px;
  }

  .aiw-header-brand {
    gap: 10px;
  }

  /* ÃƒÂÃ‚Â§ÃƒÂÃ‚ÂÃƒÂÃ‚Â¢-ÃƒÂÃ…Â¾ÃƒÂÃ¢â‚¬ËœÃƒÂÃ¢â‚¬ÂºÃƒÂÃ‚ÂÃƒÂÃ‚Â¡ÃƒÂÃ‚Â¢ÃƒÂÃ‚Â¬ */
  .aiw-body {
    padding: 32px 40px 16px;
  }

  /* ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂµÃƒÂÃ‚Â· ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚Âº ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ */
  .aiw-ava {
    display: none !important;
  }

  .aiw-time {
    display: none !important;
  }

  .aiw-row {
    gap: 0;
  }

  .aiw-bubble-wrap {
    max-width: 75%;
  }

  /* ÃƒÂÃ‚Â°Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Å¡ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â‚¬ËœÃƒÂÃ‚Â¼ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã…â€™ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒÂÃ‚Â²ÃƒÂÃ‚Â° */
  .aiw-row.ai .aiw-bubble {
    background: ${THEME.bubbleAI};
    color: ${THEME.aiText};
    border-radius: 16px;
    border-color: ${THEME.bubbleBorder};
  }

  /* ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â·ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â»Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã…â€™ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â° */
  .aiw-row.me {
    justify-content:flex-end;
  }
  .aiw-row.me .aiw-bubble {
    background: ${THEME.bubbleUser};
    color: ${THEME.userText};
    border-radius: 16px;
    border-color: transparent;
  }

  /* FOOTER: ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂµÃƒÂÃ‚Â· ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒÂÃ‚Â¸ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬Â¦Ãƒâ€˜Ã†â€™ */
.aiw-footer{
  position: relative;
  padding: 20px 32px;
  border-top: none !important;
  background:${THEME.bg};
  display:flex;
  align-items:stretch;
}



  .aiw-footer-meta {
    display:none !important;
  }

/* ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã¢â‚¬Å¡ (INLINE): Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂºÃƒÂÃ‚Â° ÃƒÂÃ‚Â¸ Ãƒâ€˜Ã¢â‚¬Å¾ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â½ ÃƒÂÃ‚Â½ÃƒÂÃ‚Â° wrapper */
.aiw-input-wrap{
  position: relative;
  flex: 1 1 auto;
  border-radius: 9999px;
  background: ${THEME.inputBg};
  border: 1px solid ${THEME.inputBorder};
  overflow: hidden;
}

/* textarea ÃƒÂÃ‚Â²ÃƒÂÃ‚Â½Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸: ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â°ÃƒÂÃ‚Â´ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¸ */

.aiw-input{
  padding: 12px 60px 12px 16px; /* Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â° ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ ÃƒÂÃ‚ÂºÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂºÃƒâ€˜Ã†â€™ */
}

  .aiw-input::placeholder {
    color: rgba(249,250,251,0.75);
  }

  /* ÃƒÂÃ‚ÂºÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂºÃƒÂÃ‚Â°: ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ ÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â³ Ãƒâ€˜Ã‚Â Ãƒâ€˜Ã¢â‚¬Â¡Ãƒâ€˜Ã¢â‚¬ËœÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¹ Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¹ */
.aiw-send{
  position: absolute !important;
  right: 12px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;

  width: 40px !important;
  height: 40px !important;
  border-radius: 9999px !important;

  background: ${THEME.sendBg} !important;
  box-shadow: none !important;
  padding: 0 !important;
}

.aiw-send-icon{
  width: 18px;
  height: 18px;
}

` : ""}
/* --- RESPONSIVE (Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â±ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â² float, ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â² inline) --- */
@media (max-width: 480px) {
 .aiw-body { font-size: 14px !important; }
  .aiw-header { font-size: 18px !important; }

  .aiw-footer { --aiw-input-min-h: 44px; --aiw-input-max-h: 64px; } /* ~2 Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¸ */
  .aiw-send-icon { width:18px; height:18px; }

  .aiw-btn:not(.aiw-btn-pill) { width:48px; height:48px; }
  .aiw-btn.aiw-btn-pill { width:min(var(--aiw-pill-width, 420px), 94vw); }
  .aiw-btn.aiw-btn-pill .aiw-btn-label { font-size:17px; }
  .aiw-btn.aiw-btn-pill.aiw-btn-closed,
  .aiw-btn.aiw-btn-pill.aiw-btn-open { width:min(var(--aiw-pill-width, 268px), 94vw); }
  .aiw-panel { max-width: 96vw; }
}

@media (min-width: 481px) and (max-width: 768px) {
  .aiw-body { font-size: 15px !important; }
  .aiw-header { font-size: 19px !important; }

  .aiw-footer { --aiw-input-min-h: 46px; --aiw-input-max-h: 68px; } /* ~2 Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¸ */
  .aiw-send-icon { width:20px; height:20px; }

  .aiw-btn:not(.aiw-btn-pill) { width:52px; height:52px; }
  .aiw-btn.aiw-btn-pill .aiw-btn-label { font-size:17px; }
}

`;

  shadow.appendChild(style);
if (INLINE && FIT_MODE === "content") {
  const fix = document.createElement("style");
  fix.textContent = `
    :host, html, body { height: auto !important; }
    .aiw-wrap { height: auto !important; position: relative !important; }
    .aiw-panel {
      min-height: 480px !important; 
      position: relative !important;
      height: auto !important;
      max-height: none !important;
      display: flex !important;
      width: 100% !important;
      max-width: 100% !important;
      bottom: auto !important;
      right: auto !important;
      left: auto !important;
    }
  `;
  shadow.appendChild(fix);
}
const wrap = document.createElement("div");
wrap.className = "aiw-wrap";

// ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¼ NEW: ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â·ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â·ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¶ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â°
if (INLINE) {
  // ÃƒÂÃ‚Â²ÃƒÂÃ‚Â½Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ iframe/inline ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â±ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¹ÃƒÂÃ‚Â½ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬
  wrap.style.position = "relative";
  wrap.style.bottom   = "auto";
  wrap.style.right    = "auto";
  wrap.style.left     = "auto";
  wrap.style.width    = "100%";
  wrap.style.height   = FILL_CONTAINER ? "100%" : "auto";
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.alignItems = "stretch";
  wrap.style.flex = "1 1 auto";
  wrap.style.minHeight = FILL_CONTAINER ? "0" : "";
} else {
  wrap.style.position = "fixed";
  wrap.style.bottom = "20px";
  if (INLINE_ANCHOR_BUTTON && INLINE_ANCHOR_BUTTON.enabled) {
    wrap.style.left = "50%";
    wrap.style.right = "auto";
    wrap.style.transform = "translateX(-50%)";
  } else if (POSITION === "center") {
    wrap.style.left = "50%";
    wrap.style.right = "auto";
    wrap.style.transform = "translateX(-50%)";
  } else {
    wrap.style.transform = "";
    wrap.style.left = POSITION === "bl" ? "20px" : "auto";
    wrap.style.right = POSITION === "br" ? "20px" : "auto";
  }
}

shadow.appendChild(wrap);

const btn = document.createElement("button");
btn.className = "aiw-btn";
btn.type = "button";
btn.setAttribute("aria-haspopup", "dialog");
btn.setAttribute("aria-expanded", "false");

const DEFAULT_INLINE_ANCHOR_LABEL = LANG.startsWith("ru")
  ? "\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a \u0447\u0430\u0442\u0443"
  : "";
const BASE_FLOAT_LAUNCHER_STATE = {
  variant: INLINE_ANCHOR_BUTTON.enabled ? "pill" : FLOAT_LAUNCHER.variant,
  iconText: FLOAT_LAUNCHER.iconText || "AI",
  text: INLINE_ANCHOR_BUTTON.enabled
    ? (INLINE_ANCHOR_BUTTON.label || FLOAT_LAUNCHER.text || DEFAULT_INLINE_ANCHOR_LABEL)
    : (FLOAT_LAUNCHER.text || ""),
  hideLabelWhenEmpty: INLINE_ANCHOR_BUTTON.enabled ? false : !!FLOAT_LAUNCHER.hideLabelWhenEmpty,
  widthPx: clamp(toNum(FLOAT_LAUNCHER.widthPx, 420), 160, 900),
  heightPx: clamp(toNum(FLOAT_LAUNCHER.heightPx, 56), 40, 120),
  bgColor: toText(FLOAT_LAUNCHER.bgColor || "").trim(),
  textColor: toText(FLOAT_LAUNCHER.textColor || "").trim(),
  iconBgColor: toText(FLOAT_LAUNCHER.iconBgColor || "").trim(),
  iconTextColor: toText(FLOAT_LAUNCHER.iconTextColor || "").trim(),
  borderColor: toText(FLOAT_LAUNCHER.borderColor || "").trim(),
  shadow: toText(FLOAT_LAUNCHER.shadow || "").trim()
};
const DYNAMIC_FLOAT_LAUNCHER = FLOAT_LAUNCHER.dynamic || { enabled: false, resetOnNoMatch: true, rules: [] };
const dynamicLauncherStats = {};
const dynamicLauncherRuleById = {};
for (let i = 0; i < DYNAMIC_FLOAT_LAUNCHER.rules.length; i += 1) {
  const rule = DYNAMIC_FLOAT_LAUNCHER.rules[i];
  if (!rule || !rule.id) continue;
  dynamicLauncherRuleById[rule.id] = rule;
}
let currentFloatLauncherState = { ...BASE_FLOAT_LAUNCHER_STATE };
let activeDynamicLauncherRuleId = "";
let dynamicLauncherSubscribed = false;
const dynamicLauncherContext = {
  section: "",
  tab: "",
  scrollDepth: 0,
  totalVisibleMs: 0,
  pagePath: window.location.pathname || "/"
};
let pillLabelFitRaf = 0;
let pillLabelFitTimer = 0;
let pillCompactFitRaf = 0;
let pillLabelHideTimer = 0;
let pillCloseCompactTimer = 0;
let pillLabelExitSeq = 0;

function animatePillLabel(labelEl, durationMs) {
  if (!labelEl || typeof labelEl.animate !== "function") return;
  try {
    // Stop previous label animations so show/hide animations don't fight.
    if (typeof labelEl.getAnimations === "function") {
      labelEl.getAnimations().forEach((a) => a.cancel());
    }
    labelEl.animate(
      [
        { opacity: 0.72, transform: "translateY(2px)" },
        { opacity: 1, transform: "translateY(0)" }
      ],
      {
        duration: Math.max(80, Number(durationMs) || 220),
        easing: "cubic-bezier(0.2, 0.75, 0.2, 1)"
      }
    );
  } catch {}
}

function animatePillLabelOut(labelEl, durationMs, onDone) {
  const dur = Math.max(80, Number(durationMs) || 220);
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    if (typeof onDone === "function") onDone();
  };
  if (!labelEl) {
    done();
    return;
  }
  try {
    if (typeof labelEl.getAnimations === "function") {
      labelEl.getAnimations().forEach((a) => a.cancel());
    }
    if (typeof labelEl.animate === "function") {
      const anim = labelEl.animate(
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0.72, transform: "translateY(2px)" }
        ],
        {
          duration: dur,
          easing: "cubic-bezier(0.2, 0.75, 0.2, 1)",
          fill: "forwards"
        }
      );
      anim.addEventListener("finish", done, { once: true });
      anim.addEventListener("cancel", done, { once: true });
      setTimeout(done, dur + 60);
      return;
    }
  } catch {}
  setTimeout(done, dur);
}

function ensurePillButtonChildren(iconEl, labelEl) {
  if (!btn) return;
  const nodes = btn.childNodes;
  if (nodes.length === 2 && nodes[0] === iconEl && nodes[1] === labelEl) return;
  btn.replaceChildren(iconEl, labelEl);
}

function fitPillLabelToWidth() {
  if (INLINE) return;
  if (!btn || !btn.classList.contains("aiw-btn-pill")) return;

  const label = btn.querySelector(".aiw-btn-label");
  const icon = btn.querySelector(".aiw-btn-icon");
  if (!label || !icon) return;

  const btnRect = btn.getBoundingClientRect();
  if (!btnRect || btnRect.width <= 0) return;

  const cs = getComputedStyle(btn);
  const padLeft = parseFloat(cs.paddingLeft) || 0;
  const padRight = parseFloat(cs.paddingRight) || 0;
  const gap = parseFloat(cs.columnGap || cs.gap) || 0;
  const iconRect = icon.getBoundingClientRect();
  let available = Math.max(48, btnRect.width - padLeft - padRight - gap - iconRect.width);

  label.style.maxWidth = `${Math.floor(available)}px`;

  const controlHeight = Math.max(40, Number(currentFloatLauncherState.heightPx) || 56);
  const minFont = Math.max(12, Math.min(15, Math.round(controlHeight * 0.24)));
  const preferredFont = Math.max(minFont, Math.min(24, Math.round(controlHeight * 0.42)));

  let fontSize = preferredFont;
  label.style.fontSize = `${fontSize}px`;

  let guard = 0;
  while (label.scrollWidth > available && fontSize > minFont && guard < 40) {
    fontSize -= 1;
    label.style.fontSize = `${fontSize}px`;
    guard += 1;
  }

  const canGrowForText = btn.classList.contains("aiw-btn-open")
    || (btn.classList.contains("aiw-btn-closed") && !!toText(label.textContent).trim());

  if (label.scrollWidth > available && canGrowForText) {
    const viewportWidth = Math.max(
      0,
      toNum(window.visualViewport && window.visualViewport.width, 0),
      toNum(window.innerWidth, 0),
      toNum(document.documentElement && document.documentElement.clientWidth, 0)
    );
    const maxBtnWidth = Math.floor(Math.max(260, viewportWidth * 0.94));
    const baseMinWidth = btn.classList.contains("aiw-btn-closed")
      ? Math.max(268, toNum(currentFloatLauncherState.widthPx, 268))
      : toNum(currentFloatLauncherState.widthPx, 420);
    const currentMinWidth = clamp(Math.round(baseMinWidth), 160, 900);
    const neededWidth = Math.ceil(label.scrollWidth + padLeft + padRight + gap + iconRect.width + 8);
    const expandedWidth = Math.min(maxBtnWidth, Math.max(currentMinWidth, neededWidth));

    if (expandedWidth > btnRect.width + 2) {
      btn.style.setProperty("--aiw-pill-width", `${expandedWidth}px`);
      available = Math.max(48, expandedWidth - padLeft - padRight - gap - iconRect.width);
      label.style.maxWidth = `${Math.floor(available)}px`;
      guard = 0;
      while (label.scrollWidth > available && fontSize > minFont && guard < 40) {
        fontSize -= 1;
        label.style.fontSize = `${fontSize}px`;
        guard += 1;
      }
    }
  }
}

function schedulePillLabelFit(transitionMs) {
  if (pillLabelFitRaf) {
    try { cancelAnimationFrame(pillLabelFitRaf); } catch {}
  }
  if (pillLabelFitTimer) {
    try { clearTimeout(pillLabelFitTimer); } catch {}
    pillLabelFitTimer = 0;
  }
  pillLabelFitRaf = requestAnimationFrame(() => {
    pillLabelFitRaf = 0;
    fitPillLabelToWidth();
  });
  const settleDelay = Math.max(0, Number(transitionMs) || 0);
  if (settleDelay > 0) {
    pillLabelFitTimer = setTimeout(() => {
      pillLabelFitTimer = 0;
      fitPillLabelToWidth();
    }, settleDelay + 40);
  }
}

function getCompactPillWidth(iconEl, heightPx, iconText) {
  let iconWidth = 0;
  try {
    if (iconEl) {
      if (Number.isFinite(iconEl.scrollWidth) && iconEl.scrollWidth > 0) {
        iconWidth = Math.max(iconWidth, iconEl.scrollWidth);
      }
      if (typeof iconEl.getBoundingClientRect === "function") {
        const rect = iconEl.getBoundingClientRect();
        if (rect && Number.isFinite(rect.width) && rect.width > 0) {
          iconWidth = Math.max(iconWidth, rect.width);
        }
      }
    }
  } catch {}
  if (iconWidth <= 0) {
    const safeText = toText(iconText || "AI").trim() || "AI";
    iconWidth = Math.max(46, safeText.length * 9 + 14);
  } else {
    iconWidth = Math.max(iconWidth, 46);
  }
  const sidePadding = 14;
  const controlHeight = Math.max(40, Number(heightPx) || 56);
  return Math.max(Math.ceil(iconWidth + sidePadding * 2), controlHeight);
}

function scheduleCompactPillFit(iconEl, heightPx, iconText) {
  if (pillCompactFitRaf) {
    try { cancelAnimationFrame(pillCompactFitRaf); } catch {}
  }
  pillCompactFitRaf = requestAnimationFrame(() => {
    pillCompactFitRaf = 0;
    if (!btn || !btn.classList.contains("aiw-btn-pill") || !btn.classList.contains("aiw-btn-pill-compact")) return;
    btn.style.setProperty("--aiw-pill-width", `${getCompactPillWidth(iconEl, heightPx, iconText)}px`);
  });
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function buildFloatLauncherState(baseState, patch) {
  const next = { ...(baseState || BASE_FLOAT_LAUNCHER_STATE) };
  if (!patch || typeof patch !== "object") return next;

  if (hasOwn(patch, "variant")) {
    const variantRaw = normToken(patch.variant);
    if (variantRaw === "pill" || variantRaw === "circle") next.variant = variantRaw;
  }
  if (hasOwn(patch, "iconText")) {
    const v = toText(patch.iconText).trim();
    if (v) next.iconText = v;
  }
  if (hasOwn(patch, "text")) {
    const v = toText(patch.text).trim();
    if (v) next.text = v;
  }
  if (hasOwn(patch, "hideLabelWhenEmpty")) {
    next.hideLabelWhenEmpty = toBool(patch.hideLabelWhenEmpty, next.hideLabelWhenEmpty);
  }
  if (hasOwn(patch, "widthPx") && patch.widthPx !== null && patch.widthPx !== "") {
    const widthRaw = Number(patch.widthPx);
    if (Number.isFinite(widthRaw)) next.widthPx = clamp(Math.round(widthRaw), 160, 900);
  }
  if (hasOwn(patch, "heightPx") && patch.heightPx !== null && patch.heightPx !== "") {
    const heightRaw = Number(patch.heightPx);
    if (Number.isFinite(heightRaw)) next.heightPx = clamp(Math.round(heightRaw), 40, 120);
  }
  if (hasOwn(patch, "bgColor")) {
    const v = toText(patch.bgColor).trim();
    if (v) next.bgColor = v;
  }
  if (hasOwn(patch, "textColor")) {
    const v = toText(patch.textColor).trim();
    if (v) next.textColor = v;
  }
  if (hasOwn(patch, "iconBgColor")) {
    const v = toText(patch.iconBgColor).trim();
    if (v) next.iconBgColor = v;
  }
  if (hasOwn(patch, "iconTextColor")) {
    const v = toText(patch.iconTextColor).trim();
    if (v) next.iconTextColor = v;
  }
  if (hasOwn(patch, "borderColor")) {
    const v = toText(patch.borderColor).trim();
    if (v) next.borderColor = v;
  }
  if (hasOwn(patch, "shadow")) {
    const v = toText(patch.shadow).trim();
    if (v) next.shadow = v;
  }
  return next;
}

function resetFloatLauncherButtonStyles() {
  if (pillLabelFitTimer) {
    try { clearTimeout(pillLabelFitTimer); } catch {}
    pillLabelFitTimer = 0;
  }
  if (pillLabelHideTimer) {
    try { clearTimeout(pillLabelHideTimer); } catch {}
    pillLabelHideTimer = 0;
  }
  if (pillCloseCompactTimer) {
    try { clearTimeout(pillCloseCompactTimer); } catch {}
    pillCloseCompactTimer = 0;
  }
  pillLabelExitSeq += 1;
  if (pillCompactFitRaf) {
    try { cancelAnimationFrame(pillCompactFitRaf); } catch {}
    pillCompactFitRaf = 0;
  }
  btn.classList.remove("aiw-btn-pill-compact");
  btn.style.removeProperty("--aiw-pill-width");
  btn.style.removeProperty("--aiw-pill-height");
  btn.style.removeProperty("--aiw-pill-bg");
  btn.style.removeProperty("--aiw-pill-text");
  btn.style.removeProperty("--aiw-pill-icon-bg");
  btn.style.removeProperty("--aiw-pill-icon-text");
  btn.style.removeProperty("--aiw-pill-border");
  btn.style.removeProperty("--aiw-pill-shadow");
  btn.style.background = "";
  btn.style.color = "";
  btn.style.border = "";
  btn.style.boxShadow = "";
  btn.style.gap = "";
}

function applyFloatLauncherState(nextState) {
  const state = buildFloatLauncherState(BASE_FLOAT_LAUNCHER_STATE, nextState);
  currentFloatLauncherState = state;
  const transitionMs = DYNAMIC_FLOAT_LAUNCHER.transitionMs || 220;
  const exitTransitionMs = transitionMs;
  btn.style.setProperty("--aiw-pill-transition-ms", `${transitionMs}ms`);

  resetFloatLauncherButtonStyles();

  if (!INLINE && state.variant === "pill") {
    btn.classList.add("aiw-btn-pill");
    btn.style.setProperty("--aiw-pill-height", `${state.heightPx}px`);
    btn.style.setProperty("--aiw-pill-bg", state.bgColor || "#ffffff");
    btn.style.setProperty("--aiw-pill-text", state.textColor || "#000000");
    btn.style.setProperty("--aiw-pill-icon-bg", state.iconBgColor || "#000000");
    btn.style.setProperty("--aiw-pill-icon-text", state.iconTextColor || "#ffffff");
    if (state.borderColor) btn.style.setProperty("--aiw-pill-border", state.borderColor);
    if (state.shadow) btn.style.setProperty("--aiw-pill-shadow", state.shadow);

    let icon = btn.querySelector(".aiw-btn-icon");
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "aiw-btn-icon";
    }
    const isClosedLauncher = btn.classList.contains("aiw-btn-closed");

    let label = btn.querySelector(".aiw-btn-label");
    if (!label) {
      label = document.createElement("span");
      label.className = "aiw-btn-label";
    }
    const hasExplicitText = typeof state.text === "string" && state.text.trim().length > 0;
    const nextTextBase = hasExplicitText
      ? state.text
      : (state.hideLabelWhenEmpty ? "" : "Ask AI assistant...");
    const forceClosedText = !!(INLINE_ANCHOR_BUTTON && INLINE_ANCHOR_BUTTON.enabled && hasExplicitText);
    const showClosedText = forceClosedText || (isClosedLauncher && hasExplicitText && !!activeDynamicLauncherRuleId);
    const nextText = isClosedLauncher ? (showClosedText ? state.text : "") : nextTextBase;
    const hasTextSlot = !!nextText;
    const keepClosedVisualStyle = isClosedLauncher || !hasTextSlot;
    const iconText = keepClosedVisualStyle
      ? "AI"
      : (state.iconText || "AI");
    icon.textContent = iconText;
    const prevText = toText(label.textContent || "").trim();
    const changed = label.textContent !== nextText;
    const shouldAnimateExit = false;
    if (pillLabelHideTimer) {
      try { clearTimeout(pillLabelHideTimer); } catch {}
      pillLabelHideTimer = 0;
    }
    if (pillCloseCompactTimer) {
      try { clearTimeout(pillCloseCompactTimer); } catch {}
      pillCloseCompactTimer = 0;
    }
    label.classList.remove("aiw-btn-label-exit");
    ensurePillButtonChildren(icon, label);
    if (hasTextSlot) {
      pillLabelExitSeq += 1;
      try {
        if (typeof label.getAnimations === "function") {
          label.getAnimations().forEach((a) => a.cancel());
        }
      } catch {}
      label.textContent = nextText;
      label.style.display = "block";
      label.setAttribute("aria-hidden", "false");
    } else if (shouldAnimateExit) {
      const exitSeq = ++pillLabelExitSeq;
      label.textContent = prevText;
      label.style.display = "block";
      label.setAttribute("aria-hidden", "true");
      animatePillLabelOut(label, exitTransitionMs, () => {
        if (exitSeq !== pillLabelExitSeq) return;
        if (!label.isConnected) return;
        label.textContent = "";
        label.style.display = "none";
        label.setAttribute("aria-hidden", "true");
      });
      // Collapse the pill only after the label fade-out completes.
      pillCloseCompactTimer = setTimeout(() => {
        if (exitSeq !== pillLabelExitSeq) return;
        pillCloseCompactTimer = 0;
        if (!btn.isConnected) return;
        if (!btn.classList.contains("aiw-btn-pill")) return;
        if (btn.classList.contains("aiw-btn-open")) return;
        btn.style.setProperty("--aiw-pill-width", "268px");
        btn.style.gap = "0";
      }, Math.max(80, Number(exitTransitionMs) || 220));
    } else {
      pillLabelExitSeq += 1;
      try {
        if (typeof label.getAnimations === "function") {
          label.getAnimations().forEach((a) => a.cancel());
        }
      } catch {}
      label.textContent = "";
      label.style.display = "none";
      label.setAttribute("aria-hidden", "true");
    }
    if (keepClosedVisualStyle) {
      btn.classList.remove("aiw-btn-pill-compact");
      if (hasTextSlot || shouldAnimateExit) {
        btn.style.setProperty("--aiw-pill-width", `${state.widthPx}px`);
        btn.style.gap = "";
      } else {
        btn.style.setProperty("--aiw-pill-width", "268px");
        btn.style.gap = "0";
      }
    } else if (hasTextSlot) {
      btn.classList.remove("aiw-btn-pill-compact");
      btn.style.setProperty("--aiw-pill-width", `${state.widthPx}px`);
      btn.style.gap = "";
    } else {
      btn.classList.add("aiw-btn-pill-compact");
      btn.style.gap = "0";
      btn.style.setProperty("--aiw-pill-width", `${getCompactPillWidth(icon, state.heightPx, iconText)}px`);
    }
    if (changed && hasTextSlot) animatePillLabel(label, transitionMs);
    if (hasTextSlot) {
      schedulePillLabelFit(transitionMs);
    } else if (!keepClosedVisualStyle) {
      scheduleCompactPillFit(icon, state.heightPx, iconText);
    }
    return;
  }

  btn.classList.remove("aiw-btn-pill");
  btn.classList.remove("aiw-btn-pill-compact");
  btn.textContent = state.iconText || "AI";
  if (!INLINE) {
    if (state.bgColor) btn.style.background = state.bgColor;
    if (state.textColor) btn.style.color = state.textColor;
    if (state.borderColor) btn.style.border = `1px solid ${state.borderColor}`;
    if (state.shadow) btn.style.boxShadow = state.shadow;
  }
}

function updateDynamicLauncherContext(evt) {
  if (!evt || typeof evt !== "object") return;
  dynamicLauncherContext.pagePath = window.location.pathname || "/";
  if (evt.section) dynamicLauncherContext.section = toText(evt.section);
  if (evt.type === "tab_active" && evt.tab) dynamicLauncherContext.tab = toText(evt.tab);
  if (evt.type === "scroll_depth") {
    dynamicLauncherContext.scrollDepth = Math.max(
      dynamicLauncherContext.scrollDepth,
      toNum(evt.percent, 0)
    );
  }
  if (evt.type === "page_hidden" || evt.type === "page_unload") {
    dynamicLauncherContext.totalVisibleMs = Math.max(
      dynamicLauncherContext.totalVisibleMs,
      toNum(evt.totalVisibleMs, 0)
    );
  }
}

function isDynamicLauncherRuleMatch(rule, evt) {
  if (!rule || !evt) return false;
  if (rule.event !== evt.type) return false;

  if (rule.section && normToken(rule.section) !== normToken(evt.section || dynamicLauncherContext.section)) return false;
  if (rule.tab && normToken(rule.tab) !== normToken(evt.tab || dynamicLauncherContext.tab)) return false;
  if (rule.path && normToken(rule.path) !== normToken(dynamicLauncherContext.pagePath)) return false;

  if (rule.minDurationMs > 0 && toNum(evt.durationMs, 0) < rule.minDurationMs) return false;
  if (rule.minScrollDepth > 0 && toNum(dynamicLauncherContext.scrollDepth, 0) < rule.minScrollDepth) return false;

  const visibleMs = Math.max(
    toNum(dynamicLauncherContext.totalVisibleMs, 0),
    toNum(evt.totalVisibleMs, 0)
  );
  if (rule.minVisibleMs > 0 && visibleMs < rule.minVisibleMs) return false;

  return true;
}

function canUseDynamicLauncherRule(rule) {
  const item = dynamicLauncherStats[rule.id] || { count: 0, lastAt: 0 };
  const now = Date.now();
  if (rule.once && item.count > 0) return false;
  if (rule.maxShows > 0 && item.count >= rule.maxShows) return false;
  if (rule.cooldownMs > 0 && item.lastAt > 0 && (now - item.lastAt) < rule.cooldownMs) return false;
  return true;
}

function markDynamicLauncherRuleUsed(rule) {
  const item = dynamicLauncherStats[rule.id] || { count: 0, lastAt: 0 };
  item.count += 1;
  item.lastAt = Date.now();
  dynamicLauncherStats[rule.id] = item;
}

function resetDynamicLauncherToBase() {
  activeDynamicLauncherRuleId = "";
  applyFloatLauncherState(BASE_FLOAT_LAUNCHER_STATE);
}

function handleDynamicLauncherEvent(evt) {
  updateDynamicLauncherContext(evt);
  if (INLINE) return;
  if (!DYNAMIC_FLOAT_LAUNCHER.enabled || !DYNAMIC_FLOAT_LAUNCHER.rules.length) return;

  let selectedRule = null;
  for (let i = 0; i < DYNAMIC_FLOAT_LAUNCHER.rules.length; i += 1) {
    const rule = DYNAMIC_FLOAT_LAUNCHER.rules[i];
    if (!isDynamicLauncherRuleMatch(rule, evt)) continue;
    if (!canUseDynamicLauncherRule(rule)) continue;
    selectedRule = rule;
    break;
  }

  if (selectedRule) {
    activeDynamicLauncherRuleId = selectedRule.id;
    applyFloatLauncherState(buildFloatLauncherState(BASE_FLOAT_LAUNCHER_STATE, selectedRule.action));
    markDynamicLauncherRuleUsed(selectedRule);
    return;
  }

  if (!DYNAMIC_FLOAT_LAUNCHER.resetOnNoMatch) return;
  if (!activeDynamicLauncherRuleId) return;

  const activeRule = dynamicLauncherRuleById[activeDynamicLauncherRuleId];
  if (!activeRule) {
    resetDynamicLauncherToBase();
    return;
  }

  if (evt && evt.type === "section_leave") {
    const leaving = normToken(evt.section);
    if (!activeRule.section || normToken(activeRule.section) === leaving) {
      resetDynamicLauncherToBase();
    }
    return;
  }

  if (evt && evt.type === "section_enter" && activeRule.section) {
    if (normToken(evt.section) !== normToken(activeRule.section)) {
      resetDynamicLauncherToBase();
    }
    return;
  }

  if (evt && (evt.type === "page_hidden" || evt.type === "page_unload")) {
    resetDynamicLauncherToBase();
  }
}

function subscribeDynamicFloatLauncher() {
  if (INLINE) return;
  if (!DYNAMIC_FLOAT_LAUNCHER.enabled || !DYNAMIC_FLOAT_LAUNCHER.rules.length) return;
  if (dynamicLauncherSubscribed) return;

  const tryAttach = () => {
    const activity = window.__AIW_ACTIVITY__;
    if (!activity || typeof activity.on !== "function") return false;
    activity.on(handleDynamicLauncherEvent);
    dynamicLauncherSubscribed = true;
    if (typeof activity.last === "function") {
      const lastEvt = activity.last();
      if (lastEvt) {
        try { handleDynamicLauncherEvent(lastEvt); } catch {}
      }
    }
    return true;
  };

  if (tryAttach()) return;

  let attempts = 0;
  const timerId = setInterval(() => {
    attempts += 1;
    if (tryAttach() || attempts >= 40) {
      clearInterval(timerId);
    }
  }, 250);
}

window.__AIW_FLOAT_LAUNCHER__ = {
  getBase: () => ({ ...BASE_FLOAT_LAUNCHER_STATE }),
  getCurrent: () => ({ ...currentFloatLauncherState }),
  getRules: () => DYNAMIC_FLOAT_LAUNCHER.rules.slice(),
  reset: () => resetDynamicLauncherToBase()
};

applyFloatLauncherState(BASE_FLOAT_LAUNCHER_STATE);
subscribeDynamicFloatLauncher();
window.addEventListener("resize", schedulePillLabelFit, { passive: true });
if (window.visualViewport && typeof window.visualViewport.addEventListener === "function") {
  window.visualViewport.addEventListener("resize", schedulePillLabelFit, { passive: true });
}

const panel = document.createElement("div");
panel.className = "aiw-panel";
if (!INLINE && POSITION === "center") panel.classList.add("aiw-panel-center");

// ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¼ NEW: Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â·ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬Â¹/ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â·ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚Â ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ inline
if (INLINE) {
  panel.style.position = "relative";
  panel.style.bottom = "auto";
  panel.style.right = "auto";
  panel.style.left = "auto";
  panel.style.width = "100%";
  panel.style.maxWidth = "100%";
  panel.style.height = FILL_CONTAINER ? "100%" : "auto";
  panel.style.maxHeight = FILL_CONTAINER ? "100%" : "none";
  panel.style.display = "flex";   // Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â·Ãƒâ€˜Ã†â€™ ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â°Ãƒâ€˜Ã‚Â
  panel.style.flex = "1 1 auto";
  panel.style.minHeight = "0";
} else {
  panel.style.position = "absolute";
  panel.style.bottom = "70px";
  if (POSITION === "center") {
    panel.style.left = "50%";
    panel.style.right = "auto";
    panel.style.transform = "translateX(-50%)";
  } else {
    panel.style.transform = "";
    panel.style.left = POSITION === "bl" ? "0" : "auto";
    panel.style.right = POSITION === "br" ? "0" : "auto";
  }
  panel.style.display = "none";   // ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã‚Â ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ ÃƒÂÃ‚ÂºÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂºÃƒÂÃ‚Âµ
}

if (INLINE && FIT_MODE === "content") {
  wrap.style.height  = "auto";
  panel.style.height = "auto";
}

const header = document.createElement("div");
header.className = "aiw-header";

// ÃƒÂÃ‚Â±ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾ÃƒÂÃ‚Âº Ãƒâ€˜Ã‚Â ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¼: ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¿ + Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚ÂºÃƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡
const brand = document.createElement("div");
brand.className = "aiw-header-brand";

const brandLogo = document.createElement("div");
brandLogo.className = "aiw-header-logo";
if (LOGO) {
  const img = document.createElement("img");
  img.src = LOGO;
  img.alt = "logo";
  brandLogo.appendChild(img);
}

// ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬ËœÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂºÃƒÂÃ‚Â° ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚ÂºÃƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° + ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¹ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¶ÃƒÂÃ‚Â°
const titleWrap = document.createElement("div");
titleWrap.className = "aiw-header-title";

const brandTitle = document.createElement("span");
brandTitle.className = "aiw-header-title-text";
brandTitle.textContent = TITLE;

// Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â°ÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¹ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¶
const betaBadge = document.createElement("span");
betaBadge.className = "aiw-beta-badge";
betaBadge.textContent = "Beta";

titleWrap.appendChild(brandTitle);
titleWrap.appendChild(betaBadge);

brand.appendChild(brandLogo);
brand.appendChild(titleWrap);


const close = document.createElement("button");
close.className = "aiw-close-btn";
close.setAttribute("aria-label", LANG.startsWith("ru") ? "\u0417\u0430\u043a\u0440\u044b\u0442\u044c" : "Close");
const resetBtn = document.createElement("button");
resetBtn.className = "aiw-reset-btn";
resetBtn.title = LANG.startsWith("ru") ? "\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c \u0434\u0438\u0430\u043b\u043e\u0433" : "Reset chat";
resetBtn.innerHTML = "&#8635;";

const fsBtn = document.createElement("button");
fsBtn.className = "aiw-fs-toggle";
fsBtn.type = "button";

const FS_ENTER_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 10L20 4"></path>
    <path d="M15 4H20V9"></path>
    <path d="M10 14L4 20"></path>
    <path d="M9 20H4V15"></path>
  </svg>
`;

const FS_EXIT_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6L18 18"></path>
    <path d="M18 6L6 18"></path>
  </svg>
`;
close.innerHTML = FS_EXIT_ICON;

let inlineFullscreen = false;
let inlineBusy = false;

function getInlineFullscreenBaseTitle() {
  return inlineFullscreen
    ? (LANG.startsWith("ru") ? "\u0412\u044b\u0439\u0442\u0438 \u0438\u0437 \u043f\u043e\u043b\u043d\u043e\u0433\u043e \u044d\u043a\u0440\u0430\u043d\u0430" : "Exit fullscreen")
    : (LANG.startsWith("ru") ? "\u041d\u0430 \u0432\u0435\u0441\u044c \u044d\u043a\u0440\u0430\u043d" : "Fullscreen");
}

function syncInlineFullscreenControl() {
  fsBtn.innerHTML = inlineFullscreen ? FS_EXIT_ICON : FS_ENTER_ICON;
  const baseTitle = getInlineFullscreenBaseTitle();
  const busyTitle = LANG.startsWith("ru")
    ? "\u0414\u043e\u0436\u0434\u0438\u0442\u0435\u0441\u044c \u043e\u0442\u0432\u0435\u0442\u0430"
    : "Wait for response";
  const disableByBusy = INLINE && inlineBusy;

  fsBtn.title = disableByBusy ? busyTitle : baseTitle;
  fsBtn.setAttribute("aria-label", fsBtn.title);
  fsBtn.setAttribute("aria-pressed", inlineFullscreen ? "true" : "false");
  fsBtn.setAttribute("aria-disabled", disableByBusy ? "true" : "false");
  fsBtn.disabled = disableByBusy;
  panel.classList.toggle("aiw-panel-fullscreen", inlineFullscreen);
  if (!INLINE) {
    wrap.classList.toggle("aiw-wrap-fullscreen", inlineFullscreen);
    close.style.display = inlineFullscreen ? "none" : "";
  }
}

function setInlineFullscreenState(next) {
  inlineFullscreen = !!next;
  syncInlineFullscreenControl();
}

function setInlineBusyState(next) {
  inlineBusy = !!next;
  syncInlineFullscreenControl();
}

function postInlineFullscreen(next) {
  if (!INLINE || window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: "aiw:fullscreen", instanceId: INSTANCE_ID, value: !!next },
      PARENT_ORIGIN
    );
  } catch {}
}

function requestInlineFullscreenState() {
  if (!INLINE || window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: "aiw:fullscreen:get-state", instanceId: INSTANCE_ID },
      PARENT_ORIGIN
    );
  } catch {}
}

function postInlineBusyState(next) {
  if (!INLINE || window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: "aiw:busy", instanceId: INSTANCE_ID, value: !!next },
      PARENT_ORIGIN
    );
  } catch {}
}

setInlineFullscreenState(false);
setInlineBusyState(false);
fsBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (INLINE && inlineBusy) return;
  const next = !inlineFullscreen;
  // Optimistic UI update so the user can always toggle back immediately.
  setInlineFullscreenState(next);
  postInlineFullscreen(next);
});

const actions = document.createElement("div");
actions.className = "aiw-actions";
actions.appendChild(resetBtn);
actions.appendChild(fsBtn);
actions.appendChild(close);

// Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ Ãƒâ€˜Ã¢â‚¬Â¦ÃƒÂÃ‚ÂµÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬
header.appendChild(brand);
header.appendChild(actions);

const body = document.createElement("div");
body.className = "aiw-body";
const messagesWrap = document.createElement("div");
messagesWrap.style.display = "flex";
messagesWrap.style.flexDirection = "column";
body.appendChild(messagesWrap);
let demoMessages = [];
let demoActive = false;
let demoTypingActive = false;
const demoBadge = document.createElement("div");
demoBadge.style.cssText = `
  display:none;
  align-self:flex-start;
  margin:6px 0 10px;
  padding:4px 10px;
  border-radius:999px;
  border:1px solid ${THEME.bubbleBorder};
  background:${THEME.bubbleAI};
  color:${THEME.time};
  font-size:12px;
  letter-spacing:.01em;
`;
demoBadge.textContent = "";
body.insertBefore(demoBadge, messagesWrap);
// пустой хинт (виден только когда нет сообщений)
const emptyHint = document.createElement("div");
emptyHint.style.cssText = `
  align-self:flex-start; max-width:85%; margin:8px 0; padding:10px 12px;
  border-radius:12px; background:${THEME.bubbleAI}; color:${THEME.aiText}; opacity:.7; display:none;
`;

emptyHint.textContent = WELCOME;
body.appendChild(emptyHint);

function visibleMessages() {
  if (INLINE && demoActive) return demoMessages;
  return history;
}

function updateEmptyHint() {
  const shownMessages = visibleMessages();
  const hasMessages = Array.isArray(shownMessages) && shownMessages.length > 0;
  const shouldShow = showWelcomeHint && !hasMessages && !demoTypingActive;
  emptyHint.style.display = shouldShow ? "block" : "none";
}

function updateDemoBadge() {
  demoBadge.style.display = "none";
}

const footer = document.createElement("div");
footer.className = "aiw-footer";

const input = document.createElement("textarea");
input.rows = 1;
const defaultInputPlaceholder = LANG.startsWith("ru") ? "\u0421\u043f\u0440\u043e\u0441\u0438\u0442\u0435 \u0447\u0442\u043e-\u043d\u0438\u0431\u0443\u0434\u044c..." : "Ask anything...";
input.placeholder = toText(CFG.inputPlaceholder).trim() || defaultInputPlaceholder;
input.className = "aiw-input";
input.maxLength = MAX_LEN;

const SEND_ICON_URL = new URL("/aiw/assets/arrow-right.png", API_ORIGIN).href;

const sendBtn = document.createElement("button");
sendBtn.className = "aiw-send";
sendBtn.innerHTML = `
  <img
    src="${SEND_ICON_URL}"
    alt=""
    class="aiw-send-icon"
  />
`;

const inputWrap = document.createElement("div");
inputWrap.className = "aiw-input-wrap";
inputWrap.appendChild(input);

inputWrap.appendChild(sendBtn);
footer.appendChild(inputWrap);
  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);

const SCROLL_STICKY_THRESHOLD = 24; 
let userPinnedToBottom = true;

let ignoreScroll = false;   // Ãƒâ€˜Ã¢â‚¬Â¡Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â¹ scroll ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â½ÃƒÂÃ‚Â°Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Â¦ scrollTop ÃƒÂÃ‚Â½ÃƒÂÃ‚Âµ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â±ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°ÃƒÂÃ‚Â» Ãƒâ€˜Ã¢â‚¬Å¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â°ÃƒÂÃ‚Â³
let scrollRaf = null;       // Ãƒâ€˜Ã¢â‚¬Â¡Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â¹ ÃƒÂÃ‚Â½ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â³ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™ scroll ÃƒÂÃ‚Â½ÃƒÂÃ‚Â° ÃƒÂÃ‚ÂºÃƒÂÃ‚Â°ÃƒÂÃ‚Â¶ÃƒÂÃ‚Â´Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚Âº

function isNearBottom() {
  return (body.scrollHeight - (body.scrollTop + body.clientHeight)) <= SCROLL_STICKY_THRESHOLD;
}

function scrollToBottom(force = false) {
  if (!(force || userPinnedToBottom)) return;

  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = null;

    ignoreScroll = true;
    body.scrollTop = body.scrollHeight;

    requestAnimationFrame(() => { ignoreScroll = false; });
  });
}

body.addEventListener("scroll", () => {
  if (ignoreScroll) return;
  userPinnedToBottom = isNearBottom();
}, { passive: true });


  const footerMeta = document.createElement("div");
footerMeta.className = "aiw-footer-meta";

const footerHint = document.createElement("div");
footerHint.textContent = LANG.startsWith("ru")
  ? "Enter ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™, Shift+Enter ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã‚Â Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚ÂºÃƒÂÃ‚Â°"
  : "Press Enter to send, Shift+Enter for new line";

const footerCounter = document.createElement("div");
footerCounter.className = "aiw-char-counter";
footerCounter.textContent = `0/${MAX_LEN}`;

footerMeta.appendChild(footerHint);
footerMeta.appendChild(footerCounter);

if (INLINE) panel.appendChild(footerMeta);
// ÃƒÂÃ‚Â² inline ÃƒÂÃ‚ÂºÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂºÃƒÂÃ‚Â° ÃƒÂÃ‚Â½ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â½Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â¶ÃƒÂÃ‚Â½ÃƒÂÃ‚Â°
if (!INLINE) wrap.appendChild(btn);
wrap.appendChild(panel);
  document.body.appendChild(root);

  // typing bubble (created AFTER body exists)
  const typing = document.createElement("div");
  typing.className = "aiw-typing-bubble";
  typing.innerHTML = `
    <span class="aiw-typing-dots">
      <span class="aiw-typing-dot"></span>
      <span class="aiw-typing-dot"></span>
      <span class="aiw-typing-dot"></span>
    </span>
  `;
function showTyping(role = "assistant") {
  if (panel.style.display === "none") return;
  const isUserRole = role === "user";
  typing.classList.toggle("me", isUserRole);
  typing.classList.toggle("ai", !isUserRole);
  if (!typing.isConnected) messagesWrap.appendChild(typing);
  typing.style.visibility = "visible";
   scrollToBottom();
    postHeight(); 
}
function hideTyping() {
  typing.style.visibility = "hidden";
    postHeight();
}

function getCurrentDemoTypingRole() {
  if (!INLINE || !demoActive || !idleDemoScript || !demoTypingActive) return "assistant";
  const steps = Array.isArray(idleDemoScript.messages) ? idleDemoScript.messages : [];
  const step = steps[idleDemoStepIndex];
  return step?.role === "user" ? "user" : "assistant";
}

function hasRenderableAssistantContent(text) {
  return String(text || "").replace(/\u200B/g, "").trim().length > 0;
}

function dedupeAutogreetAtTail() {
  let seen = false;
  for (let k = history.length - 1; k >= 0; k--) {
    const m = history[k];
    if (m && m.meta && m.meta.kind === "autogreet") {
      if (seen) {
        history.splice(k, 1); // Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™ ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â‚¬Â¹ ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â´ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒÂÃ‚Â´ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼
      } else {
        seen = true; // Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Â¦Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â°ÃƒÂÃ‚Â¼Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒÂÃ‚Â´ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡
      }
    } else {
      break; // ÃƒÂÃ‚ÂºÃƒÂÃ‚Â°ÃƒÂÃ‚Âº Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â½ÃƒÂÃ‚Âµ-ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿
    }
  }
}

function updateCounter() {
  const len = input.value.length;
  footerCounter.textContent = `${len}/${MAX_LEN}`;
}

function autoResizeInput() {
  // Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼, Ãƒâ€˜Ã¢â‚¬Â¡Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â¹ scrollHeight Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã‚Â ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾
  input.style.height = "auto";

  const cs = getComputedStyle(input);
  const maxH = parseFloat(cs.maxHeight) || 92;

  const next = Math.min(input.scrollHeight, maxH);
  input.style.height = next + "px";

  // ÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â‚¬ËœÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã…â€™ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂºÃƒÂÃ‚Â»Ãƒâ€˜Ã…Â½Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â» ÃƒÂÃ‚Â²ÃƒÂÃ‚Â½Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ textarea
  input.style.overflowY = (input.scrollHeight > maxH) ? "auto" : "hidden";

  postHeight();
}

function handleWidgetUserInteraction(evt, { hard = false } = {}) {
  if ((evt?.type === "scroll" || evt?.type === "wheel") && ignoreScroll) return;
  if (hard) markUserInteracted();
  cancelAllAutogreetTimers();
  if (INLINE) {
    const hasIdleDemoState =
      demoActive ||
      demoTypingActive ||
      !!idleDemoScript ||
      (Array.isArray(demoMessages) && demoMessages.length > 0);
    if (hasIdleDemoState) {
      stopIdleDemo({ clearMessages: true, restoreWelcome: true });
    }
  }
}

input.addEventListener("input", () => {
  handleWidgetUserInteraction({ type: "input" }, { hard: false });
  updateCounter();
  autoResizeInput();
});
updateCounter(); // ÃƒÂÃ‚Â½ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â·ÃƒÂÃ‚Â½ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚Âµ
setTimeout(autoResizeInput, 0);

  // ---------- Chat logic ----------
let history = readHistory();

function syncHistoryFromSnapshot(snapshot) {
  if (!HYBRID_HISTORY_SYNC) return;
  const nextHistory = snapshotToHistory(snapshot || "[]");
  const nextSnapshot = historyToSnapshot(nextHistory);
  if (nextSnapshot === historySnapshot) return;

  historySnapshot = nextSnapshot;
  history = nextHistory;
  if (PRESERVE_HISTORY !== false && STORAGE) {
    try { STORAGE.setItem(storeKey, nextSnapshot); } catch {}
  }

  if (INLINE && history.length > 0) {
    handleWidgetUserInteraction({ type: "history-sync" }, { hard: false });
  }
  renderAll();
}

if (HYBRID_HISTORY_SYNC) {
  window.addEventListener("aiw:history-sync", (evt) => {
    const data = evt && evt.detail ? evt.detail : null;
    if (!data || typeof data !== "object") return;
    if (data.siteId && data.siteId !== SITE_ID) return;
    syncHistoryFromSnapshot(data.snapshot || "[]");
  });

  window.addEventListener("storage", (evt) => {
    if (!evt || evt.key !== storeKey) return;
    syncHistoryFromSnapshot(evt.newValue || "[]");
  });

  if (HISTORY_SYNC_CHANNEL) {
    HISTORY_SYNC_CHANNEL.addEventListener("message", (evt) => {
      const data = evt && evt.data ? evt.data : null;
      if (!data || data.type !== "history:update" || data.key !== storeKey) return;
      syncHistoryFromSnapshot(data.snapshot || "[]");
    });
  }

  if (INLINE && window.parent && window.parent !== window) {
    window.addEventListener("message", (evt) => {
      if (PARENT_ORIGIN !== "*" && evt.origin !== PARENT_ORIGIN) return;
      const data = evt && evt.data ? evt.data : null;
      if (!data || typeof data !== "object") return;
      if (data.type !== "aiw:history-sync") return;
      if (data.siteId && data.siteId !== SITE_ID) return;
      if (data.instanceId && INSTANCE_ID && data.instanceId !== INSTANCE_ID) return;
      syncHistoryFromSnapshot(data.snapshot || "[]");
    });
  }
}

// ===== INLINE AUTOSTART (Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â· ÃƒÂÃ‚Â½ÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Â¦ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â°ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¹) =====
const INLINE_AUTO_SESSION_KEY  = `aiw:inlineAutoGreet:session:${SITE_ID}`;
const INLINE_AUTO_COOLDOWN_KEY = `aiw:inlineAutoGreet:lastTs:${SITE_ID}`;

// Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â¹ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬Â¹ ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° (float + inline)
let AUTO_TIMER_ID = null;          // ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â¹ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ scheduleAutoGreet
const INLINE_AUTO_TIMEOUTS = [];   // ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â°Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â¸ÃƒÂÃ‚Â² Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â¹ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â² ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â inline-Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°

function cancelAllAutogreetTimers() {
  // ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â°ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¹ Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿ ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â ÃƒÂÃ‚Â²Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Â¦ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¹
  try {
    if (AUTO_TIMER_ID !== null) {
      clearTimeout(AUTO_TIMER_ID);
      AUTO_TIMER_ID = null;
    }
    if (INLINE_AUTO_TIMEOUTS.length) {
      INLINE_AUTO_TIMEOUTS.forEach(id => clearTimeout(id));
      INLINE_AUTO_TIMEOUTS.length = 0;
    }
  } catch {}
}

let idleDemoScript = null;
let idleDemoStepIndex = 0;
let idleDemoTimerId = null;
let idleDemoListenersBound = false;

function toNonNegativeMs(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function clearIdleDemoTimer() {
  if (idleDemoTimerId === null) return;
  clearTimeout(idleDemoTimerId);
  idleDemoTimerId = null;
}

function scheduleIdleDemo(nextFn, delayMs) {
  clearIdleDemoTimer();
  idleDemoTimerId = setTimeout(() => {
    idleDemoTimerId = null;
    nextFn();
  }, toNonNegativeMs(delayMs, 0));
}

function stopIdleDemo({ clearMessages = true, restoreWelcome = false } = {}) {
  const hadDemoState =
    demoActive ||
    demoTypingActive ||
    !!idleDemoScript ||
    (Array.isArray(demoMessages) && demoMessages.length > 0);

  clearIdleDemoTimer();
  demoActive = false;
  demoTypingActive = false;
  idleDemoScript = null;
  idleDemoStepIndex = 0;
  if (clearMessages) demoMessages = [];
  hideTyping();

  if (restoreWelcome && (!history || history.length === 0)) {
    showWelcomeHint = true;
  }

  if (hadDemoState) {
    renderAll();
  }
}

function playIdleDemoStep() {
  if (!demoActive || !idleDemoScript) return;

  const scriptMessages = Array.isArray(idleDemoScript.messages) ? idleDemoScript.messages : [];
  if (!scriptMessages.length) {
    stopIdleDemo({ clearMessages: true, restoreWelcome: true });
    return;
  }

  const step = scriptMessages[idleDemoStepIndex];
  if (!step) {
    idleDemoStepIndex = 0;
    scheduleIdleDemo(playIdleDemoStep, IDLE_DEMO_LOOP_GAP_MS);
    return;
  }

  demoTypingActive = true;
  renderAll();

  scheduleIdleDemo(() => {
    if (!demoActive || !idleDemoScript) return;

    demoTypingActive = false;
    demoMessages.push({
      role: step.role,
      content: step.text,
      meta: { kind: "idleDemo" },
      ts: Date.now(),
    });
    if (demoMessages.length > 30) {
      demoMessages = demoMessages.slice(-30);
    }
    renderAll();

    scheduleIdleDemo(() => {
      if (!demoActive || !idleDemoScript) return;

      idleDemoStepIndex += 1;
      if (idleDemoStepIndex >= scriptMessages.length) {
        if (idleDemoScript.loop === false) {
          demoTypingActive = false;
          renderAll();
          return;
        }
        idleDemoStepIndex = 0;
        demoTypingActive = false;
        demoMessages = [];
        renderAll();
        scheduleIdleDemo(playIdleDemoStep, IDLE_DEMO_LOOP_GAP_MS);
        return;
      }

      playIdleDemoStep();
    }, toNonNegativeMs(step.delayAfterMs, 1200));
  }, toNonNegativeMs(step.typingMs, 800));
}

function normalizeIdleDemoScript(raw) {
  if (!raw || raw.enabled !== true) return null;

  const lang = String(raw.lang || "en").toLowerCase();
  if (!lang.startsWith("en")) return null;

  const messages = Array.isArray(raw.messages)
    ? raw.messages
      .map((step) => {
        const role = String(step?.role || "").trim();
        const text = sanitize(step?.text || "").trim();
        if (!text) return null;
        if (role !== "user" && role !== "assistant") return null;
        return {
          role,
          text,
          typingMs: toNonNegativeMs(step?.typingMs, 800),
          delayAfterMs: toNonNegativeMs(step?.delayAfterMs, 1200),
        };
      })
      .filter(Boolean)
    : [];

  if (!messages.length) return null;

  return {
    enabled: true,
    lang: "en",
    loop: raw.loop !== false,
    startDelayMs: toNonNegativeMs(raw.startDelayMs, 1200),
    messages,
  };
}

async function fetchIdleDemoScript() {
  const url = new URL("/api/widget/demo-script", API_ORIGIN);
  url.searchParams.set("siteId", SITE_ID);

  const res = await fetch(url.toString(), {
    method: "GET",
    credentials: "omit",
    mode: "cors",
  });

  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return normalizeIdleDemoScript(data);
}

async function maybeStartIdleDemo() {
  if (!INLINE) return false;
  if (alreadyInteracted()) return false;
  if (history && history.length > 0) return false;

  let script = null;
  try {
    script = await fetchIdleDemoScript();
  } catch (err) {
    log("idleDemo: fetch failed", err?.message || err);
    return false;
  }

  if (!script) return false;
  if (alreadyInteracted()) return false;
  if (history && history.length > 0) return false;

  idleDemoScript = script;
  idleDemoStepIndex = 0;
  demoMessages = [];
  demoTypingActive = false;
  demoActive = true;
  showWelcomeHint = false;
  renderAll();

  scheduleIdleDemo(playIdleDemoStep, script.startDelayMs);
  return true;
}

function bindIdleDemoStopListeners() {
  if (!INLINE || idleDemoListenersBound) return;
  idleDemoListenersBound = true;

  const onUserAction = (evt) => handleWidgetUserInteraction(evt, { hard: false });
  shadow.addEventListener("click", onUserAction, true);
  shadow.addEventListener("keydown", onUserAction, true);
  input.addEventListener("focusin", onUserAction, true);
}

function runInlineAutostart(cfg) {
  if (!INLINE) return;                               // Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â inline
  if (!cfg || cfg.enabled !== true) return;

  const script = Array.isArray(cfg.script) ? cfg.script : [];
  if (!script.length) return;

  // Если уже было реальное взаимодействие в сессии — не запускаем сценарий,
  // оставляем обычный приветственный placeholder.
  if (alreadyInteracted()) {
    showWelcomeHint = true;
    updateEmptyHint();
    return;
  }

  // если уже есть история – не спамим (приветствие только когда чат "чистый")
  if (history && history.length > 0) return;

  const mode = (cfg.mode || "always").toLowerCase();
  const cooldownMinutes = Math.max(0, cfg.cooldownMinutes || 0);
  const now = Date.now();

  // ÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â½ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â·ÃƒÂÃ‚Â°ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã‚Â (session/cooldown), ÃƒÂÃ‚Â° Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¹ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â
  // Ãƒâ€˜Ã¢â‚¬Â¦ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â½Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã‚Â ÃƒÂÃ‚Âº ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¼Ãƒâ€˜Ã†â€™ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¼Ãƒâ€˜Ã†â€™ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã…Â½
  function fallbackToWelcome() {
    if (!history || !history.length) {
      showWelcomeHint = true;
      updateEmptyHint();
    }
  }

  if (mode === "session") {
    if (sessionStorage.getItem(INLINE_AUTO_SESSION_KEY) === "1") {
      // ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â¶ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â» ÃƒÂÃ‚Â² Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂºÃƒÂÃ‚Â»ÃƒÂÃ‚Â°ÃƒÂÃ‚Â´ÃƒÂÃ‚ÂºÃƒÂÃ‚Âµ ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂºÃƒÂÃ‚Â»Ãƒâ€˜Ã…Â½Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¹Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Â¦ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬
      fallbackToWelcome();
      return;
    }
    sessionStorage.setItem(INLINE_AUTO_SESSION_KEY, "1");
  } else if (mode === "cooldown" && cooldownMinutes > 0) {
    const lastTs = +(localStorage.getItem(INLINE_AUTO_COOLDOWN_KEY) || 0);
    const diffMin = (now - lastTs) / 60000;
    if (diffMin < cooldownMinutes) {
      fallbackToWelcome();
      return;
    }
    localStorage.setItem(INLINE_AUTO_COOLDOWN_KEY, String(now));
  }
  // mode === "always" ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂµÃƒÂÃ‚Â· ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¹

  // ÃƒÂÃ¢â‚¬Â¢Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã…Â½ÃƒÂÃ‚Â´ÃƒÂÃ‚Â° ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Â ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¹Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â±Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â½Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã‚Â ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â»ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¹Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Â¦ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â±ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼
  showWelcomeHint = false;
  updateEmptyHint();

  let totalDelay = 0;

  script.forEach((stepRaw, idx) => {
    const step = stepRaw || {};
    const text = sanitize(step.text || "");
    if (!text) return;

    const delay = Math.max(0, step.delayMs || 0);
    totalDelay += delay;

    const tid = setTimeout(() => {
      // ÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â·ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â¶ÃƒÂÃ‚Âµ Ãƒâ€˜Ã†â€™Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂµÃƒÂÃ‚Â» Ãƒâ€˜Ã¢â‚¬Â¡Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾-Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â½ÃƒÂÃ‚Âµ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¿ÃƒÂÃ‚Â°ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼
      if (alreadyInteracted()) return;

      history.push({
        role: "assistant",
        content: text,
        meta: { kind: "inlineAutostart", stepIndex: idx },
        ts: Date.now()
      });
      writeHistory(history);
      renderAll();
    }, totalDelay);

    INLINE_AUTO_TIMEOUTS.push(tid);
  });
}

function fmtTime(ts){
  try{
    return new Date(ts).toLocaleTimeString(LANG.startsWith("ru") ? "ru-RU" : "en-US", { hour:"2-digit", minute:"2-digit" });
  }catch{ return ""; }
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkify(html) {
  if (!html) return "";

  // URL: http(s)://... ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ www....
  const urlPattern = /\b((https?:\/\/|www\.)[^\s<]+[^\s<\.)])/gi;

  // email
  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

  // Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â½ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â»ÃƒÂÃ‚Â° URL
  let out = html.replace(urlPattern, (match, url) => {
    let href = url;
    if (!/^https?:\/\//i.test(href)) {
      href = "https://" + href;        // ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â www. ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼ https://
    }
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });

  // ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¼ email
  out = out.replace(emailPattern, (email) => {
    return `<a href="mailto:${email}">${email}</a>`;
  });

  return out;
}

function renderMarkdownBasic(text) {
  const cleaned = String(text || "").replace(/\s+$/g, "");
  let html = escapeHtml(cleaned);

  // ÃƒÂÃ¢â‚¬â€ÃƒÂÃ‚Â°ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¸ markdown: ###, ##, #
  html = html.replace(/^###\s+(.+)$/gm, "<div class=\"aiw-h3\">$1</div>");
  html = html.replace(/^##\s+(.+)$/gm, "<div class=\"aiw-h2\">$1</div>");
  html = html.replace(/^#\s+(.+)$/gm, "<div class=\"aiw-h1\">$1</div>");

  // **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // `code`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Â¹ Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚Âº
  html = html.replace(/\n/g, "<br>");

  // ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾-ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂºÃƒÂÃ‚Â° URL ÃƒÂÃ‚Â¸ email
  html = linkify(html);

  return html;
}

// Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚Â·ÃƒÂÃ‚Â´ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬ËœÃƒÂÃ‚Â¼ DOM ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â°ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚Â ÃƒÂÃ‚Â¸ Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â·Ãƒâ€˜Ã†â€™ ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â±ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ ÃƒÂÃ‚ÂµÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â² messagesWrap
function appendMessageDOM(m) {
  const isUser = m.role === "user";

  const row = document.createElement("div");
  row.className = "aiw-row " + (isUser ? "me" : "ai");

  // ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â€šÂ¬
  const ava = document.createElement("div");
  ava.className = "aiw-ava " + (isUser ? "me" : "ai");

  if (!isUser && LOGO) {
    // ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¿ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ÃƒÂÃ‚Â½ÃƒÂÃ‚Â° ÃƒÂÃ‚Â·ÃƒÂÃ‚Â°ÃƒÂÃ‚Â³Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·ÃƒÂÃ‚ÂºÃƒÂÃ‚Â°, ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â·ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂºÃƒâ€˜Ã‚ÂÃƒâ€˜Ã‹â€ ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã†â€™ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡
    const img = document.createElement("img");
    img.src = LOGO;
    img.alt = "logo";
    ava.appendChild(img);
  } else if (isUser) {
    ava.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="8" r="4" fill="currentColor"></circle>
        <path d="M4 20c1.5-3 3.5-5 8-5s6.5 2 8 5" fill="currentColor"></path>
      </svg>
    `;
  }

  if (!isUser) row.appendChild(ava);

  // ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã…â€™ + ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼Ãƒâ€˜Ã‚Â
  const bubbleWrap = document.createElement("div");
  bubbleWrap.className = "aiw-bubble-wrap";

  const bubble = document.createElement("div");
  bubble.className = "aiw-bubble";
bubble.innerHTML = renderMarkdownBasic(m.content);
  bubbleWrap.appendChild(bubble);

  const time = document.createElement("div");
  time.className = "aiw-time";
  time.textContent = fmtTime(m.ts || Date.now());
  bubbleWrap.appendChild(time);

  row.appendChild(bubbleWrap);

  if (isUser) row.appendChild(ava);

  messagesWrap.appendChild(row);

  return { row, bubble, time };
}

// ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â·Ãƒâ€˜Ã†â€™ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³ÃƒÂÃ‚Â´ÃƒÂÃ‚Â° Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â°ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â½Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â¶ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â²Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Ëœ ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™
function renderAll() {
  while (messagesWrap.firstChild) messagesWrap.removeChild(messagesWrap.firstChild);
  const messagesToRender = visibleMessages();
  for (const m of messagesToRender) {
    appendMessageDOM(m);
  }
  updateDemoBadge();
  if (INLINE && demoActive && demoTypingActive) showTyping(getCurrentDemoTypingRole());
  else hideTyping();
  updateEmptyHint();
  // ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Âµ: Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼ Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ ÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ Ãƒâ€˜Ã…Â½ÃƒÂÃ‚Â·ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ ÃƒÂÃ‚Â±Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â» pinned
scrollToBottom(false);
  postHeight();
}


function postHeight() {
  try {
    if (FIT_MODE === "container") return; // Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â´ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â°ÃƒÂÃ‚Â¼ Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¹
    if (window.parent && window.parent !== window) {
      const h = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: "aiw:resize", height: h }, "*");
    }
  } catch {}
}

  renderAll();
  scrollToBottom(true); 

  try {
  const ro = new ResizeObserver(() => postHeight());
  ro.observe(document.documentElement);
} catch {}

let open = INLINE ? true : false;
const INLINE_ANCHOR_BUTTON_ENABLED = !INLINE && INLINE_ANCHOR_BUTTON.enabled;
let lastInlineAnchorResolveSource = "none";

function querySelectorSafe(selector) {
  const normalized = toText(selector || "").trim();
  if (!normalized) return null;
  try {
    return document.querySelector(normalized);
  } catch {
    return null;
  }
}

function isInlineAnchorScrollable(el) {
  if (!el || el.nodeType !== 1) return false;
  let st = null;
  try { st = window.getComputedStyle(el); } catch {}
  if (!st) return false;
  const oy = st.overflowY;
  const ox = st.overflowX;
  const canY = (oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 1;
  const canX = (ox === "auto" || ox === "scroll" || ox === "overlay") && el.scrollWidth > el.clientWidth + 1;
  return canY || canX;
}

function pickInlineAnchorScrollContainer(target) {
  let cur = target;
  while (cur && cur !== document.documentElement) {
    if (isInlineAnchorScrollable(cur)) return cur;
    cur = cur.parentElement;
  }

  const knownSelectors = [
    "[data-scroll-container]",
    "#smooth-wrapper",
    "#smooth-content",
    "#app",
    "#root",
    "main",
    ".app",
    ".root"
  ];
  for (let i = 0; i < knownSelectors.length; i += 1) {
    const found = querySelectorSafe(knownSelectors[i]);
    if (isInlineAnchorScrollable(found)) return found;
  }

  return document.scrollingElement || document.documentElement;
}

function applyAnchorBlockTop(baseTop, viewportHeight, targetHeight, block) {
  if (block === "center") {
    return baseTop - (viewportHeight / 2 - targetHeight / 2);
  }
  if (block === "end") {
    return baseTop - (viewportHeight - targetHeight);
  }
  return baseTop;
}

function getInlineAnchorWindowY() {
  return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

function getInlineAnchorWindowX() {
  return window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
}

function dispatchInlineAnchorWheel(dy, dx, target, scroller) {
  const y = Number(dy) || 0;
  const x = Number(dx) || 0;
  if (!y && !x) return false;
  const opts = { deltaY: y, deltaX: x, deltaMode: 0, bubbles: true, cancelable: true };
  try { window.dispatchEvent(new WheelEvent("wheel", opts)); } catch {}
  try { document.dispatchEvent(new WheelEvent("wheel", opts)); } catch {}
  try { document.body && document.body.dispatchEvent(new WheelEvent("wheel", opts)); } catch {}
  try { document.documentElement && document.documentElement.dispatchEvent(new WheelEvent("wheel", opts)); } catch {}
  try { if (target && target.dispatchEvent) target.dispatchEvent(new WheelEvent("wheel", opts)); } catch {}
  try { if (scroller && scroller.dispatchEvent) scroller.dispatchEvent(new WheelEvent("wheel", opts)); } catch {}
  return true;
}

function tryInlineAnchorSmoothScrollAPIs(target, top, behavior, offsetPx) {
  const smooth = behavior !== "auto";
  const offset = Number(offsetPx) || 0;

  // GSAP ScrollSmoother
  try {
    if (window.ScrollSmoother && typeof window.ScrollSmoother.get === "function") {
      const sm = window.ScrollSmoother.get();
      if (sm) {
        if (typeof sm.scrollTo === "function") {
          try {
            sm.scrollTo(target, smooth);
          } catch {
            sm.scrollTo(top, smooth);
          }
          return "gsap-smoother";
        }
        if (typeof sm.scrollTop === "function") {
          sm.scrollTop(top);
          return "gsap-smoother";
        }
      }
    }
  } catch {}

  // Lenis
  try {
    const lenis = window.lenis || window.__lenis || window.lenisInstance;
    if (lenis && typeof lenis.scrollTo === "function") {
      const opts = smooth ? { offset } : { offset, immediate: true };
      try {
        lenis.scrollTo(target, opts);
      } catch {
        lenis.scrollTo(top, opts);
      }
      return "lenis";
    }
  } catch {}

  // Locomotive Scroll
  try {
    const loco = window.locomotiveScroll || window.locoScroll || window.__locomotiveScroll;
    if (loco && typeof loco.scrollTo === "function") {
      const opts = smooth
        ? { offset }
        : { offset, duration: 0, disableLerp: true };
      try {
        loco.scrollTo(target, opts);
      } catch {
        loco.scrollTo(top, opts);
      }
      return "locomotive";
    }
  } catch {}

  return "";
}

function resolveInlineAnchorTarget() {
  lastInlineAnchorResolveSource = "none";
  const configuredTarget = toText(INLINE_ANCHOR_BUTTON.anchorTarget || "").trim();
  if (configuredTarget) {
    if (configuredTarget.startsWith("#")) {
      const byHash = querySelectorSafe(configuredTarget);
      if (byHash) {
        lastInlineAnchorResolveSource = "config:hash-selector";
        return byHash;
      }
      const byId = document.getElementById(configuredTarget.slice(1));
      if (byId) {
        lastInlineAnchorResolveSource = "config:hash-id";
        return byId;
      }
    }
    const bySelector = querySelectorSafe(configuredTarget);
    if (bySelector) {
      lastInlineAnchorResolveSource = "config:selector";
      return bySelector;
    }
    const byId = document.getElementById(configuredTarget);
    if (byId) {
      lastInlineAnchorResolveSource = "config:id";
      return byId;
    }
  }

  const registry = (window.__AIW_INLINE_TARGETS__ && typeof window.__AIW_INLINE_TARGETS__ === "object")
    ? window.__AIW_INLINE_TARGETS__
    : null;
  if (registry) {
    const siteKey = toText(SITE_ID || "").trim();
    const siteTargets = Array.isArray(registry[siteKey]) ? registry[siteKey] : [];
    for (let i = 0; i < siteTargets.length; i += 1) {
      const el = siteTargets[i];
      if (el && el.nodeType === 1 && el.isConnected) {
        lastInlineAnchorResolveSource = "registry:site";
        return el;
      }
    }
    const allTargets = Array.isArray(registry.__all) ? registry.__all : [];
    for (let i = 0; i < allTargets.length; i += 1) {
      const el = allTargets[i];
      if (el && el.nodeType === 1 && el.isConnected) {
        lastInlineAnchorResolveSource = "registry:all";
        return el;
      }
    }
  }

  // Loader script often knows the inline mount via data-target/data-aiw-inline.
  // Use it as a fallback so host pages don't need extra anchor attributes.
  const loaderScripts = document.querySelectorAll("script[data-target], script[data-aiw-inline]");
  for (let i = 0; i < loaderScripts.length; i += 1) {
    const scriptEl = loaderScripts[i];
    const scriptSiteId = toText(
      scriptEl.getAttribute("data-site-id") ||
      scriptEl.getAttribute("data-site") ||
      scriptEl.getAttribute("data-tenant")
    ).trim();
    if (scriptSiteId && scriptSiteId !== SITE_ID) continue;

    const targetSelector = toText(scriptEl.getAttribute("data-target") || "").trim();
    if (targetSelector) {
      const byScriptTarget = querySelectorSafe(targetSelector);
      if (byScriptTarget) {
        lastInlineAnchorResolveSource = "script:data-target";
        return byScriptTarget;
      }
      if (targetSelector.startsWith("#")) {
        const byScriptId = document.getElementById(targetSelector.slice(1));
        if (byScriptId) {
          lastInlineAnchorResolveSource = "script:data-target-id";
          return byScriptId;
        }
      }
    }

    const inlineId = toText(scriptEl.getAttribute("data-aiw-inline") || "").trim();
    if (inlineId) {
      const byInlineId = document.getElementById(inlineId);
      if (byInlineId) {
        lastInlineAnchorResolveSource = "script:data-aiw-inline";
        return byInlineId;
      }
    }
  }

  const inlineFrames = document.querySelectorAll("iframe[src*=\"widget-frame.html\"]");
  for (let i = 0; i < inlineFrames.length; i += 1) {
    const frame = inlineFrames[i];
    let parsed = null;
    try {
      parsed = new URL(frame.getAttribute("src") || "", location.href);
    } catch {}
    if (!parsed) continue;
    const frameSiteId = toText(parsed.searchParams.get("siteId") || "").trim();
    if (frameSiteId && frameSiteId !== SITE_ID) continue;
    const frameMode = toText(parsed.searchParams.get("mode") || "").trim().toLowerCase();
    if (frameMode && frameMode !== "inline") continue;
    lastInlineAnchorResolveSource = "iframe:widget-frame";
    return frame;
  }

  const fallbackSelectors = [
    "[data-aiw-inline-anchor]",
    "[data-aiw-inline-widget]",
    "[data-aiw-mode=\"inline\"]",
    "iframe[data-aiw-mode=\"inline\"]",
    "iframe[src*=\"mode=inline\"]"
  ];
  for (let i = 0; i < fallbackSelectors.length; i += 1) {
    const found = querySelectorSafe(fallbackSelectors[i]);
    if (found) {
      lastInlineAnchorResolveSource = `fallback:${fallbackSelectors[i]}`;
      return found;
    }
  }
  return null;
}

function navigateInlineAnchorButtonToInlineTarget() {
  if (INLINE) return false;
  const configuredTarget = toText(INLINE_ANCHOR_BUTTON.anchorTarget || "").trim();
  const target = resolveInlineAnchorTarget();
  launcherLog("anchor.resolve", {
    siteId: SITE_ID,
    renderMode: RENDER_MODE,
    mode: "inlineAnchorButton",
    configuredTarget,
    resolved: !!target,
    source: lastInlineAnchorResolveSource
  });
  if (!target) {
    launcherLog("anchor.miss", { configuredTarget, mode: "inlineAnchorButton" });
    return false;
  }

  const behavior = INLINE_ANCHOR_BUTTON.anchorBehavior === "auto" ? "auto" : "smooth";
  const block = INLINE_ANCHOR_BUTTON.anchorBlock || "start";
  const offsetPx = Number(INLINE_ANCHOR_BUTTON.anchorOffsetPx) || 0;

  const scroller = pickInlineAnchorScrollContainer(target);
  const isWindowScroller =
    !scroller ||
    scroller === document.scrollingElement ||
    scroller === document.documentElement ||
    scroller === document.body;
  const targetRect = target.getBoundingClientRect();
  let fallbackStrategy = "";
  let nativeScrollMoved = false;

  if (isWindowScroller) {
    const beforeY = getInlineAnchorWindowY();
    const beforeX = getInlineAnchorWindowX();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    let top = targetRect.top + window.pageYOffset;
    top = applyAnchorBlockTop(top, viewportHeight, targetRect.height || 0, block) + offsetPx;
    fallbackStrategy = tryInlineAnchorSmoothScrollAPIs(target, top, behavior, offsetPx);
    if (!fallbackStrategy) {
      try {
        window.scrollTo({ top, behavior });
      } catch {
        window.scrollTo(0, top);
      }
      const afterY = getInlineAnchorWindowY();
      const afterX = getInlineAnchorWindowX();
      nativeScrollMoved = Math.abs(afterY - beforeY) > 1 || Math.abs(afterX - beforeX) > 1;
      if (!nativeScrollMoved) {
        const fallbackDy = applyAnchorBlockTop(
          target.getBoundingClientRect().top,
          viewportHeight,
          targetRect.height || 0,
          block
        ) + offsetPx;
        dispatchInlineAnchorWheel(fallbackDy, 0, target, scroller);
        fallbackStrategy = "wheel-event";
      }
    }
  } else {
    const beforeTop = Number(scroller.scrollTop) || 0;
    const scrollerRect = scroller.getBoundingClientRect();
    const viewportHeight = scroller.clientHeight || scrollerRect.height || 0;
    let top = scroller.scrollTop + (targetRect.top - scrollerRect.top);
    top = applyAnchorBlockTop(top, viewportHeight, targetRect.height || 0, block) + offsetPx;
    try {
      scroller.scrollTo({ top, behavior });
    } catch {
      scroller.scrollTop = top;
    }
    const afterTop = Number(scroller.scrollTop) || 0;
    nativeScrollMoved = Math.abs(afterTop - beforeTop) > 1;
    if (!nativeScrollMoved) {
      fallbackStrategy = tryInlineAnchorSmoothScrollAPIs(target, top, behavior, offsetPx);
      if (!fallbackStrategy) {
        const fallbackDy = applyAnchorBlockTop(
          target.getBoundingClientRect().top,
          viewportHeight,
          targetRect.height || 0,
          block
        ) + offsetPx;
        dispatchInlineAnchorWheel(fallbackDy, 0, target, scroller);
        fallbackStrategy = "wheel-event";
      }
    }
  }

  const targetHash = target.id ? `#${target.id}` : (configuredTarget.startsWith("#") ? configuredTarget : "");
  // Intentionally keep URL untouched to avoid host router/hash navigation side effects.
  launcherLog("anchor.scroll", {
    source: lastInlineAnchorResolveSource,
    targetTag: target.tagName || "",
    targetId: target.id || "",
    behavior,
    block,
    offsetPx,
    targetHash,
    scrollerTag: scroller && scroller.tagName ? scroller.tagName : "window",
    scrollerId: scroller && scroller.id ? scroller.id : "",
    scrollerClass: scroller && typeof scroller.className === "string" ? scroller.className : "",
    nativeScrollMoved,
    fallbackStrategy: fallbackStrategy || "none"
  });
  return true;
}

function openFloatPanel() {
  if (INLINE) return;
  if (INLINE_ANCHOR_BUTTON_ENABLED) return;
  if (open) return;
  open = true;
  panel.style.display = "flex";
  launcherLog("panel.open", { open });
  syncFloatLauncherOpenState();
  if (RESET_HISTORY_ON_OPEN) {
    try { if (STORAGE) STORAGE.removeItem(storeKey); } catch {}
    try { sessionStorage.removeItem(USER_INTERACTED_KEY); } catch {}
    history = [];
    writeHistory(history);
    renderAll();
  }
  setTimeout(() => input.focus(), 0);
}

function closeFloatPanel() {
  if (INLINE) return;
  if (!open) return;
  open = false;
  if (inlineFullscreen) {
    setInlineFullscreenState(false);
  }
  panel.style.display = "none";
  launcherLog("panel.close", { open });
  syncFloatLauncherOpenState();
}

function toggleFloatPanel() {
  if (INLINE) return;
  if (open) {
    closeFloatPanel();
    return;
  }
  openFloatPanel();
}

function syncFloatLauncherOpenState() {
  if (INLINE) return;
  if (INLINE_ANCHOR_BUTTON_ENABLED && open) {
    open = false;
  }
  btn.classList.toggle("aiw-btn-open", open);
  btn.classList.toggle("aiw-btn-closed", !open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  const collapsedLabel = INLINE_ANCHOR_BUTTON_ENABLED
    ? (INLINE_ANCHOR_BUTTON.label || (LANG.startsWith("ru") ? "\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a \u0447\u0430\u0442\u0443" : "Go to chat"))
    : (LANG.startsWith("ru") ? "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0447\u0430\u0442" : "Open chat");
  btn.setAttribute(
    "aria-label",
    open
      ? (LANG.startsWith("ru") ? "\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u0447\u0430\u0442" : "Collapse chat")
      : collapsedLabel
  );
  if (btn.classList.contains("aiw-btn-pill")) {
    applyFloatLauncherState(currentFloatLauncherState);
  }
}

if (!INLINE) {
  btn.addEventListener("click", () => {
    launcherLog("click", {
      open,
      renderMode: RENDER_MODE,
      inlineAnchorButton: INLINE_ANCHOR_BUTTON_ENABLED
    });
    if (INLINE_ANCHOR_BUTTON_ENABLED) {
      const navigated = navigateInlineAnchorButtonToInlineTarget();
      launcherLog("click.anchor-result", { navigated });
      return;
    }
    toggleFloatPanel();
  });
  close.addEventListener("click", () => {
    closeFloatPanel();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!open) return;
    e.preventDefault();
    if (inlineFullscreen) {
      setInlineFullscreenState(false);
      return;
    }
    closeFloatPanel();
  });
  syncFloatLauncherOpenState();
} else {
  // ÃƒÂÃ‚Â² inline ÃƒÂÃ‚Â·ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚ÂºÃƒâ€˜Ã†â€™ ÃƒÂÃ‚Â¼ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¶ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™ ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â½ÃƒÂÃ‚Â° Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂºÃƒâ€˜Ã†â€™Ãƒâ€˜Ã‚Â
  close.style.display = "none";

  if (window.parent && window.parent !== window) {
    window.addEventListener("message", (e) => {
      if (PARENT_ORIGIN !== "*" && e.origin !== PARENT_ORIGIN) return;
      const d = e.data || {};
      if (!d || typeof d !== "object") return;
      if (d.type !== "aiw:fullscreen-state") return;
      if (d.instanceId && INSTANCE_ID && d.instanceId !== INSTANCE_ID) return;
      setInlineFullscreenState(!!d.value);
    }, { passive: true });

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!inlineFullscreen) return;
      if (inlineBusy) return;
      e.preventDefault();
      postInlineFullscreen(false);
    });

    // If the iframe was reparented/reloaded, request the current state from parent.
    requestInlineFullscreenState();
    setTimeout(requestInlineFullscreenState, 120);
    setTimeout(requestInlineFullscreenState, 400);
  }
}

resetBtn.addEventListener("click", (e) => {
  e.preventDefault();
  stopIdleDemo({ clearMessages: true, restoreWelcome: false });

  try {
    if (STORAGE) STORAGE.removeItem(storeKey);
  } catch {}
  try { sessionStorage.removeItem(USER_INTERACTED_KEY); } catch {}

  // ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚Âµ Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â° Ãƒâ€˜Ã¢â‚¬Â¦ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã…â€™ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â½Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã…â€™
  showWelcomeHint = true;

  history = [];
  writeHistory(history);
  SESSION_ID = newSessionId();
  input.value = "";
  updateCounter();
  autoResizeInput();
  renderAll();
});

  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } });
  sendBtn.addEventListener("click", doSend);

function pumpSSE(reader, onData) {
  const decoder = new TextDecoder();
  let buffer = "";
  return (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || "";
      parts.forEach(block =>
        block.split(/\r?\n/).forEach(ln => {
          if (ln.startsWith("data:")) onData(ln.slice(5));   
        })
      );
    }
    if (buffer)
      buffer.split(/\r?\n/).forEach(ln => {
        if (ln.startsWith("data:")) onData(ln.slice(5));     
      });
  })();
}

  let inflight = null;

function panelIsHidden() {
  if (INLINE) return false;
  try { return getComputedStyle(panel).display === "none"; } catch { return false; }
}
function openPanelIfHidden() {
  if (INLINE) return; // ÃƒÂÃ‚Â² inline ÃƒÂÃ‚Â²Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂµÃƒÂÃ‚Â³ÃƒÂÃ‚Â´ÃƒÂÃ‚Â° ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂºÃƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â‚¬Å¡
  if (INLINE_ANCHOR_BUTTON_ENABLED) return;
  if (!panelIsHidden()) return;
  openFloatPanel();
}

function showLocalGreeting() {
  if (!AUTO_MSG) { log("showLocalGreeting: no AUTO_MSG"); return; }
  log("showLocalGreeting: start");
  openPanelIfHidden();
  showTyping();
  setTimeout(() => {
    hideTyping();
    dedupeAutogreetAtTail();
    history.push({ role: "assistant", content: AUTO_MSG, meta: { kind: "autogreet" }, ts: Date.now()});
    writeHistory(history);
    renderAll();
    log("showLocalGreeting: message pushed");
    markAutoGreetUsed();
  }, 250);
}

  async function fetchAIGreeting() {
    const wasPinnedAtStart = userPinnedToBottom;
    openPanelIfHidden();
    const safeMsgs = [
      { role: "system", content: "You are a concise, friendly website assistant." },
      { role: "user",   content: AUTO_PROMPT || "Write a short warm greeting and suggest 3 quick questions." }
    ];

    const controller = new AbortController();
    try {
      showTyping();

      const meta = collectMeta();
      // ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â´ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚Â ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚Â°ÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¸ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â½ÃƒÂÃ‚Â° ÃƒÂÃ‚Â±Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂºÃƒÂÃ‚Âµ
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-aiw-site": SITE_ID,
          "x-aiw-visitor": VISITOR_ID,
          "x-aiw-session": SESSION_ID
        },
        body: JSON.stringify({
          messages: safeMsgs,
            stream: STREAM,  
          meta: { ...meta, startedBy: "system", startedReason: "autogreet" }
        }),
        signal: controller.signal,
        keepalive: true,
        mode: "cors"
      });

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("text/event-stream")) {
        const raw = await res.text();
        let reply = "";
        try { reply = (JSON.parse(raw) || {}).reply || ""; } catch { reply = raw || ""; }
        dedupeAutogreetAtTail();
        history.push({ role: "assistant", content: reply || (LANG.startsWith("ru") ? "ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦" : "ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦"), meta: { kind: "autogreet" }, ts: Date.now()});
        writeHistory(history);
        renderAll();
         log("fetchAIGreeting(JSON): message pushed, length=", (reply||"").length);
    markAutoGreetUsed();
    return;
      }

// SSE
const msg = { role: "assistant", content: "", ts: Date.now() };
history.push(msg);
writeHistory(history);

// ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã…â€™ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚Â·ÃƒÂÃ‚Â´ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬ËœÃƒÂÃ‚Â¼ Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾, ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ÃƒÂÃ‚Â³ÃƒÂÃ‚Â´ÃƒÂÃ‚Â° ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â´Ãƒâ€˜Ã¢â‚¬ËœÃƒâ€˜Ã¢â‚¬Å¡ ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â²Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â¹ chunk
let rendered = false;
let bubble;

const reader = res.body.getReader();
await pumpSSE(reader, (data) => {
  if (data.trim() === "[DONE]") return;
    const chunk = data.replace(/\\n/g, "\n");
  msg.content += chunk;

  if (!rendered && hasRenderableAssistantContent(msg.content)) {
    // первый кусок — убираем точки и рисуем пузырь
    hideTyping();
    const dom = appendMessageDOM(msg);
    bubble = dom.bubble;
    updateEmptyHint();
    rendered = true;
  }

  if (bubble) {
      bubble.innerHTML = renderMarkdownBasic(msg.content);
    if (wasPinnedAtStart) scrollToBottom();
    postHeight();
  }
});

if (!rendered) {
  msg.content = hasRenderableAssistantContent(msg.content)
    ? msg.content
    : (LANG.startsWith("ru") ? "â€¦" : "â€¦");
  hideTyping();
  const dom = appendMessageDOM(msg);
  bubble = dom.bubble;
  updateEmptyHint();
  rendered = true;
  if (wasPinnedAtStart) scrollToBottom();
  postHeight();
}

writeHistory(history);

log("fetchAIGreeting(SSE): stream ended, len=", (msg.content || "").length);
markAutoGreetUsed();

    } catch (e) {
      history.push({ role: "assistant", content: LANG.startsWith("ru") ? "ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â ÃƒÂÃ…Â¾Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂºÃƒÂÃ‚Â° Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚ÂµÃƒÂÃ‚Â´ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚Â" : "ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Connection error" });
      writeHistory(history);
      renderAll();
    } finally {
      hideTyping();
    }
  }

function scheduleAutoGreet() {
  if (!AUTOSTART) return;
  if (INLINE_ANCHOR_BUTTON_ENABLED) return;
  if (!shouldAutoGreetNow()) return;

  log("scheduleAutoGreet: scheduled in", AUTO_DELAY, "ms");

  AUTO_TIMER_ID = setTimeout(() => {
    AUTO_TIMER_ID = null; // Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â¹ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â±ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â»

    // ÃƒÂÃ‚ÂµÃƒâ€˜Ã‚ÂÃƒÂÃ‚Â»ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚Â·ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â¶ÃƒÂÃ‚Âµ Ãƒâ€˜Ã¢â‚¬Â¡Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾-Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â» ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ÃƒÂÃ‚Â½ÃƒÂÃ‚Âµ ÃƒÂÃ‚Â¿ÃƒÂÃ‚Â¾ÃƒÂÃ‚ÂºÃƒÂÃ‚Â°ÃƒÂÃ‚Â·Ãƒâ€˜Ã¢â‚¬Â¹ÃƒÂÃ‚Â²ÃƒÂÃ‚Â°ÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â²ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¸ÃƒÂÃ‚Âµ
    if (alreadyInteracted()) {
      log("scheduleAutoGreet: cancelled because user already interacted");
      return;
    }

    log("scheduleAutoGreet: timer fired");
    if (!shouldAutoGreetNow()) {
      log("scheduleAutoGreet: recheck blocked");
      return;
    }

    if (AUTO_MODE === "ai") {
      log("autogreet -> AI mode");
      if (RESET_HISTORY_ON_OPEN) {
        try { if (STORAGE) STORAGE.removeItem(storeKey); } catch {}
        history = []; writeHistory(history); renderAll();
      }
      fetchAIGreeting();
    } else {
      log("autogreet -> LOCAL mode");
      if (RESET_HISTORY_ON_OPEN) {
        try { if (STORAGE) STORAGE.removeItem(storeKey); } catch {}
        history = []; writeHistory(history); renderAll();
      }
      showLocalGreeting();
    }
  }, AUTO_DELAY);
}

  async function doSend() {
    const text = sanitize(input.value).trim();
    if (!text || inflight) return;

    handleWidgetUserInteraction({ type: "send" }, { hard: true });


    history.push({ role: "user", content: text, ts: Date.now() });
    writeHistory(history);
    renderAll();
    input.value = "";
    updateCounter(); 
    autoResizeInput();

    const safeMsgs = history.map(({ role, content }) => ({ role, content })).slice(-30);
    const controller = new AbortController();
    inflight = controller;
    setInlineBusyState(true);
    postInlineBusyState(true);
const wasPinnedAtStart = userPinnedToBottom;
    try {
      
      showTyping();

      const meta = collectMeta();

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-aiw-site": SITE_ID,
    "x-aiw-visitor": VISITOR_ID,
    "x-aiw-session": SESSION_ID
  },
  body: JSON.stringify({
    messages: safeMsgs,
      stream: STREAM, 
    meta // <- ÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â²ÃƒÂÃ‚Â»Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼ ÃƒÂÃ‚Â²Ãƒâ€˜Ã‚ÂÃƒâ€˜Ã…Â½ ÃƒÂÃ‚Â¼ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â‚¬Å¡Ãƒâ€˜Ã†â€™
  }),
  signal: controller.signal,
  keepalive: true,
  mode: "cors",
});

      const ct = (res.headers.get("content-type") || "").toLowerCase();

      if (!ct.includes("text/event-stream")) {
const raw = await res.text();
 let reply = "";
 let citations = [];
 try { 
   const obj = JSON.parse(raw) || {};
   reply = obj.reply || ""; 
   citations = Array.isArray(obj.citations) ? obj.citations : [];
 } catch { reply = raw || ""; }
history.push({
  role: "assistant",
  content: reply || (LANG.startsWith("ru") ? "ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦" : "ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦"),
  meta: { citations }, // ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¶ÃƒÂÃ‚ÂµÃƒÂÃ‚Â»ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¸ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾Ãƒâ€˜Ã¢â‚¬Â¦Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½Ãƒâ€˜Ã‚ÂÃƒÂÃ‚ÂµÃƒÂÃ‚Â¼, ÃƒÂÃ‚Â½ÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â½ÃƒÂÃ‚Âµ Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â´ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â¼
  ts: Date.now()
});

        writeHistory(history);
        renderAll();
        return;
      }

      // SSE mode
const msg = { role: "assistant", content: "", ts: Date.now() };
history.push(msg);
writeHistory(history);

// ÃƒÂÃ‚Â¿Ãƒâ€˜Ã†â€™ÃƒÂÃ‚Â·Ãƒâ€˜Ã¢â‚¬Â¹Ãƒâ€˜Ã¢â€šÂ¬Ãƒâ€˜Ã…â€™ Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚Â·ÃƒÂÃ‚Â´ÃƒÂÃ‚Â°Ãƒâ€˜Ã¢â‚¬ËœÃƒÂÃ‚Â¼ Ãƒâ€˜Ã¢â‚¬Å¡ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â»Ãƒâ€˜Ã…â€™ÃƒÂÃ‚ÂºÃƒÂÃ‚Â¾ ÃƒÂÃ‚Â¿Ãƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â¸ ÃƒÂÃ‚Â¿ÃƒÂÃ‚ÂµÃƒâ€˜Ã¢â€šÂ¬ÃƒÂÃ‚Â²ÃƒÂÃ‚Â¾ÃƒÂÃ‚Â¼ Ãƒâ€˜Ã¢â‚¬Â¡ÃƒÂÃ‚Â°ÃƒÂÃ‚Â½ÃƒÂÃ‚ÂºÃƒÂÃ‚Âµ
let rendered = false;
let bubble;

const reader = res.body.getReader();
await pumpSSE(reader, (data) => {
  if (data.trim() === "[DONE]") return;
  const chunk = data.replace(/\\n/g, "\n");
  msg.content += chunk;

  if (!rendered && hasRenderableAssistantContent(msg.content)) {
    // первый кусок — скрываем индикатор набора и добавляем пузырь
    hideTyping();
    const dom = appendMessageDOM(msg);
    bubble = dom.bubble;
    updateEmptyHint();
    rendered = true;
  }

if (bubble) {
  bubble.innerHTML = renderMarkdownBasic(msg.content);
   if (wasPinnedAtStart) scrollToBottom();
  postHeight();
}
});

if (!rendered) {
  msg.content = hasRenderableAssistantContent(msg.content)
    ? msg.content
    : (LANG.startsWith("ru") ? "â€¦" : "â€¦");
  hideTyping();
  const dom = appendMessageDOM(msg);
  bubble = dom.bubble;
  updateEmptyHint();
  rendered = true;
  if (wasPinnedAtStart) scrollToBottom();
  postHeight();
}

writeHistory(history);

    } catch (err) {
      history.push({ role: "assistant", content: LANG.startsWith("ru") ? "ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â ÃƒÂÃ…Â¾Ãƒâ€˜Ã‹â€ ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â±ÃƒÂÃ‚ÂºÃƒÂÃ‚Â° Ãƒâ€˜Ã‚ÂÃƒÂÃ‚Â¾ÃƒÂÃ‚ÂµÃƒÂÃ‚Â´ÃƒÂÃ‚Â¸ÃƒÂÃ‚Â½ÃƒÂÃ‚ÂµÃƒÂÃ‚Â½ÃƒÂÃ‚Â¸Ãƒâ€˜Ã‚Â" : "ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Connection error" });
      writeHistory(history); renderAll();
    } finally {
      hideTyping();
      inflight = null;
      setInlineBusyState(false);
      postInlineBusyState(false);
    }
  }

  // Global events
  function aiwOpen(){ try { openFloatPanel(); } catch {} }
  function aiwClose(){ try { closeFloatPanel(); } catch {} }
  function aiwToggle(){ try { toggleFloatPanel(); } catch {} }
  window.addEventListener("aiw:open", aiwOpen);
  window.addEventListener("aiw:close", aiwClose);
  window.addEventListener("aiw:toggle", aiwToggle);
  window.__AIW__ = { open: aiwOpen, close: aiwClose, toggle: aiwToggle };

function initClassicAutostart() {
  scheduleAutoGreet();

  log("init", {
    sessionFlag: sessionStorage.getItem(AUTO_KEY_SESSION),
    userInteracted: sessionStorage.getItem(USER_INTERACTED_KEY),
    lastTs: +localStorage.getItem(AUTO_KEY_LAST_TS) || 0,
    historyLen: (Array.isArray(history) ? history.length : -1)
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleAutoGreet();
      log("visible: recheck", {
        sessionFlag: sessionStorage.getItem(AUTO_KEY_SESSION),
        userInteracted: sessionStorage.getItem(USER_INTERACTED_KEY),
        lastTs: +localStorage.getItem(AUTO_KEY_LAST_TS) || 0,
        historyLen: (Array.isArray(history) ? history.length : -1)
      });
    }
  });
}

async function initGreetingFlows() {
  if (INLINE) {
    bindIdleDemoStopListeners();
    const demoStarted = await maybeStartIdleDemo();
    if (demoStarted) {
      log("init: idle demo started");
      return;
    }

    if (INLINE_AUTOSTART_CFG && INLINE_AUTOSTART_CFG.enabled) {
      log("init: inlineAutostart enabled");
      runInlineAutostart(INLINE_AUTOSTART_CFG);
      return;
    }
  }

  initClassicAutostart();
}

initGreetingFlows().catch((e) => {
  console.debug("[AIW][autogreet] trigger error:", e);
});
})();


