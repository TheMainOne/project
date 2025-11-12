// cdn/aiw/widget-loader.js
(function () {
  const s = document.currentScript || (function () {
    const arr = document.getElementsByTagName("script");
    return arr[arr.length - 1];
  })();

  const host      = s.getAttribute("data-host");        // https://cloudcompliance.duckdns.org
  const siteId    = s.getAttribute("data-site-id");     // напр. ZORKA_SITE_001
  const clientId  = s.getAttribute("data-client-id");   // (опционально) ObjectId клиента
  const jsSrc     = s.getAttribute("data-src") || (host.replace(/\/$/,'') + "/aiw/widget.js");

  // ▼ NEW: поддержка inline-режима через <iframe>
const mode   = (s.getAttribute("data-mode") || "float").toLowerCase(); // "inline" | "float"
const target = s.getAttribute("data-target");   // CSS-селектор контейнера
const iHeight = parseInt(s.getAttribute("data-height") || "600", 10);
const fitMode = (s.getAttribute("data-fit") || "container").toLowerCase(); // "container" | "content"

if (mode === "inline") {
  const base = host.replace(/\/$/,'');
  const mount =
    (target && document.querySelector(target)) ||
    (() => { const d=document.createElement("div"); document.body.appendChild(d); return d; })();

  const iframe = document.createElement("iframe");
  // передаём siteId/clientId и флаг mode=inline в страницу фрейма
  const qp = new URLSearchParams();
  qp.set("siteId", siteId);
  if (clientId) qp.set("clientId", clientId);
  qp.set("mode", "inline");
   qp.set("fit", fitMode);

 iframe.src   = `${base}/aiw/widget-frame.html?${qp.toString()}`;
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.display = "block";
  iframe.style.maxWidth = "100%";
  iframe.style.boxSizing = "border-box";
  iframe.setAttribute("scrolling", "no");
  iframe.allow = "clipboard-write";

  // fit=container → высота равна высоте контейнера (наблюдаем за ним)
  function setHeightFromContainer() {
    const rect = mount.getBoundingClientRect();
    const h = Math.round(rect.height || 0);
    iframe.style.height = (h > 0 ? h : Math.max(200, iHeight)) + "px";
  }

  if (fitMode === "container") {
    setHeightFromContainer();                     // стартовая
    const ro = new ResizeObserver(setHeightFromContainer);
    ro.observe(mount);                            // реакция на изменение контейнера
    window.addEventListener("resize", setHeightFromContainer);
  } else {
    // fit=content → ребенок сам присылает высоту
  iframe.style.height = Math.max(200, iHeight) + "px";
    window.addEventListener("message", (e) => {
      if (!e?.data || e.data.type !== "aiw:resize") return;
      if (e.source === iframe.contentWindow) {
        const h = Math.max(200, parseInt(e.data.height || "0", 10) || 0);
        iframe.style.height = h + "px";
      }
    });
  }

  mount.appendChild(iframe);

  // важно: в inline-режиме ЗАВЕРШАЕМ загрузчик и ничего дальше не подгружаем
  return;
}

  if (!host || !siteId) { console.error("[AIW] missing data-host/site-id"); return; }
  if (window.__AIW_LOADED__) return;
  window.__AIW_LOADED__ = true;

  // --- Вариант А: передаём siteId/clientId в query ---
  const base = host.replace(/\/$/,'');
  const url  = new URL(base + "/api/clients/widget-config");
  url.searchParams.set("siteId", siteId);
  if (clientId) url.searchParams.set("clientId", clientId);

  (async () => {
    let config = null;
    try {
      const r = await fetch(url.toString(), { method: "GET", credentials: "omit", mode: "cors" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      // сервер может вернуть либо { config: {...} }, либо уже готовый объект конфига
      config = (j && (j.config || j)) || null;
    } catch (e) {
      console.warn("[AIW] config fetch failed:", e);
    }

    // ▼ дефолты на случай отсутствия/неполного конфига
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
     logo: (
  config?.logo?.url ||
  config?.logoUrl ||
  (typeof config?.logo === "string" ? config.logo : null)
),

      autostart: !!(config && config.autostart),
      autostartDelay: Number(config?.autostartDelay ?? 5000),
      autostartMode: (config?.autostartMode ?? "local").toLowerCase(),
      autostartMessage: (config && config.autostartMessage) || "",
      autostartPrompt: (config && config.autostartPrompt) || "",
      autostartCooldownHours: Number(config?.autostartCooldownHours ?? 12),
      preserveHistory: (config ? config.preserveHistory !== false : true),
      resetHistoryOnOpen: !!(config && config.resetHistoryOnOpen),
    };

    window.__AIW_CONFIG__ = cfg;

    const js = document.createElement("script");
    js.src = jsSrc + (jsSrc.includes("?") ? "&" : "?") + "v=" + Date.now();
    js.async = true;
    js.crossOrigin = "anonymous";
    document.head.appendChild(js);
  })();
})();
