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

    function findScrollableParent(el) {
      let cur = el;
      while (cur && cur !== document.documentElement) {
        const st = window.getComputedStyle(cur);
        const oy = st.overflowY;
        const ox = st.overflowX;
        const canY = (oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight + 1;
        const canX = (ox === "auto" || ox === "scroll") && cur.scrollWidth > cur.clientWidth + 1;
        if (canY || canX) return cur;
        cur = cur.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    }

    const scrollTarget = findScrollableParent(mount);
    const docScroller = document.scrollingElement || document.documentElement;

    function scrollParentBy(dy, dx) {
      const y = Number(dy) || 0;
      const x = Number(dx) || 0;

      // если страница скроллится не window, а контейнером — крутим контейнер
      if (scrollTarget && scrollTarget !== docScroller && scrollTarget !== document.body && scrollTarget !== document.documentElement) {
        if (y) scrollTarget.scrollTop += y;
        if (x) scrollTarget.scrollLeft += x;
      } else {
        window.scrollBy({ top: y, left: x, behavior: "auto" });
      }
    }

    function onFrameMessage(e) {
      // безопасность + гарантия что это наш iframe
      if (e.source !== iframe.contentWindow) return;
      if (e.origin !== frameOrigin) return;

      const d = e.data || {};
      if (!d || typeof d !== "object") return;

      // --- resize (у тебя уже было)
      if (d.type === "aiw:resize" && fitMode !== "container") {
        const minH = Math.max(200, iHeight);
        const h = Math.max(minH, parseInt(d.height || "0", 10) || 0);
        iframe.style.height = h + "px";
        return;
      }

      // --- NEW: scroll passthrough
      if (d.type === "aiw:scroll") {
        // если используешь instanceId — можно фильтровать
        if (d.instanceId && d.instanceId !== instanceId) return;
        scrollParentBy(d.deltaY, d.deltaX);
        return;
      }
    }

    window.addEventListener("message", onFrameMessage, { passive: true });

    mount.appendChild(iframe);

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

    const js = document.createElement("script");
    js.src = jsSrc + (jsSrc.includes("?") ? "&" : "?") + "v=" + Date.now();
    js.async = true;
    js.crossOrigin = "anonymous";
    document.head.appendChild(js);
  })();
})();
