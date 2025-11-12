// aiw/widget-loader.js
(function () {
  const s = document.currentScript || (function () {
    const arr = document.getElementsByTagName("script");
    return arr[arr.length - 1];
  })();

  const host      = s.getAttribute("data-host");        // https://cloudcompliance.duckdns.org
  const siteId    = s.getAttribute("data-site-id");     // напр. ZORKA_SITE_001
  const clientId  = s.getAttribute("data-client-id");   // (опционально) ObjectId клиента
  const jsSrc     = s.getAttribute("data-src") || (host.replace(/\/$/,'') + "/aiw/widget.js");

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
    js.src = jsSrc;
    js.async = true;
    js.crossOrigin = "anonymous";
    document.head.appendChild(js);
  })();
})();
