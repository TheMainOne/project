// aiw/widget-loader.js
(function () {
  const s = document.currentScript || (function () {
    const arr = document.getElementsByTagName("script");
    return arr[arr.length - 1];
  })();

  const host   = s.getAttribute("data-host");     // https://cloudcompliance.duckdns.org
  const siteId = s.getAttribute("data-site-id");  // SITE_123
  const jsSrc  = s.getAttribute("data-src") || (host.replace(/\/$/,'') + "/aiw/widget.js");

  if (!host || !siteId) { console.error("[AIW] missing data-host/site-id"); return; }
  if (window.__AIW_LOADED__) return;
  window.__AIW_LOADED__ = true;

  const cfgUrl = `${host.replace(/\/$/,'')}/api/widget-config?siteId=${encodeURIComponent(siteId)}`;

  (async () => {
    let config = null;
    try {
      const r = await fetch(cfgUrl, { credentials: "omit", mode: "cors" });
      const j = await r.json();
      config = (j && j.config) || null;
    } catch (e) {
      console.warn("[AIW] config fetch failed:", e);
    }

    // ▼ дефолты на случай отсутствия конфига
    const cfg = {
      endpoint: host.replace(/\/$/,'') + "/api/aiw/chat",
      siteId,
      title: (config && config.widgetTitle) || "AI Assistant",
      position: (config && config.position) || "br",
      accent: (config && config.primaryColor) || "#6D28D9",
      welcome: (config && config.welcomeMessage) || "Hi! How can I help?",
      lang: (config && config.lang) || "en",
      backgroundColor: (config && config.backgroundColor) || "#0f0f0f",
      textColor: (config && config.textColor) || "#ffffff",
      borderColor: (config && config.borderColor) || ((config && config.primaryColor) || "#6D28D9"),
      logo: (config && config.logoUrl) || null,

      autostart: !!(config && config.autostart),
      autostartDelay: Number((config && config.autostartDelay) || 5000),
      autostartMode: ((config && config.autostartMode) || "local").toLowerCase(),
      autostartMessage: (config && config.autostartMessage) || "",
      autostartPrompt: (config && config.autostartPrompt) || "",
      autostartCooldownHours: Number((config && config.autostartCooldownHours) || 12),
      preserveHistory: (config ? config.preserveHistory !== false : true),
      resetHistoryOnOpen: !!(config && config.resetHistoryOnOpen),
    };

    window.__AIW_CONFIG__ = cfg;

    const js = document.createElement("script");
    js.src = jsSrc;
    js.async = true;
    js.crossOrigin = "anonymous";
    document.head.appendChild(js);
  })();
})();
