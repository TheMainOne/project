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

      if (!trackEnabled) return;
      if (window.__AIW_ACTIVITY_TRACKER__) return;

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
        mutationObserver: null,
        lastDepthStep: 0,
        visibleSince: document.visibilityState === "visible" ? Date.now() : null,
        totalVisibleMs: 0
      };

      function emit(type, payload) {
        const evt = {
          type,
          ts: Date.now(),
          ...(payload || {})
        };
        state.events.push(evt);
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
      window.__AIW_ACTIVITY__.on((e) => console.log("[AIW][live]", e));


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

      const VISIBLE_RATIO = 0.35;
      const MIN_VIEW_MS = 1000;

      function observeSections() {
        if (typeof IntersectionObserver !== "function") return;
        if (state.sectionObserver) {
          try { state.sectionObserver.disconnect(); } catch {}
          state.sectionObserver = null;
        }

        const sections = collectSections();
        if (!sections.length) return;

        state.sectionObserver = new IntersectionObserver((entries) => {
          const now = Date.now();
          for (const entry of entries) {
            const el = entry.target;
            const meta = state.sections.get(el);
            if (!meta) continue;

            const ratio = entry.intersectionRatio || 0;
            const isVisible = entry.isIntersecting && ratio >= VISIBLE_RATIO;

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
                }, MIN_VIEW_MS);
              } else {
                meta.maxRatio = Math.max(meta.maxRatio || 0, ratio);
              }
            } else if (meta.visibleSince) {
              const duration = now - meta.visibleSince;
              if (!meta.viewEmitted && duration >= MIN_VIEW_MS) {
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
        }, { threshold: [0, VISIBLE_RATIO, 0.6, 0.9] });

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
        const now = Date.now();
        state.sections.forEach((meta) => {
          if (!meta.visibleSince) return;
          const duration = now - meta.visibleSince;
          if (!meta.viewEmitted && duration >= MIN_VIEW_MS) {
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
        try { document.removeEventListener("visibilitychange", onVisibilityChange); } catch {}
        try { window.removeEventListener("beforeunload", onBeforeUnload); } catch {}
        flushSectionDurations("stop");
      }

      window.__AIW_ACTIVITY_TRACKER__ = { stop };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true, passive: true });
      } else {
        start();
      }
    } catch {}
  })();

  // --- режим рендера ---
  // если явно data-mode не задан, но скрипт стоит внутри контейнера → считаем inline
  const explicitMode = s.getAttribute("data-mode");
  const mode = (explicitMode || "float").toLowerCase();
  const isInline = mode === "inline";

  const iHeight = parseInt(s.getAttribute("data-height") || "600", 10);
  const fitMode = (s.getAttribute("data-fit") || "container").toLowerCase(); // "container" | "content"

  // ================= INLINE-РЕЖИМ ЧЕРЕЗ IFRAME =================
  if (isInline) {
    const base = host.replace(/\/$/, "");

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
    iframe.allow = "clipboard-write";

    let isFullscreen = false;
    let fullscreenOverlay = null;
    let fullscreenPlaceholder = null;
    let preFullscreenStyleText = null;
    let pendingInlineHeight = null;
    let hostScrollLockState = null;
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
      iframe.style.height = Math.max(200, iHeight) + "px";
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

function postFullscreenStateToFrame() {
  try {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      { type: "aiw:fullscreen-state", instanceId, value: isFullscreen },
      frameOrigin
    );
  } catch {}
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
    if (!hostNode) return false;

    const parent = iframe.parentNode;
    if (!parent) return false;

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
    unlockHostScroll();
    return false;
  }
}

function exitFullscreen() {
  if (!isFullscreen) return true;

  try {
    if (fullscreenPlaceholder && fullscreenPlaceholder.parentNode) {
      fullscreenPlaceholder.parentNode.insertBefore(iframe, fullscreenPlaceholder);
      fullscreenPlaceholder.remove();
    } else if (mount) {
      mount.appendChild(iframe);
    }

    if (fullscreenOverlay && fullscreenOverlay.parentNode) {
      fullscreenOverlay.parentNode.removeChild(fullscreenOverlay);
    }

    if (typeof preFullscreenStyleText === "string") {
      iframe.style.cssText = preFullscreenStyleText;
    }

    if (fitMode !== "container" && pendingInlineHeight != null) {
      iframe.style.height = pendingInlineHeight + "px";
    }

    unlockHostScroll();

    isFullscreen = false;
    setHubspotHidden(false);
    fullscreenOverlay = null;
    fullscreenPlaceholder = null;
    preFullscreenStyleText = null;
    postFullscreenStateToFrame();
    return true;
  } catch {
    unlockHostScroll();
    return false;
  }
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

      const d = e.data || {};
      if (!d || typeof d !== "object") return;

      // --- resize (у тебя уже было)
      if (d.type === "aiw:resize" && fitMode !== "container") {
        const minH = Math.max(200, iHeight);
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

    window.addEventListener("message", onFrameMessage, { passive: true });
    iframe.addEventListener("load", () => { postFullscreenStateToFrame(); }, { passive: true });

    mount.appendChild(iframe);
    postFullscreenStateToFrame();

    let scrollTarget = pickBestScroller(mount);
    let lastRepickAt = 0;

    // в inline-режиме ВЫХОДИМ — дальше скрипт ничего не делает
    return;
  }

  // ================= FLOAT-РЕЖИМ (ПЛАВАЮЩАЯ КНОПКА) =================

  if (!host || !siteId) {
    console.error("[AIW] missing data-site-id or host");
    return;
  }
  if (window.__AIW_LOADED__) return;
  window.__AIW_LOADED__ = true;

  const base = host.replace(/\/$/, "");
  const url  = new URL(base + "/api/clients/widget-config");
  url.searchParams.set("siteId", siteId);
  if (clientId) url.searchParams.set("clientId", clientId);

  (async () => {
    let config = null;
    try {
      const r = await fetch(url.toString(), {
        method: "GET",
        credentials: "omit",
        mode: "cors"
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      config = (j && (j.config || j)) || null;
    } catch (e) {
      console.warn("[AIW] config fetch failed:", e);
    }

    const cfg = {
      endpoint: base + "/api/aiw/chat",
      siteId,
      title: (config && (config.widgetTitle || config.title)) || "AI Assistant",
      position: (config && config.position) || "br",
      accent: (config && (config.primaryColor || config.accent)) || "#6D28D9",
      welcome: (config && (config.welcomeMessage || config.welcome)) || "Hi! How can I help?",
      lang: (config && config.lang) || "en",
      backgroundColor: (config && config.backgroundColor) || "#0f0f0f",
      textColor: (config && config.textColor) || "#ffffff",
      borderColor: (config && (config.borderColor || config.primaryColor)) || "#6D28D9",
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

      inlineAutostart: config?.inlineAutostart || null,

      // stream: берём из БД, если явно задано true/false, иначе по умолчанию true
      stream: (typeof config?.stream === "boolean") ? config.stream : true,
    };

    window.__AIW_CONFIG__ = cfg;

   // ===== Versioned widget.js =====
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

    console.warn("[AIW] Script failed:", src, "→ fallback:", fallback);
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
  })();
})();
