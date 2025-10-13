/*
====================================================
1) widget-loader.js (serve at https://cdn.yoursite.com/aiw/widget-loader.js)
- Purpose: small loader so sites can embed with one line.
- It defers loading the heavier widget.js and passes data-attributes as config.
====================================================
*/
(function () {
  try {
    var s = document.currentScript;
    // Support both currentScript and data- attributes passed explicitly
    var endpoint = s.getAttribute("data-endpoint");
    var siteId = s.getAttribute("data-site-id");
    var title = s.getAttribute("data-title") || "AI Assistant";
    var position = s.getAttribute("data-position") || "br"; // br, bl
    var accent = s.getAttribute("data-accent") || "#6D28D9"; // Tailwind violet-700
    var welcome = s.getAttribute("data-welcome") || "Hi! How can I help?";
    var lang = s.getAttribute("data-lang") || "en";

    if (!endpoint) {
      console.error("[AIW] Missing data-endpoint on script tag");
      return;
    }

    // Prevent double init
    if (window.__AIW_LOADED__) return; 
    window.__AIW_LOADED__ = true;

    // Create a global config object the widget can read
    window.__AIW_CONFIG__ = {
      endpoint: endpoint,
      siteId: siteId || null,
      title: title,
      position: position,
      accent: accent,
      welcome: welcome,
      lang: lang,
    };

    // Load main widget bundle
    var js = document.createElement("script");
    js.src = s.getAttribute("data-src") || "https://cdn.yoursite.com/aiw/widget.js";
    js.async = true;
    js.crossOrigin = "anonymous";
    document.head.appendChild(js);
  } catch (e) {
    console.error("[AIW] loader error", e);
  }
})();