// cdn/aiw/widget-loader.js
(function () {
  const s = document.currentScript || (function () {
    const arr = document.getElementsByTagName("script");
    return arr[arr.length - 1];
  })();

  // --- host берём из src, data-host оставляем как override ---
  let scriptUrl = null;
  try {
    scriptUrl = new URL(s.getAttribute("src") || "", window.location.href);
  } catch (e) {}

  const host =
    s.getAttribute("data-host") ||              
    (scriptUrl ? scriptUrl.origin : "") ||      
    window.location.origin;                     // fallback

  // --- siteId / clientId ---
  const siteId =
    s.getAttribute("data-site-id") ||
    s.getAttribute("data-site") ||
    s.getAttribute("data-tenant");

  const clientId  = s.getAttribute("data-client-id") || null;

  const jsSrc =
    s.getAttribute("data-src") ||
    (host.replace(/\/$/, "") + "/aiw/widget.js");
  
    const hasDataSrc = !!s.getAttribute("data-src");

  // Minimal, privacy-friendly page visit telemetry (no cookies, no identifiers, no IP storage).
  function sendPageVisit() {
    if (!host || !siteId) return;
    const key = String(siteId);
    const sent = window.__AIW_TELEMETRY_SENT__ || {};
    if (sent[key]) return;
    sent[key] = true;
    window.__AIW_TELEMETRY_SENT__ = sent;

    try {
      const base = host.replace(/\/$/, "");
      const url = base + "/api/telemetry/page-visit";

      const pagePath = window.location.pathname || "/";
      let referrerDomain = "";
      try {
        if (document.referrer) {
          referrerDomain = new URL(document.referrer).hostname || "";
        }
      } catch {}

      const viewportW = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
      const viewportH = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);
      const tz = (Intl && Intl.DateTimeFormat) ? (Intl.DateTimeFormat().resolvedOptions().timeZone || "") : "";
      const lang = navigator.language || "";
      const ts = Date.now();

      let deviceType = "desktop";
      if (viewportW && viewportW <= 768) {
        deviceType = "mobile";
      } else if (viewportW && viewportW <= 1024) {
        deviceType = "tablet";
      }

      const payload = {
        siteId: String(siteId),
        pagePath,
        referrerDomain,
        deviceType,
        viewportW,
        viewportH,
        tz,
        lang,
        ts
      };

      const json = JSON.stringify(payload);
      let canBeacon = false;
      let targetOrigin = "";
      try {
        targetOrigin = new URL(url, window.location.href).origin;
        canBeacon = targetOrigin === window.location.origin;
      } catch {}

      if (canBeacon && navigator.sendBeacon) {
        const blob = new Blob([json], { type: "application/json" });
        navigator.sendBeacon(url, blob);
      } else {
        const isCrossOrigin = !targetOrigin || targetOrigin !== window.location.origin;
        const requestOptions = {
          method: "POST",
          credentials: "omit",
          mode: isCrossOrigin ? "no-cors" : "cors",
          keepalive: true,
          body: json
        };
        if (!isCrossOrigin) {
          requestOptions.headers = { "Content-Type": "application/json" };
        }
        fetch(url, requestOptions).catch(() => {});
      }
    } catch {}
  }

  sendPageVisit();

  // --- activity tracking (sections, tabs, visibility) ---
  (function initActivityTracking() {
    try {
      const trackAttr = s && s.getAttribute("data-track");
      const trackEnabled =
        trackAttr == null ||
        trackAttr === "" ||
        trackAttr === "1" ||
        trackAttr === "true";

      function attachLiveActivityLogger() {
        try {
          const activity = window.__AIW_ACTIVITY__;
          if (!activity || typeof activity.on !== "function") return false;
          if (window.__AIW_ACTIVITY_LIVE_LOGGER_ATTACHED__) return true;
          // activity.on((e) => console.log("[AIW][live]", e));
          window.__AIW_ACTIVITY_LIVE_LOGGER_ATTACHED__ = true;
          return true;
        } catch {
          return false;
        }
      }

      if (!trackEnabled) return;
      const hasExistingTracker = !!window.__AIW_ACTIVITY_TRACKER__;
      if (hasExistingTracker) {
        attachLiveActivityLogger();
      }

      const isDebug = (() => {
        try {
          const attr = s && s.getAttribute("data-track-debug");
          if (attr && (attr === "1" || attr === "true")) return true;
        } catch {}
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.get("aiwTrackDebug") === "1") return true;
        } catch {}
        try {
          return localStorage.getItem("aiwTrackDebug") === "1";
        } catch {}
        return false;
      })();

      const state = {
        events: [],
        listeners: [],
        sections: new Map(),
        sectionObserver: null,
        tabObserver: null,
        scrollHandler: null,
        resizeHandler: null,
        resizeTimer: null,
        mutationObserver: null,
        lastDepthStep: 0,
        visibleSince: document.visibilityState === "visible" ? Date.now() : null,
        totalVisibleMs: 0
      };

      const MAX_ACTIVITY_EVENTS = 500;

      function toBool(value, fallback) {
        if (value == null || value === "") return !!fallback;
        const norm = String(value).trim().toLowerCase();
        if (norm === "1" || norm === "true" || norm === "yes" || norm === "on") return true;
        if (norm === "0" || norm === "false" || norm === "no" || norm === "off") return false;
        return !!fallback;
      }

      function toNum(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
      }

      function toText(value) {
        return value == null ? "" : String(value);
      }

      function normToken(value) {
        return toText(value).trim().toLowerCase();
      }

      function safeJsonParse(raw) {
        if (typeof raw !== "string" || !raw.trim()) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }

      function normalizeNotifyRule(rule, index) {
        if (!rule || typeof rule !== "object") return null;

        const event = toText(rule.event || rule.when).trim();
        const message = toText(rule.message || rule.text).trim();
        if (!event || !message) return null;

        return {
          id: toText(rule.id || ("rule_" + String(index))).trim() || ("rule_" + String(index)),
          event,
          section: toText(rule.section || "").trim(),
          tab: toText(rule.tab || "").trim(),
          path: toText(rule.path || "").trim(),
          minDurationMs: toNum(rule.minDurationMs, 0),
          minScrollDepth: toNum(rule.minScrollDepth, 0),
          minVisibleMs: toNum(rule.minVisibleMs, 0),
          once: toBool(rule.once, true),
          cooldownMs: Math.max(0, toNum(rule.cooldownMs, 45000)),
          maxShows: Math.max(0, toNum(rule.maxShows, 1)),
          title: toText(rule.title || "AI Assistant").trim() || "AI Assistant",
          message,
          variant: toText(rule.variant || "info").trim() || "info",
          durationMs: Math.max(0, toNum(rule.durationMs, 6000)),
          ctaLabel: toText(rule.ctaLabel || "").trim(),
          ctaUrl: toText(rule.ctaUrl || "").trim(),
          position: toText(rule.position || "").trim(),
          allowWhileVisible: toBool(rule.allowWhileVisible, false)
        };
      }

      function parseNotifyRules(rawRules) {
        if (!rawRules) return [];
        let source = rawRules;

        if (typeof source === "string") {
          const parsed = safeJsonParse(source);
          source = parsed;
        }

        if (!Array.isArray(source)) return [];

        const list = [];
        for (let i = 0; i < source.length; i += 1) {
          const normalized = normalizeNotifyRule(source[i], i);
          if (normalized) list.push(normalized);
        }
        return list;
      }

      function createActivityNotifier() {
        const attrDebug = toBool(s && s.getAttribute("data-notify-debug"), false);

        const initialRules = [];

        let rules = initialRules.slice();
        const stats = {};
        let runtimeEnabled = false;
        const context = {
          section: "",
          tab: "",
          scrollDepth: 0,
          totalVisibleMs: 0,
          visible: document.visibilityState === "visible",
          pagePath: window.location.pathname || "/"
        };

        const variantMap = { info: 1, success: 1, warning: 1, danger: 1 };
        const positionMap = { br: 1, bl: 1, tr: 1, tl: 1 };
        const queue = [];
        const maxQueue = 5;
        let rootEl = null;
        let styleEl = null;
        let activeToastEl = null;
        let toastSeq = 0;
        let lastAnyShownAt = 0;
        let globalCooldownMs = 8000;
        let maxPerSession = 3;
        let totalShown = 0;
        let configApplied = false;
        let defaultNotifyPosition = "br";

        function isNotifyDebug() {
          return attrDebug || isDebug;
        }

        function logNotify(msg, payload) {
          if (!isNotifyDebug() || !window.console || typeof console.debug !== "function") return;
          console.debug("[AIW][notify]", msg, payload || "");
        }

        function applyConfigObject(config) {
          configApplied = true;

          const notifications = config && config.behavior && config.behavior.notifications
            ? config.behavior.notifications
            : (config && config.notifications ? config.notifications : null);

          if (!notifications || typeof notifications !== "object") {
            runtimeEnabled = false;
            rules = [];
            logNotify("config_missing_notifications", {});
            return false;
          }

          runtimeEnabled = notifications.enabled !== false;

          const limits = notifications.limits || {};
          globalCooldownMs = Math.max(0, toNum(limits.globalCooldownMs, globalCooldownMs));
          maxPerSession = Math.max(0, toNum(limits.maxPerSession, maxPerSession));

          const notifyPosition =
            toText(notifications.position || notifications.defaultPosition || config.position || "").trim().toLowerCase();
          defaultNotifyPosition = positionMap[notifyPosition] ? notifyPosition : "br";

          rules = parseNotifyRules(notifications.rules);

          logNotify("config_applied", {
            enabled: runtimeEnabled,
            rules: rules.length,
            globalCooldownMs,
            maxPerSession,
            defaultNotifyPosition
          });
          return true;
        }

        function ensureNotifyStyle() {
          if (styleEl) return;
          styleEl = document.createElement("style");
          styleEl.setAttribute("data-aiw-notify-style", "1");
          styleEl.textContent = ""
            + ".aiw-notify-root{position:fixed;display:flex;flex-direction:column;gap:10px;z-index:2147483644;pointer-events:none;max-width:min(360px,calc(100vw - 24px));}"
            + ".aiw-notify-pos-br{right:12px;bottom:12px;align-items:flex-end;}"
            + ".aiw-notify-pos-bl{left:12px;bottom:12px;align-items:flex-start;}"
            + ".aiw-notify-pos-tr{right:12px;top:12px;align-items:flex-end;}"
            + ".aiw-notify-pos-tl{left:12px;top:12px;align-items:flex-start;}"
            + ".aiw-notify-toast{pointer-events:auto;background:#111418;color:#f4f6f8;border:1px solid rgba(255,255,255,.16);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:10px 12px;min-width:220px;max-width:360px;opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease;}"
            + ".aiw-notify-toast.aiw-open{opacity:1;transform:translateY(0);}"
            + ".aiw-notify-title{font:600 13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0 20px 4px 0;color:#fff;}"
            + ".aiw-notify-text{font:400 13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;white-space:pre-wrap;}"
            + ".aiw-notify-close{position:absolute;top:6px;right:8px;background:transparent;border:0;color:#cbd3dc;font-size:16px;line-height:1;cursor:pointer;padding:2px;}"
            + ".aiw-notify-row{margin-top:8px;display:flex;gap:8px;align-items:center;}"
            + ".aiw-notify-cta{display:inline-flex;align-items:center;justify-content:center;padding:5px 10px;border-radius:8px;text-decoration:none;font:600 12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#2b6df8;color:#fff;}"
            + ".aiw-notify-info{border-left:3px solid #2b6df8;}"
            + ".aiw-notify-success{border-left:3px solid #1f9d5a;}"
            + ".aiw-notify-warning{border-left:3px solid #d08700;}"
            + ".aiw-notify-danger{border-left:3px solid #d64141;}"
            + "@media (max-width:640px){.aiw-notify-root{max-width:calc(100vw - 16px)}.aiw-notify-pos-br,.aiw-notify-pos-bl{right:8px;left:8px;bottom:8px;align-items:stretch}.aiw-notify-pos-tr,.aiw-notify-pos-tl{right:8px;left:8px;top:8px;align-items:stretch}.aiw-notify-toast{max-width:none;width:100%}}";
          (document.head || document.documentElement).appendChild(styleEl);
        }

        function ensureRoot(position) {
          if (!rootEl) {
            rootEl = document.createElement("div");
            rootEl.className = "aiw-notify-root";
            (document.body || document.documentElement).appendChild(rootEl);
          }
          const pos = positionMap[position] ? position : defaultNotifyPosition;
          rootEl.className = "aiw-notify-root aiw-notify-pos-" + pos;
        }

        function closeToast(node, immediate) {
          if (!node || !node.parentNode) return;
          if (node.__aiw_closed) return;
          node.__aiw_closed = true;
          if (immediate) {
            node.remove();
          } else {
            node.classList.remove("aiw-open");
            setTimeout(() => {
              try { node.remove(); } catch {}
            }, 180);
          }
          if (activeToastEl === node) activeToastEl = null;
          if (!activeToastEl && queue.length > 0) {
            const next = queue.shift();
            renderToast(next);
          }
        }

        function renderToast(payload) {
          ensureNotifyStyle();
          ensureRoot(payload.position);

          const toast = document.createElement("div");
          const variant = variantMap[payload.variant] ? payload.variant : "info";
          toast.className = "aiw-notify-toast aiw-notify-" + variant;
          toast.style.position = "relative";
          toast.setAttribute("role", "status");
          toast.setAttribute("aria-live", "polite");
          toast.setAttribute("data-aiw-notify-id", payload.id || ("n_" + String(++toastSeq)));

          const titleEl = document.createElement("p");
          titleEl.className = "aiw-notify-title";
          titleEl.textContent = payload.title || "AI Assistant";
          toast.appendChild(titleEl);

          const textEl = document.createElement("p");
          textEl.className = "aiw-notify-text";
          textEl.textContent = payload.message || "";
          toast.appendChild(textEl);

          const closeBtn = document.createElement("button");
          closeBtn.type = "button";
          closeBtn.className = "aiw-notify-close";
          closeBtn.setAttribute("aria-label", "Close");
          closeBtn.textContent = "x";
          closeBtn.addEventListener("click", () => closeToast(toast, false), { passive: true });
          toast.appendChild(closeBtn);

          if (payload.ctaLabel && payload.ctaUrl) {
            const row = document.createElement("div");
            row.className = "aiw-notify-row";
            const cta = document.createElement("a");
            cta.className = "aiw-notify-cta";
            cta.href = payload.ctaUrl;
            cta.target = "_self";
            cta.rel = "noopener";
            cta.textContent = payload.ctaLabel;
            row.appendChild(cta);
            toast.appendChild(row);
          }

          rootEl.appendChild(toast);
          requestAnimationFrame(() => {
            toast.classList.add("aiw-open");
          });

          activeToastEl = toast;
          const closeAfter = Math.max(0, toNum(payload.durationMs, 6000));
          if (closeAfter > 0) {
            setTimeout(() => closeToast(toast, false), closeAfter);
          }
        }

        function enqueueToast(payload) {
          if (!payload || !payload.message) return false;
          if (activeToastEl && payload.allowWhileVisible !== true) {
            if (queue.length < maxQueue) queue.push(payload);
            return true;
          }
          renderToast(payload);
          return true;
        }

        function isRuleMatch(rule, evt) {
          if (!rule || !evt) return false;
          if (rule.event !== evt.type) return false;

          if (rule.section && normToken(rule.section) !== normToken(evt.section || context.section)) return false;
          if (rule.tab && normToken(rule.tab) !== normToken(evt.tab || context.tab)) return false;
          if (rule.path && normToken(rule.path) !== normToken(context.pagePath)) return false;

          const durationMs = toNum(evt.durationMs, 0);
          if (rule.minDurationMs > 0 && durationMs < rule.minDurationMs) return false;

          if (rule.minScrollDepth > 0 && toNum(context.scrollDepth, 0) < rule.minScrollDepth) return false;

          const visibleMs = Math.max(toNum(context.totalVisibleMs, 0), toNum(evt.totalVisibleMs, 0));
          if (rule.minVisibleMs > 0 && visibleMs < rule.minVisibleMs) return false;

          return true;
        }

        function ruleCanShow(rule) {
          if (!runtimeEnabled) return false;
          const now = Date.now();
          const item = stats[rule.id] || { count: 0, lastAt: 0 };

          if (maxPerSession > 0 && totalShown >= maxPerSession) return false;
          if (rule.once && item.count > 0) return false;
          if (rule.maxShows > 0 && item.count >= rule.maxShows) return false;
          if (rule.cooldownMs > 0 && item.lastAt > 0 && (now - item.lastAt) < rule.cooldownMs) return false;
          if ((now - lastAnyShownAt) < globalCooldownMs) return false;

          return true;
        }

        function markRuleShown(rule) {
          const now = Date.now();
          const item = stats[rule.id] || { count: 0, lastAt: 0 };
          item.count += 1;
          item.lastAt = now;
          stats[rule.id] = item;
          lastAnyShownAt = now;
          totalShown += 1;
        }

        function updateContext(evt) {
          context.pagePath = window.location.pathname || "/";
          if (evt.section) context.section = toText(evt.section);
          if (evt.type === "tab_active" && evt.tab) context.tab = toText(evt.tab);
          if (evt.type === "scroll_depth") context.scrollDepth = Math.max(context.scrollDepth, toNum(evt.percent, 0));
          if (evt.type === "page_visible") context.visible = true;
          if (evt.type === "page_hidden" || evt.type === "page_unload") {
            context.visible = false;
            context.totalVisibleMs = Math.max(context.totalVisibleMs, toNum(evt.totalVisibleMs, 0));
          }
        }

        function handleEvent(evt) {
          updateContext(evt);
          if (!runtimeEnabled) return;
          if (!rules.length) return;

          for (let i = 0; i < rules.length; i += 1) {
            const rule = rules[i];
            if (!isRuleMatch(rule, evt)) continue;
            if (!ruleCanShow(rule)) continue;

            const displayed = enqueueToast({
              id: rule.id,
              title: rule.title,
              message: rule.message,
              variant: rule.variant,
              durationMs: rule.durationMs,
              ctaLabel: rule.ctaLabel,
              ctaUrl: rule.ctaUrl,
              position: rule.position,
              allowWhileVisible: rule.allowWhileVisible
            });
            if (!displayed) continue;

            markRuleShown(rule);
            logNotify("shown", { ruleId: rule.id, event: evt.type });
            break;
          }
        }

        const api = {
          enabled: true,
          show: (payload) => enqueueToast({
            id: payload && payload.id ? String(payload.id) : "",
            title: payload && payload.title ? String(payload.title) : "AI Assistant",
            message: payload && payload.message ? String(payload.message) : "",
            variant: payload && payload.variant ? String(payload.variant) : "info",
            durationMs: payload && payload.durationMs,
            ctaLabel: payload && payload.ctaLabel ? String(payload.ctaLabel) : "",
            ctaUrl: payload && payload.ctaUrl ? String(payload.ctaUrl) : "",
            position: payload && payload.position ? String(payload.position) : "",
            allowWhileVisible: payload && payload.allowWhileVisible === true
          }),
          setRules: (nextRules) => {
            logNotify("setRules_ignored_config_only", {
              provided: Array.isArray(nextRules) ? nextRules.length : 0
            });
            return rules.slice();
          },
          getRules: () => rules.slice(),
          applyConfig: (config) => applyConfigObject(config),
          reset: () => {
            for (const key in stats) {
              if (Object.prototype.hasOwnProperty.call(stats, key)) delete stats[key];
            }
            queue.length = 0;
            lastAnyShownAt = 0;
            totalShown = 0;
          },
          context: () => ({ ...context })
        };

        if (host && siteId) {
          (async () => {
            if (configApplied) return;
            try {
              const cfgUrl = new URL(host.replace(/\/$/, "") + "/api/clients/widget-config");
              cfgUrl.searchParams.set("siteId", siteId);
              if (clientId) cfgUrl.searchParams.set("clientId", clientId);

              const resp = await fetch(cfgUrl.toString(), {
                method: "GET",
                credentials: "omit",
                mode: "cors"
              });
              if (!resp.ok) return;

              const json = await resp.json();
              const config = (json && (json.config || json)) || null;
              if (config) applyConfigObject(config);
            } catch {}
          })();
        }

        return { api, handleEvent };
      }

      const notifier = createActivityNotifier();
      if (notifier && notifier.api) {
        window.__AIW_NOTIFIER__ = notifier.api;
      }
      if (hasExistingTracker && notifier && typeof notifier.handleEvent === "function") {
        try {
          const activity = window.__AIW_ACTIVITY__;
          if (activity && typeof activity.on === "function" && !window.__AIW_NOTIFIER_BRIDGE_ATTACHED__) {
            activity.on((evt) => {
              try { notifier.handleEvent(evt); } catch {}
            });
            window.__AIW_NOTIFIER_BRIDGE_ATTACHED__ = true;
          }
        } catch {}
      }

      function emit(type, payload) {
        const evt = {
          type,
          ts: Date.now(),
          ...(payload || {})
        };
        state.events.push(evt);
        if (state.events.length > MAX_ACTIVITY_EVENTS) {
          state.events.splice(0, state.events.length - MAX_ACTIVITY_EVENTS);
        }
        if (notifier && typeof notifier.handleEvent === "function") {
          try { notifier.handleEvent(evt); } catch {}
        }
        for (const fn of state.listeners) {
          try { fn(evt); } catch {}
        }
        if (isDebug && window.console && typeof console.debug === "function") {
          console.debug("[AIW][track]", evt);
        }
        return evt;
      }

      window.__AIW_ACTIVITY__ = window.__AIW_ACTIVITY__ || {
        events: state.events,
        on: (fn) => { if (typeof fn === "function") state.listeners.push(fn); },
        clear: () => { state.events.length = 0; },
        dump: () => state.events.slice(),
        last: () => state.events[state.events.length - 1] || null
      };

      // Live activity tracking log (for debugging ONLY!!!!)
      attachLiveActivityLogger();


      function getShortText(text) {
        if (!text) return "";
        return String(text).replace(/\s+/g, " ").trim().slice(0, 80);
      }

      function getSectionLabel(el) {
        if (!el || el.nodeType !== 1) return "section";
        const direct =
          el.getAttribute("data-aiw-section") ||
          el.getAttribute("data-track-section") ||
          el.getAttribute("data-section") ||
          "";
        if (direct) return direct;

        if (el.id) return el.id;
        const aria = el.getAttribute("aria-label");
        if (aria) return aria;

        const dataName = el.getAttribute("data-name") || el.getAttribute("data-title");
        if (dataName) return dataName;

        const heading = el.querySelector("h1, h2, h3, h4");
        if (heading && heading.textContent) {
          const t = getShortText(heading.textContent);
          if (t) return t;
        }

        if (typeof el.className === "string") {
          const cls = el.className.split(/\s+/).filter(Boolean)[0];
          if (cls) return cls;
        }

        return el.tagName ? el.tagName.toLowerCase() : "section";
      }

      function getSectionKey(el, index) {
        const byAttr =
          el.getAttribute("data-aiw-section") ||
          el.getAttribute("data-track-section") ||
          el.getAttribute("data-section") ||
          "";
        if (byAttr) return byAttr;
        if (el.id) return el.id;
        return (el.tagName ? el.tagName.toLowerCase() : "section") + ":" + String(index || 0);
      }

      function collectSections() {
        const selectors = [
          "[data-aiw-section]",
          "[data-track-section]",
          "section[id]",
          "section[data-section]",
          "section",
          "[data-section]"
        ];

        const unique = new Set();
        for (const sel of selectors) {
          try {
            document.querySelectorAll(sel).forEach((el) => {
              if (!el || el.nodeType !== 1) return;
              if (el.closest("[data-aiw-ignore]")) return;
              const rect = el.getBoundingClientRect();
              if (rect && rect.height < 40 && rect.width < 40) return;
              unique.add(el);
            });
          } catch {}
        }

        const list = Array.from(unique);
        if (list.length > 120) return list.slice(0, 120);
        return list;
      }

      function getViewportWidth() {
        const vv = window.visualViewport && Number(window.visualViewport.width);
        if (Number.isFinite(vv) && vv > 0) return vv;
        const w = window.innerWidth || document.documentElement.clientWidth || 0;
        return Math.max(0, Number(w) || 0);
      }

      function getVisibleRatioThreshold() {
        const vw = getViewportWidth();
        if (vw > 0 && vw <= 768) return 0.12;   // mobile
        if (vw > 0 && vw <= 1024) return 0.2;   // tablet
        return 0.35;                            // desktop
      }

      function getMinViewMs() {
        const vw = getViewportWidth();
        if (vw > 0 && vw <= 768) return 700;    // mobile
        if (vw > 0 && vw <= 1024) return 850;   // tablet
        return 1000;                            // desktop
      }

      function buildSectionThresholds(visibleRatio) {
        const raw = [0, visibleRatio, 0.6, 0.9];
        return Array.from(new Set(raw.map((v) => Number(Math.min(1, Math.max(0, v)).toFixed(2))))).sort((a, b) => a - b);
      }

      function observeSections() {
        if (typeof IntersectionObserver !== "function") return;
        if (state.sectionObserver) {
          try { state.sectionObserver.disconnect(); } catch {}
          state.sectionObserver = null;
        }

        const sections = collectSections();
        if (!sections.length) return;
        const visibleRatio = getVisibleRatioThreshold();
        const minViewMs = getMinViewMs();

        state.sectionObserver = new IntersectionObserver((entries) => {
          const now = Date.now();
          for (const entry of entries) {
            const el = entry.target;
            const meta = state.sections.get(el);
            if (!meta) continue;

            const ratio = entry.intersectionRatio || 0;
            const isVisible = entry.isIntersecting && ratio >= visibleRatio;

            if (isVisible) {
              if (!meta.visibleSince) {
                meta.visibleSince = now;
                meta.maxRatio = ratio;
                meta.viewEmitted = false;
                emit("section_enter", {
                  section: meta.label,
                  key: meta.key,
                  ratio: Number(ratio.toFixed(2))
                });

                meta.viewTimer = setTimeout(() => {
                  if (meta.visibleSince && !meta.viewEmitted) {
                    meta.viewEmitted = true;
                    emit("section_view", {
                      section: meta.label,
                      key: meta.key,
                      durationMs: Date.now() - meta.visibleSince
                    });
                  }
                }, minViewMs);
              } else {
                meta.maxRatio = Math.max(meta.maxRatio || 0, ratio);
              }
            } else if (meta.visibleSince) {
              const duration = now - meta.visibleSince;
              if (!meta.viewEmitted && duration >= minViewMs) {
                meta.viewEmitted = true;
                emit("section_view", {
                  section: meta.label,
                  key: meta.key,
                  durationMs: duration
                });
              }
              emit("section_leave", {
                section: meta.label,
                key: meta.key,
                durationMs: duration,
                maxRatio: Number((meta.maxRatio || 0).toFixed(2))
              });
              meta.visibleSince = null;
              meta.maxRatio = 0;
              meta.viewEmitted = false;
              if (meta.viewTimer) {
                clearTimeout(meta.viewTimer);
                meta.viewTimer = null;
              }
            }
          }
        }, { threshold: buildSectionThresholds(visibleRatio) });

        sections.forEach((el, idx) => {
          if (!state.sections.has(el)) {
            state.sections.set(el, {
              el,
              label: getSectionLabel(el),
              key: getSectionKey(el, idx),
              visibleSince: null,
              maxRatio: 0,
              viewEmitted: false,
              viewTimer: null
            });
          }
          try { state.sectionObserver.observe(el); } catch {}
        });
      }

      function flushSectionDurations(reason) {
        const minViewMs = getMinViewMs();
        const now = Date.now();
        state.sections.forEach((meta) => {
          if (!meta.visibleSince) return;
          const duration = now - meta.visibleSince;
          if (!meta.viewEmitted && duration >= minViewMs) {
            meta.viewEmitted = true;
            emit("section_view", {
              section: meta.label,
              key: meta.key,
              durationMs: duration
            });
          }
          emit("section_leave", {
            section: meta.label,
            key: meta.key,
            durationMs: duration,
            maxRatio: Number((meta.maxRatio || 0).toFixed(2)),
            reason: reason || "flush"
          });
          meta.visibleSince = null;
          meta.maxRatio = 0;
          meta.viewEmitted = false;
          if (meta.viewTimer) {
            clearTimeout(meta.viewTimer);
            meta.viewTimer = null;
          }
        });
      }

      function getTabLabel(el) {
        if (!el || el.nodeType !== 1) return "tab";
        const direct =
          el.getAttribute("data-aiw-tab") ||
          el.getAttribute("data-tab") ||
          el.getAttribute("data-tab-id") ||
          "";
        if (direct) return direct;

        const aria = el.getAttribute("aria-label");
        if (aria) return aria;

        const text = getShortText(el.textContent);
        if (text) return text;

        if (el.id) return el.id;
        return el.tagName ? el.tagName.toLowerCase() : "tab";
      }

      function isTabActive(el) {
        if (!el || el.nodeType !== 1) return false;
        const ariaSel = el.getAttribute("aria-selected");
        if (ariaSel === "true") return true;
        if (el.classList && (el.classList.contains("active") || el.classList.contains("is-active"))) return true;
        return false;
      }

      const TAB_SELECTOR = "[role='tab'], [data-aiw-tab], [data-tab], [data-tab-id], [data-tab-target], [data-tab-target-id]";
      const tabState = new WeakMap();

      function trackTabClick(e) {
        const target = e.target;
        if (!target || !target.closest) return;
        const tabEl = target.closest(TAB_SELECTOR);
        if (!tabEl) return;

        emit("tab_click", {
          tab: getTabLabel(tabEl),
          id: tabEl.id || null,
          controls: tabEl.getAttribute("aria-controls") || null
        });

        setTimeout(() => {
          try {
            if (isTabActive(tabEl)) {
              emit("tab_active", {
                tab: getTabLabel(tabEl),
                id: tabEl.id || null,
                controls: tabEl.getAttribute("aria-controls") || null,
                reason: "click"
              });
            }
          } catch {}
        }, 0);
      }

      function observeTabs() {
        if (typeof MutationObserver !== "function") return;
        if (state.tabObserver) {
          try { state.tabObserver.disconnect(); } catch {}
          state.tabObserver = null;
        }

        state.tabObserver = new MutationObserver((mutations) => {
          for (const m of mutations) {
            const el = m.target;
            if (!el || !el.matches || !el.matches(TAB_SELECTOR)) continue;
            const active = isTabActive(el);
            const prev = tabState.get(el);
            if (prev === active) continue;
            tabState.set(el, active);
            if (active) {
              emit("tab_active", {
                tab: getTabLabel(el),
                id: el.id || null,
                controls: el.getAttribute("aria-controls") || null,
                reason: "mutation"
              });
            }
          }
        });

        try {
          state.tabObserver.observe(document.documentElement || document.body, {
            attributes: true,
            subtree: true,
            attributeFilter: ["class", "aria-selected"]
          });
        } catch {}
      }

      function trackScrollDepth() {
        const docEl = document.documentElement;
        const body = document.body;
        if (!docEl || !body) return;

        const scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop || 0;
        const scrollHeight = Math.max(docEl.scrollHeight, body.scrollHeight);
        const clientHeight = Math.max(docEl.clientHeight, window.innerHeight || 0);
        const maxScroll = Math.max(1, scrollHeight - clientHeight);
        const percent = Math.max(0, Math.min(100, Math.round((scrollTop / maxScroll) * 100)));

        const steps = [25, 50, 75, 90, 100];
        for (const step of steps) {
          if (percent >= step && state.lastDepthStep < step) {
            state.lastDepthStep = step;
            emit("scroll_depth", { percent: step });
          }
        }
      }

      function onVisibilityChange() {
        const now = Date.now();
        if (document.visibilityState === "hidden") {
          if (state.visibleSince) {
            state.totalVisibleMs += now - state.visibleSince;
            state.visibleSince = null;
          }
          emit("page_hidden", { totalVisibleMs: state.totalVisibleMs });
          flushSectionDurations("hidden");
        } else {
          state.visibleSince = now;
          emit("page_visible", {});
        }
      }

      function onBeforeUnload() {
        const now = Date.now();
        if (state.visibleSince) {
          state.totalVisibleMs += now - state.visibleSince;
          state.visibleSince = null;
        }
        flushSectionDurations("unload");
        emit("page_unload", { totalVisibleMs: state.totalVisibleMs });
      }

      function start() {
        observeSections();
        observeTabs();

        document.addEventListener("click", trackTabClick, true);

        let scrollTicking = false;
        state.scrollHandler = () => {
          if (scrollTicking) return;
          scrollTicking = true;
          requestAnimationFrame(() => {
            scrollTicking = false;
            trackScrollDepth();
          });
        };
        window.addEventListener("scroll", state.scrollHandler, { passive: true });
        trackScrollDepth();

        // Recompute section thresholds for mobile/tablet/desktop transitions.
        state.resizeHandler = () => {
          if (state.resizeTimer) return;
          state.resizeTimer = setTimeout(() => {
            state.resizeTimer = null;
            observeSections();
          }, 220);
        };
        window.addEventListener("resize", state.resizeHandler, { passive: true });
        window.addEventListener("orientationchange", state.resizeHandler, { passive: true });

        document.addEventListener("visibilitychange", onVisibilityChange, { passive: true });
        window.addEventListener("beforeunload", onBeforeUnload, { passive: true });

        // Re-scan sections when DOM changes (for SPA/dynamic pages)
        let rescanTimer = null;
        if (typeof MutationObserver === "function") {
          state.mutationObserver = new MutationObserver(() => {
            if (rescanTimer) return;
            rescanTimer = setTimeout(() => {
              rescanTimer = null;
              observeSections();
            }, 400);
          });
          try {
            state.mutationObserver.observe(document.documentElement || document.body, {
              childList: true,
              subtree: true
            });
          } catch {}
        }

        emit("tracker_started", { debug: !!isDebug });
      }

      function stop() {
        try { state.sectionObserver && state.sectionObserver.disconnect(); } catch {}
        try { state.tabObserver && state.tabObserver.disconnect(); } catch {}
        try { state.mutationObserver && state.mutationObserver.disconnect(); } catch {}
        try { document.removeEventListener("click", trackTabClick, true); } catch {}
        try { window.removeEventListener("scroll", state.scrollHandler); } catch {}
        try { window.removeEventListener("resize", state.resizeHandler); } catch {}
        try { window.removeEventListener("orientationchange", state.resizeHandler); } catch {}
        try { document.removeEventListener("visibilitychange", onVisibilityChange); } catch {}
        try { window.removeEventListener("beforeunload", onBeforeUnload); } catch {}
        if (state.resizeTimer) {
          clearTimeout(state.resizeTimer);
          state.resizeTimer = null;
        }
        flushSectionDurations("stop");
      }

      if (!hasExistingTracker) {
        window.__AIW_ACTIVITY_TRACKER__ = { stop };

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", start, { once: true, passive: true });
        } else {
          start();
        }
      }
    } catch {}
  })();

  // --- режим рендера ---
  // режим выбирается из widget-config (behavior.renderMode / renderMode / mode)

  const rawInlineHeight = parseInt(s.getAttribute("data-height") || "600", 10);
  const iHeight = Number.isFinite(rawInlineHeight) ? rawInlineHeight : 600;
  const inlineMinHeight = Math.max(200, iHeight);
  const requestedFitMode = ((s.getAttribute("data-fit") || "container").toLowerCase() === "content")
    ? "content"
    : "container";

  function isPlainObject(value) {
    return !!value && typeof value === "object";
  }

  function fetchWidgetConfig(base) {
    if (!base || !siteId) return Promise.resolve(null);

    const key = [base, siteId, clientId || ""].join("|");
    const cacheKey = "__AIW_WIDGET_CONFIG_PROMISES__";
    const map = (window[cacheKey] && typeof window[cacheKey] === "object") ? window[cacheKey] : {};
    window[cacheKey] = map;
    if (map[key]) return map[key];

    map[key] = (async () => {
      try {
        const url = new URL(base + "/api/clients/widget-config");
        url.searchParams.set("siteId", siteId);
        if (clientId) url.searchParams.set("clientId", clientId);

        const r = await fetch(url.toString(), {
          method: "GET",
          credentials: "omit",
          mode: "cors"
        });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        return (j && (j.config || j)) || null;
      } catch (e) {
        console.warn("[AIW] config fetch failed:", e);
        return null;
      }
    })();

    return map[key];
  }

  function applyNotifierConfig(config) {
    if (window.__AIW_NOTIFIER__ && typeof window.__AIW_NOTIFIER__.applyConfig === "function") {
      try { window.__AIW_NOTIFIER__.applyConfig(config); } catch {}
    }
  }

  function buildFloatRuntimeConfig(base, config) {
    const renderMode = resolveRenderMode(config) || "float";
    return {
      endpoint: base + "/api/aiw/chat",
      siteId,
      renderMode,
      hybridHistorySync: renderMode === "hybrid",
      title: (config && (config.widgetTitle || config.title)) || "AI Assistant",
      position: (config && config.position) || "br",
      primaryColor: (config && (config.primaryColor || config.accent)) || "#6D28D9",
      accent: (config && (config.primaryColor || config.accent)) || "#6D28D9",
      welcome: (config && (config.welcomeMessage || config.welcome)) || "Hi! How can I help?",
      lang: (config && config.lang) || "en",
      backgroundColor: (config && config.backgroundColor) || "#0f0f0f",
      textColor: (config && config.textColor) || "#ffffff",
      borderColor: (config && (config.borderColor || config.primaryColor)) || "#6D28D9",
      headerBackgroundColor: (config && config.headerBackgroundColor) || null,
      headerTextColor: (config && config.headerTextColor) || null,
      assistantBubbleColor: (config && config.assistantBubbleColor) || null,
      assistantBubbleTextColor: (config && config.assistantBubbleTextColor) || null,
      userBubbleColor: (config && config.userBubbleColor) || null,
      userBubbleTextColor: (config && config.userBubbleTextColor) || null,
      bubbleBorderColor: (config && config.bubbleBorderColor) || null,
      inputPlaceholder: (config && config.inputPlaceholder) || "",
      inputBackgroundColor: (config && config.inputBackgroundColor) || null,
      inputTextColor: (config && config.inputTextColor) || null,
      inputBorderColor: (config && config.inputBorderColor) || null,
      sendButtonBackgroundColor: (config && config.sendButtonBackgroundColor) || null,
      sendButtonIconColor: (config && config.sendButtonIconColor) || null,
      showAvatars: config ? config.showAvatars !== false : true,
      showTimestamps: config ? config.showTimestamps !== false : true,
      logo: config?.logo?.url || config?.logoUrl || (typeof config?.logo === "string" ? config.logo : null),

      fontFamily:  config?.fontFamily  || "",
      fontCssUrl:  config?.fontCssUrl  || "",
      fontFileUrl: config?.fontFileUrl || "",
      baseFontSize: Number(config?.baseFontSize ?? 14),

      autostart: !!(config && config.autostart),
      autostartDelay: Number(config?.autostartDelay ?? 5000),
      autostartMode: (config?.autostartMode ?? "local").toLowerCase(),
      autostartMessage: (config && config.autostartMessage) || "",
      autostartPrompt: (config && config.autostartPrompt) || "",
      autostartCooldownHours: Number(config?.autostartCooldownHours ?? 12),

      preserveHistory: (config ? config.preserveHistory !== false : true),
      resetHistoryOnOpen: !!(config && config.resetHistoryOnOpen),
      floatLauncher: config?.behavior?.floatLauncher || config?.floatLauncher || null,
      inlineAnchorButton: config?.behavior?.inlineAnchorButton || config?.inlineAnchorButton || null,

      inlineAutostart: config?.inlineAutostart || null,

      // stream: берём из БД, если явно задано true/false, иначе по умолчанию true
      stream: (typeof config?.stream === "boolean") ? config.stream : true
    };
  }

  function appendWidgetScriptWithVersion(base, config) {
    const rawVer = String(config?.resolvedWidgetVersion || "").trim();
    const safeVer = /^[0-9A-Za-z._-]{1,50}$/.test(rawVer) ? rawVer : "";

    const versionedSrc = (!hasDataSrc && safeVer)
      ? `${base}/aiw/releases/${encodeURIComponent(safeVer)}/widget.js`
      : jsSrc;

    // the fallback is always to the regular widget.js with cache-busting
    const fallbackSrc = jsSrc + (jsSrc.includes("?") ? "&" : "?") + "v=" + Date.now();

    function appendScriptWithFallback(src, fallback) {
      const js = document.createElement("script");
      js.async = true;
      js.crossOrigin = "anonymous";
      js.src = src;

      js.onerror = () => {
        // if this is a data-src override, we don't perform a fallback (to avoid breaking the manual override)
        if (!fallback) return;

        console.warn("[AIW] Script failed:", src, "-> fallback:", fallback);
        js.remove();

        const js2 = document.createElement("script");
        js2.async = true;
        js2.crossOrigin = "anonymous";
        js2.src = fallback;
        document.head.appendChild(js2);
      };

      document.head.appendChild(js);
    }

    if (versionedSrc === jsSrc) {
      // if this was a manual override (data-src), then a fallback is NOT needed
      appendScriptWithFallback(hasDataSrc ? jsSrc : fallbackSrc, null);
    } else {
      // version first, then fallback
      appendScriptWithFallback(versionedSrc, fallbackSrc);
    }
  }

  function startFloatWidget(base, config) {
    if (!host || !siteId || !base) {
      console.error("[AIW] missing data-site-id or host");
      return false;
    }
    if (window.__AIW_LOADED__) return false;
    window.__AIW_LOADED__ = true;

    applyNotifierConfig(config);
    window.__AIW_CONFIG__ = buildFloatRuntimeConfig(base, config);
    appendWidgetScriptWithVersion(base, config);
    return true;
  }

  function isHybridFloatEnabledFromConfig(config) {
    if (!isPlainObject(config)) return false;

    const behavior = isPlainObject(config.behavior) ? config.behavior : null;
    const hybrid = (behavior && isPlainObject(behavior.hybrid))
      ? behavior.hybrid
      : (isPlainObject(config.hybrid) ? config.hybrid : null);
    if (!hybrid) return false;

    const floatCfg = isPlainObject(hybrid.float) ? hybrid.float : hybrid;
    if (typeof floatCfg.enabled === "boolean") return floatCfg.enabled;
    if (typeof hybrid.enabled === "boolean") return hybrid.enabled;
    return false;
  }

  function isInlineAnchorButtonEnabledFromConfig(config) {
    if (!isPlainObject(config)) return false;
    const behavior = isPlainObject(config.behavior) ? config.behavior : null;
    const inlineAnchorButton = (behavior && isPlainObject(behavior.inlineAnchorButton))
      ? behavior.inlineAnchorButton
      : (isPlainObject(config.inlineAnchorButton) ? config.inlineAnchorButton : null);
    if (!inlineAnchorButton) return false;

    const raw = inlineAnchorButton.enabled;
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw !== 0;
    const text = String(raw || "").trim().toLowerCase();
    if (!text) return false;
    return text === "1" || text === "true" || text === "yes" || text === "on";
  }

  function maybeStartHybridFloat(base, configPromise) {
    (async () => {
      let config = null;
      try {
        if (configPromise && typeof configPromise.then === "function") {
          config = await configPromise;
        } else {
          config = await fetchWidgetConfig(base);
        }
      } catch {}

      applyNotifierConfig(config);

      const shouldStartFloat =
        isHybridFloatEnabledFromConfig(config) ||
        isInlineAnchorButtonEnabledFromConfig(config);
      if (!shouldStartFloat) return;
      startFloatWidget(base, config);
    })();
  }

  // ================= INLINE-РЕЖИМ ЧЕРЕЗ IFRAME =================
  function mountInlineMode(base, configPromise) {

    // 1) data-target как CSS-селектор (если задан)
    // 2) родительский элемент скрипта, если это не <head>/<body>
    // 3) новый div сразу после скрипта
    let mount = null;

    const targetSel = s.getAttribute("data-target");
    if (targetSel) {
      mount = document.querySelector(targetSel);
    }

    if (!mount && s.parentElement && !/^(HEAD|BODY)$/i.test(s.parentElement.tagName)) {
      mount = s.parentElement;
    }

    if (!mount) {
      mount = document.createElement("div");
      if (s.parentNode) {
        s.parentNode.insertBefore(mount, s.nextSibling);
      } else {
        document.body.appendChild(mount);
      }
    }

    // Mark the resolved inline mount so float launcher can always find an anchor target
    // even when the host page doesn't provide custom anchor attributes.
    try {
      mount.setAttribute("data-aiw-inline-anchor", "");
      mount.setAttribute("data-aiw-inline-widget", "true");
      mount.setAttribute("data-aiw-mode", "inline");
      if (siteId) mount.setAttribute("data-aiw-site-id", String(siteId));

      const registry = (window.__AIW_INLINE_TARGETS__ && typeof window.__AIW_INLINE_TARGETS__ === "object")
        ? window.__AIW_INLINE_TARGETS__
        : {};
      window.__AIW_INLINE_TARGETS__ = registry;
      if (!Array.isArray(registry.__all)) registry.__all = [];
      registry.__all.push(mount);
      if (siteId) {
        const key = String(siteId);
        if (!Array.isArray(registry[key])) registry[key] = [];
        registry[key].push(mount);
      }
    } catch {}

    function hasUsableMountHeight(el) {
      if (!el || el.nodeType !== 1) return false;
      try {
        const rect = el.getBoundingClientRect();
        if (rect && rect.height > 1) return true;
      } catch {}
      try {
        const st = window.getComputedStyle(el);
        const h = parseFloat(st.height) || 0;
        const minH = parseFloat(st.minHeight) || 0;
        if (h > 1 || minH > 1) return true;
      } catch {}
      return false;
    }

    let fitMode = requestedFitMode;
    if (fitMode === "container" && !hasUsableMountHeight(mount)) {
      fitMode = "content";
      console.warn("[AIW] inline mount has no explicit height, fallback to data-fit='content'");
    }

    const iframe = document.createElement("iframe");

      // instanceId + parentOrigin для безопасного postMessage
    const instanceId = "aiw_" + Math.random().toString(36).slice(2, 10);
    const parentOrigin = window.location.origin;

    // передаём siteId/clientId и флаги mode/fit в страницу фрейма
    const qp = new URLSearchParams();
    if (siteId) qp.set("siteId", siteId);
    if (clientId) qp.set("clientId", clientId);
    qp.set("mode", "inline");
    qp.set("fit", fitMode);

    qp.set("parentOrigin", parentOrigin);
    qp.set("instanceId", instanceId);

    iframe.src = `${base}/aiw/widget-frame.html?${qp.toString()}`;
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.style.maxWidth = "100%";
    iframe.style.boxSizing = "border-box";
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("data-aiw-mode", "inline");
    if (siteId) iframe.setAttribute("data-aiw-site-id", String(siteId));
    iframe.allow = "clipboard-write";

    let isFullscreen = false;
    let fullscreenOverlay = null;
    let fullscreenPlaceholder = null;
    let preFullscreenStyleText = null;
    let pendingInlineHeight = null;
    let hostScrollLockState = null;
    let frameBusy = false;

     const HUBSPOT_CONTAINER_SELECTOR = "#hubspot-messages-iframe-container";
    const HUBSPOT_HIDE_CLASS = "aiw-hide-hubspot-widget";
    let hubspotHideStyleEl = null;

    function ensureHubspotHideStyle() {
      if (hubspotHideStyleEl) return;
      const style = document.createElement("style");
      style.setAttribute("data-aiw-hubspot-hide", "1");
      style.textContent = `.${HUBSPOT_HIDE_CLASS} ${HUBSPOT_CONTAINER_SELECTOR} { display: none !important; }`;
      (document.head || document.documentElement).appendChild(style);
      hubspotHideStyleEl = style;
    }

    function setHubspotHidden(hidden) {
      const root = document.documentElement || document.body;
      if (!root) return;
      if (hidden) {
        ensureHubspotHideStyle();
        root.classList.add(HUBSPOT_HIDE_CLASS);
      } else {
        root.classList.remove(HUBSPOT_HIDE_CLASS);
      }
    }

  if (fitMode === "container") {
      iframe.style.height = "100%";
    } else {
      // fit=content → фрейм сам сообщит высоту
      iframe.style.height = inlineMinHeight + "px";
      // window.addEventListener("message", (e) => {
      //   if (!e?.data || e.data.type !== "aiw:resize") return;
      //   if (e.source === iframe.contentWindow) {
      //     const minH = Math.max(200, iHeight);
      //     const h = Math.max(
      //       minH,
      //       parseInt(e.data.height || "0", 10) || 0
      //     );
      //     iframe.style.height = h + "px";
      //   }
      // });
    }
        // определяем origin фрейма + выбираем, куда скроллить (window или ближайший scroll-container)
const frameOrigin = (() => {
  try { return new URL(iframe.src).origin; } catch {
    try { return new URL(base).origin; } catch { return base; }
  }
})();
let hybridHistoryBridgeEnabled = false;

(() => {
  (async () => {
    try {
      let cfg = null;
      if (configPromise && typeof configPromise.then === "function") {
        cfg = await configPromise;
      } else {
        cfg = await fetchWidgetConfig(base);
      }
      const mode = resolveRenderMode(cfg);
      hybridHistoryBridgeEnabled = mode === "hybrid" && isHybridFloatEnabledFromConfig(cfg);
    } catch {
      hybridHistoryBridgeEnabled = false;
    }
  })();
})();

function postFullscreenStateToFrame() {
  try {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      { type: "aiw:fullscreen-state", instanceId, value: isFullscreen },
      frameOrigin
    );
  } catch {}
}

function postHistorySyncToFrame(snapshot) {
  try {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: "aiw:history-sync",
        siteId,
        instanceId,
        snapshot: typeof snapshot === "string" ? snapshot : "[]",
      },
      frameOrigin
    );
  } catch {}
}

function restoreIframeAfterFullscreen() {
  try {
    const placeholderParent = fullscreenPlaceholder && fullscreenPlaceholder.parentNode;
    if (placeholderParent && placeholderParent.isConnected) {
      placeholderParent.insertBefore(iframe, fullscreenPlaceholder);
      fullscreenPlaceholder.remove();
      return;
    }
  } catch {}

  try {
    if (mount && iframe.parentNode !== mount) {
      mount.appendChild(iframe);
    }
  } catch {}
}

function cleanupFullscreenDomState() {
  restoreIframeAfterFullscreen();

  try {
    if (fullscreenOverlay && fullscreenOverlay.parentNode) {
      fullscreenOverlay.parentNode.removeChild(fullscreenOverlay);
    }
  } catch {}

  if (typeof preFullscreenStyleText === "string") {
    try {
      iframe.style.cssText = preFullscreenStyleText;
    } catch {}
  }

  if (fitMode !== "container" && pendingInlineHeight != null) {
    try {
      iframe.style.height = pendingInlineHeight + "px";
    } catch {}
  }

  fullscreenOverlay = null;
  fullscreenPlaceholder = null;
  preFullscreenStyleText = null;
}

function forceExitFullscreenState() {
  cleanupFullscreenDomState();
  unlockHostScroll();
  isFullscreen = false;
  setHubspotHidden(false);
  postFullscreenStateToFrame();
}

function lockHostScroll() {
  if (hostScrollLockState) return;
  const docEl = document.documentElement;
  const body = document.body;
  if (!docEl || !body) return;

  const scrollX = window.pageXOffset || window.scrollX || 0;
  const scrollY = window.pageYOffset || window.scrollY || 0;

  hostScrollLockState = {
    scrollX,
    scrollY,
    docOverflow: docEl.style.overflow,
    docOverscrollBehavior: docEl.style.overscrollBehavior,
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyOverscrollBehavior: body.style.overscrollBehavior
  };

  docEl.style.overflow = "hidden";
  docEl.style.overscrollBehavior = "none";

  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = `-${scrollX}px`;
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overscrollBehavior = "none";
}

function unlockHostScroll() {
  if (!hostScrollLockState) return;
  const state = hostScrollLockState;
  hostScrollLockState = null;

  const docEl = document.documentElement;
  const body = document.body;
  if (docEl) {
    docEl.style.overflow = state.docOverflow || "";
    docEl.style.overscrollBehavior = state.docOverscrollBehavior || "";
  }
  if (body) {
    body.style.overflow = state.bodyOverflow || "";
    body.style.position = state.bodyPosition || "";
    body.style.top = state.bodyTop || "";
    body.style.left = state.bodyLeft || "";
    body.style.right = state.bodyRight || "";
    body.style.width = state.bodyWidth || "";
    body.style.overscrollBehavior = state.bodyOverscrollBehavior || "";
  }

  try {
    window.scrollTo(state.scrollX || 0, state.scrollY || 0);
  } catch {}
}

function enterFullscreen() {
  if (isFullscreen) return true;

  try {
    const hostNode = document.body || document.documentElement;
    if (!hostNode) {
      forceExitFullscreenState();
      return false;
    }

    const parent = iframe.parentNode;
    if (!parent) {
      forceExitFullscreenState();
      return false;
    }

    preFullscreenStyleText = iframe.style.cssText;
    fullscreenPlaceholder = document.createComment("aiw-inline-fullscreen-anchor");
    parent.insertBefore(fullscreenPlaceholder, iframe);

    fullscreenOverlay = document.createElement("div");
    fullscreenOverlay.setAttribute("data-aiw-inline-fullscreen", instanceId);
    fullscreenOverlay.style.position = "fixed";
    fullscreenOverlay.style.inset = "0";
    fullscreenOverlay.style.zIndex = "2147483646";
    fullscreenOverlay.style.margin = "0";
    fullscreenOverlay.style.padding = "0";
    fullscreenOverlay.style.border = "0";
    fullscreenOverlay.style.background = "transparent";
    fullscreenOverlay.style.boxSizing = "border-box";
    fullscreenOverlay.style.display = "flex";
    fullscreenOverlay.style.alignItems = "stretch";
    fullscreenOverlay.style.justifyContent = "stretch";
    fullscreenOverlay.style.overflow = "hidden";

    hostNode.appendChild(fullscreenOverlay);
    fullscreenOverlay.appendChild(iframe);

    iframe.style.width = "100%";
    iframe.style.maxWidth = "100%";
    iframe.style.height = "100%";
    iframe.style.maxHeight = "100%";
    iframe.style.display = "block";
    iframe.style.border = "0";
    iframe.style.boxSizing = "border-box";

    lockHostScroll();

    isFullscreen = true;
    setHubspotHidden(true);
    postFullscreenStateToFrame();
    return true;
  } catch {
    forceExitFullscreenState();
    return false;
  }
}

function exitFullscreen() {
  forceExitFullscreenState();
  return true;
}

function setFullscreen(next) {
  if (next) return enterFullscreen();
  return exitFullscreen();
}

const UA = navigator.userAgent || "";
const IS_IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function isScrollable(el) {
  if (!el || el.nodeType !== 1) return false;
  const st = window.getComputedStyle(el);
  const oy = st.overflowY;
  const ox = st.overflowX;

  const canY = (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1;
  const canX = (ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1;
  return canY || canX;
}

function pickBestScroller(startEl) {
  // 0) optional override (если когда-то захочешь вручную)
  const forcedSel = s.getAttribute("data-scroll-container");
  if (forcedSel) {
    const forced = document.querySelector(forcedSel);
    if (forced) return forced;
  }

  // 1) ищем scrollable среди родителей mount
  let cur = startEl;
  while (cur && cur !== document.documentElement) {
    if (isScrollable(cur)) return cur;
    cur = cur.parentElement;
  }

  // 2) типовые “главные” контейнеры
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
  for (const sel of knownSelectors) {
    const el = document.querySelector(sel);
    if (el && isScrollable(el)) return el;
  }

  // 3) fallback — нативный скроллер документа
return (document.scrollingElement || document.documentElement);
}

function tryScrollElement(el, y, x) {
  if (!el) return false;
  const by = el.scrollTop;
  const bx = el.scrollLeft;
  if (y) el.scrollTop = by + y;
  if (x) el.scrollLeft = bx + x;
  return (el.scrollTop !== by) || (el.scrollLeft !== bx);
}

function dispatchWheelToHost(dy, dx) {
  const y = Number(dy) || 0;
  const x = Number(dx) || 0;
  if (!y && !x) return false;

  const opts = { deltaY: y, deltaX: x, deltaMode: 0, bubbles: true, cancelable: true };

  // ВАЖНО: синтетический wheel сам по себе НЕ скроллит браузер,
  // но его “видят” smooth-scroll библиотеки, которые слушают wheel.
  try { window.dispatchEvent(new WheelEvent("wheel", opts)); } catch {}
  try { document.dispatchEvent(new WheelEvent("wheel", opts)); } catch {}
  try { document.body && document.body.dispatchEvent(new WheelEvent("wheel", opts)); } catch {}
  try { document.documentElement.dispatchEvent(new WheelEvent("wheel", opts)); } catch {}
  try { mount && mount.dispatchEvent(new WheelEvent("wheel", opts)); } catch {}

  return true;
}

function trySmoothScrollAPIs(dy, dx) {
  const y = Number(dy) || 0;
  const x = Number(dx) || 0;

  // GSAP ScrollSmoother
  try {
    if (window.ScrollSmoother && typeof window.ScrollSmoother.get === "function") {
      const sm = window.ScrollSmoother.get();
      if (sm) {
        if (typeof sm.scrollTop === "function") {
          const cur = Number(sm.scrollTop()) || 0;
          sm.scrollTop(cur + y);
          return true;
        }
        if (typeof sm.scrollTo === "function") {
          sm.scrollTo((Number(sm.scrollTop?.()) || 0) + y, true);
          return true;
        }
      }
    }
  } catch {}

  // Lenis
  try {
    const lenis = window.lenis || window.__lenis || window.lenisInstance;
    if (lenis && typeof lenis.scrollTo === "function") {
      const cur = Number(lenis.scroll ?? lenis.animatedScroll ?? lenis.targetScroll ?? 0) || 0;
      lenis.scrollTo(cur + y, { immediate: true });
      return true;
    }
  } catch {}

  // LocomotiveScroll (если вдруг экземпляр лежит глобально)
  try {
    const loco = window.locomotiveScroll || window.locoScroll || window.__locomotiveScroll;
    if (loco && typeof loco.scrollTo === "function") {
      const cur =
        loco.scroll?.instance?.scroll?.y ??
        loco.instance?.scroll?.y ??
        0;
      loco.scrollTo(cur + y, { duration: 0, disableLerp: true });
      return true;
    }
  } catch {}

  return false;
}

function scrollParentBy(dy, dx, source = "") {
  const y = Number(dy) || 0;
  const x = Number(dx) || 0;
  if (!y && !x) return;

  if (source === "touch") {
    if (scrollTarget && tryScrollElement(scrollTarget, y, x)) return true;

    const beforeY = window.scrollY;
    const beforeX = window.scrollX;
    try {
      window.scrollBy({ top: y, left: x, behavior: "auto" });
    } catch {}

    if (window.scrollY !== beforeY || window.scrollX !== beforeX) return true;

    const doc = document.scrollingElement || document.documentElement;
    return tryScrollElement(doc, y, x);
  }

  // 0) сначала пробуем “официальные” API smooth-scroll (если они есть)
  if (trySmoothScrollAPIs(y, x)) return true;

  // 1) затем всегда шлём wheel в хост-страницу — это критично для сайтов,
  // где скролл реализован через wheel listeners + transforms
  dispatchWheelToHost(y, x);

  // 2) пробуем нативный scrollTop (если страница обычная)
  if (scrollTarget && tryScrollElement(scrollTarget, y, x)) return true;

  // редко переподбираем scrollTarget (чтобы не лагать)
  const now = Date.now();
  if (now - lastRepickAt > 1000) {
    lastRepickAt = now;
    scrollTarget = pickBestScroller(mount);
    if (scrollTarget && tryScrollElement(scrollTarget, y, x)) return true;
  }

  // 3) fallback — window.scrollBy, но проверяем, что он реально сдвинул
  const beforeY = window.scrollY;
  const beforeX = window.scrollX;
  try {
    window.scrollBy({ top: y, left: x, behavior: "auto" });
  } catch {}

  if (window.scrollY !== beforeY || window.scrollX !== beforeX) return true;

  // 4) последний шанс: напрямую документ
  const doc = document.scrollingElement || document.documentElement;
  return tryScrollElement(doc, y, x);
}

let flingRaf = null;
function startFling(vy) {
  if (!IS_IOS) return;
  const v = Number(vy);
  if (!v || Math.abs(v) < 0.04) return;

  const distance = Math.max(-900, Math.min(900, v * 520));
  const duration = 260; // ms
  const start = performance.now();
  let last = 0;

  if (flingRaf) cancelAnimationFrame(flingRaf);

  const step = (t) => {
    const p = Math.min(1, (t - start) / duration);
    const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
    const target = distance * ease;
    const delta = target - last;
    last = target;

    if (Math.abs(delta) > 0.1) {
      const moved = scrollParentBy(delta, 0, "touch");
      if (!moved) { flingRaf = null; return; }
    }

    if (p < 1) {
      flingRaf = requestAnimationFrame(step);
    } else {
      flingRaf = null;
    }
  };

  flingRaf = requestAnimationFrame(step);
}

    function onFrameMessage(e) {
      // безопасность + гарантия что это наш iframe
      if (e.origin !== frameOrigin) return;
      if (e.source !== iframe.contentWindow) return;

      const d = e.data || {};
      if (!d || typeof d !== "object") return;

      // --- resize (у тебя уже было)
      if (d.type === "aiw:resize" && fitMode !== "container") {
        const minH = inlineMinHeight;
        const h = Math.max(minH, parseInt(d.height || "0", 10) || 0);
        pendingInlineHeight = h;
        if (!isFullscreen) {
          iframe.style.height = h + "px";
        }
        return;
      }

      if (d.type === "aiw:fullscreen") {
        if (d.instanceId && d.instanceId !== instanceId) return;
        const next = (typeof d.value === "boolean") ? d.value : !isFullscreen;
        setFullscreen(next);
        return;
      }

      if (d.type === "aiw:fullscreen:get-state") {
        if (d.instanceId && d.instanceId !== instanceId) return;
        postFullscreenStateToFrame();
        return;
      }

      if (d.type === "aiw:busy") {
        if (d.instanceId && d.instanceId !== instanceId) return;
        frameBusy = !!d.value;
        return;
      }

      if (d.type === "aiw:history-sync") {
        if (!hybridHistoryBridgeEnabled) return;
        if (d.instanceId && d.instanceId !== instanceId) return;
        if (d.siteId && d.siteId !== siteId) return;
        try {
          window.dispatchEvent(new CustomEvent("aiw:history-sync", {
            detail: {
              siteId,
              instanceId,
              snapshot: typeof d.snapshot === "string" ? d.snapshot : "[]",
              source: "inline",
            },
          }));
        } catch {}
        return;
      }

      // --- NEW: scroll passthrough
      if (d.type === "aiw:scroll") {
        // если используешь instanceId — можно фильтровать
        if (d.instanceId && d.instanceId !== instanceId) return;
        if (isFullscreen) return;
        scrollParentBy(d.deltaY, d.deltaX, d.source);
        return;
      }
      if (d.type === "aiw:fling") {
        if (d.instanceId && d.instanceId !== instanceId) return;
        if (isFullscreen) return;
        startFling(d.velocityY);
        return;
      }
    }

    function onParentHistorySync(evt) {
      if (!hybridHistoryBridgeEnabled) return;
      const d = evt && evt.detail ? evt.detail : null;
      if (!d || typeof d !== "object") return;
      if (d.siteId && d.siteId !== siteId) return;
      if (d.source === "inline") return;
      postHistorySyncToFrame(d.snapshot || "[]");
    }

    window.addEventListener("message", onFrameMessage, { passive: true });
    window.addEventListener("aiw:history-sync", onParentHistorySync);
    iframe.addEventListener("load", () => { postFullscreenStateToFrame(); }, { passive: true });

    mount.appendChild(iframe);
    postFullscreenStateToFrame();

    let scrollTarget = pickBestScroller(mount);
    let lastRepickAt = 0;

    // Optional hybrid mode: keep inline widget + add floating widget from widget-config.
    maybeStartHybridFloat(base, configPromise);

    // в inline-режиме ВЫХОДИМ — дальше скрипт ничего не делает
    return true;
  }

  function normalizeRenderMode(value) {
    const mode = String(value || "").trim().toLowerCase();
    if (!mode) return "";
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

  function resolveRenderMode(config) {
    const behavior = isPlainObject(config && config.behavior) ? config.behavior : null;
    const candidates = [
      behavior && behavior.renderMode,
      config && config.renderMode,
      behavior && behavior.mode,
      config && config.mode
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const next = normalizeRenderMode(candidates[i]);
      if (next) return next;
    }

    if (isHybridFloatEnabledFromConfig(config)) return "hybrid";
    return "float";
  }

  // ================= BOOTSTRAP РЕЖИМА ИЗ КОНФИГА =================
  const base = host.replace(/\/$/, "");
  (async () => {
    const config = await fetchWidgetConfig(base);
    const configPromise = Promise.resolve(config);
    const renderMode = resolveRenderMode(config);

    if (renderMode === "inline" || renderMode === "hybrid") {
      mountInlineMode(base, configPromise);
      return;
    }

    startFloatWidget(base, config);
  })();
})();
