
/*
====================================================
2) widget.js (serve at https://cdn.yoursite.com/aiw/widget.js)
- Pure vanilla JS, no dependencies. Shadow DOM encapsulated styles.
- Streams tokens via fetch(SSE over POST) from your /api/aiw/chat endpoint.
- Persists short chat history in localStorage per siteId.
====================================================
*/
(function widget () {
  const CFG = (window.__AIW_CONFIG__ || {});
  const ENDPOINT = CFG.endpoint; // e.g. https://api.yourapp.com/api/aiw/chat
  const SITE_ID = CFG.siteId || (location.host + "::default");
  const TITLE = CFG.title || "AI Assistant";
  const ACCENT = CFG.accent || "#6D28D9";
  const POSITION = CFG.position === "bl" ? "bl" : "br";
  const WELCOME = CFG.welcome || "Hi! How can I help?";
  const LANG = CFG.lang || "en";

  // ---------- Utilities ----------
  const storeKey = `aiw_hist_${SITE_ID}`;
  const readHistory = () => {
    try { return JSON.parse(localStorage.getItem(storeKey) || "[]"); } catch { return []; }
  };
  const writeHistory = (arr) => {
    try { localStorage.setItem(storeKey, JSON.stringify(arr.slice(-30))); } catch {}
  };
  const sanitize = (s) => (s || "").toString().slice(0, 4000);

  function parseSSEChunk(buf, onData) {
    // buf is a string of one or more SSE frames
    const parts = buf.split(/\n\n/);
    for (const block of parts) {
      const lines = block.split(/\n/);
      for (const ln of lines) {
        if (ln.startsWith("data: ")) {
          onData(ln.slice(6));
        }
      }
    }
  }

  // ---------- DOM ----------
  const root = document.createElement("div");
  const shadow = root.attachShadow({ mode: "open" });
    // typing bubble (assistant-style)
  const typing = document.createElement("div");
  typing.style.margin = "8px 0";
  typing.style.maxWidth = "85%";
  typing.style.whiteSpace = "pre-wrap";
  typing.style.wordBreak = "break-word";
  typing.style.alignSelf = "flex-start";
  typing.style.padding = "10px 12px";
  typing.style.borderRadius = "12px";
  typing.style.background = "#EEF2FF"; // как ассистент

  const typingInner = document.createElement("div");
  typingInner.className = "aiw-dots";
  typingInner.innerHTML = `<span class="aiw-dot"></span><span class="aiw-dot"></span><span class="aiw-dot"></span>`;
  typing.appendChild(typingInner);

  function showTyping() {
    // не дублировать
    if (!typing.isConnected) {
      body.appendChild(typing);
      body.scrollTop = body.scrollHeight;
    }
  }
  function hideTyping() {
    try { typing.remove(); } catch {}
  }


  const wrap = document.createElement("div");
  wrap.setAttribute("part", "aiw-wrap");
  wrap.style.position = "fixed";
  wrap.style.zIndex = 2147483000;
  wrap.style[POSITION === "br" ? "right" : "left"] = "20px";
  wrap.style.bottom = "20px";
  shadow.appendChild(wrap);

  const btn = document.createElement("button");
  btn.setAttribute("part", "aiw-button");
  btn.setAttribute("aria-label", TITLE);
  btn.style.width = "56px";
  btn.style.height = "56px";
  btn.style.borderRadius = "50%";
  btn.style.border = "none";
  btn.style.cursor = "pointer";
  btn.style.boxShadow = "0 8px 20px rgba(0,0,0,0.2)";
  btn.style.background = ACCENT;
  btn.style.color = "#fff";
  btn.style.fontWeight = "700";
  btn.style.fontSize = "16px";
  btn.textContent = "AI";

  const panel = document.createElement("div");
  panel.setAttribute("part", "aiw-panel");
  panel.style.position = "absolute";
  panel.style[POSITION === "br" ? "right" : "left"] = "0";
  panel.style.bottom = "70px";
  panel.style.width = "360px";
  panel.style.maxWidth = "80vw";
  panel.style.height = "480px";
  panel.style.maxHeight = "70vh";
  panel.style.display = "none";
  panel.style.flexDirection = "column";
  panel.style.background = "#fff";
  panel.style.borderRadius = "16px";
  panel.style.overflow = "hidden";
  panel.style.boxShadow = "0 14px 44px rgba(0,0,0,0.25)";

  const header = document.createElement("div");
  header.style.padding = "12px 16px";
  header.style.background = ACCENT;
  header.style.color = "#fff";
  header.style.fontWeight = "700";
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.innerHTML = `<span>${TITLE}</span>`;

  const close = document.createElement("button");
  close.textContent = "×";
  close.style.background = "transparent";
  close.style.border = "none";
  close.style.color = "#fff";
  close.style.fontSize = "20px";
  close.style.cursor = "pointer";

  header.appendChild(close);

  const body = document.createElement("div");
  body.style.flex = "1";
  body.style.padding = "12px";
  body.style.overflow = "auto";
  body.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  body.style.fontSize = "14px";

  const footer = document.createElement("div");
  footer.style.padding = "10px";
  footer.style.borderTop = "1px solid #eee";
  footer.style.display = "flex";
  footer.style.gap = "8px";

  const input = document.createElement("textarea");
  input.rows = 1;
  input.placeholder = LANG.startsWith("ru") ? "Спросите что-нибудь…" : "Ask me anything…";
  input.style.flex = "1";
  input.style.resize = "none";
  input.style.border = "1px solid #ddd";
  input.style.borderRadius = "10px";
  input.style.padding = "10px";
  input.style.outline = "none";

  const sendBtn = document.createElement("button");
  sendBtn.textContent = LANG.startsWith("ru") ? "Отправить" : "Send";
  sendBtn.style.background = ACCENT;
  sendBtn.style.color = "#fff";
  sendBtn.style.border = "none";
  sendBtn.style.borderRadius = "10px";
  sendBtn.style.padding = "0 14px";
  sendBtn.style.cursor = "pointer";

  footer.appendChild(input);
  footer.appendChild(sendBtn);

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);

  wrap.appendChild(btn);
  wrap.appendChild(panel);
  document.body.appendChild(root);

  // ---------- Chat logic ----------
  let history = readHistory();
  if (history.length === 0) {
    history.push({ role: "assistant", content: WELCOME });
  }

  function render() {
    body.innerHTML = "";
    history.forEach((m, idx) => {
      const bubble = document.createElement("div");
      bubble.style.margin = "8px 0";
      bubble.style.maxWidth = "85%";
      bubble.style.whiteSpace = "pre-wrap";
      bubble.style.wordBreak = "break-word";

      const isUser = m.role === "user";
      bubble.style.alignSelf = isUser ? "flex-end" : "flex-start";
      bubble.style.padding = "10px 12px";
      bubble.style.borderRadius = "12px";
      bubble.style.background = isUser ? "#F1F5F9" : "#EEF2FF";
      bubble.textContent = m.content;

      body.appendChild(bubble);
    });
    body.scrollTop = body.scrollHeight;
  }

  render();

  let open = false;
  btn.addEventListener("click", () => {
    open = !open;
    panel.style.display = open ? "flex" : "none";
    if (open) setTimeout(() => input.focus(), 0);
  });
  close.addEventListener("click", () => {
    open = false;
    panel.style.display = "none";
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });
  sendBtn.addEventListener("click", doSend);


  let inflight = null;

// НОВОЕ: аккуратный инкрементальный парсер SSE
function pumpSSE(reader, onData) {
  const decoder = new TextDecoder();
  let buffer = ""; // копим «хвост» между чанками

  return (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: false });

      // режем только полные блоки, последний оставляем в буфере
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || ""; // неполный «хвост» оставляем

      for (const block of parts) {
        for (const ln of block.split(/\r?\n/)) {
          if (ln.startsWith("data:")) {
            onData(ln.slice(5).trimStart());
          }
        }
      }
    }

    // вдруг в конце остался полноценный блок без завершающего \n\n
    if (buffer) {
      for (const ln of buffer.split(/\r?\n/)) {
        if (ln.startsWith("data:")) onData(ln.slice(5).trimStart());
      }
    }
  })();
}

  async function doSend() {
    const text = sanitize(input.value).trim();
    if (!text || inflight) return;

    // пушим только юзера сразу
    history.push({ role: "user", content: text });
    writeHistory(history);
    render();
    input.value = "";

    const safeMsgs = history.map(({ role, content }) => ({ role, content })).slice(-30);

    const controller = new AbortController();
    inflight = controller;

    try {
      // показать индикатор печати
      showTyping();

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-aiw-site": SITE_ID,
        },
        body: JSON.stringify({
          messages: safeMsgs,
          stream: false, // JSON-режим
          meta: { referrer: location.href }
        }),
        signal: controller.signal,
        keepalive: true,
        mode: "cors",
      });

      // спрятать индикатор
      hideTyping();

      if (!res.ok) throw new Error("Bad response");

      // безопасно читаем как текст -> JSON
      const raw = await res.text();
      let reply = "";
      try { reply = (JSON.parse(raw) || {}).reply || ""; } catch { reply = raw || ""; }

      // теперь пушим ассистента одним сообщением
      history.push({ role: "assistant", content: reply });
      writeHistory(history);
      render();

    } catch (err) {
      hideTyping();
      // graceful fallback
      history.push({
        role: "assistant",
        content: LANG.startsWith("ru")
          ? "Извините, произошла ошибка соединения."
          : "Sorry, connection error."
      });
      writeHistory(history);
      render();
    } finally {
      inflight = null;
    }
  }


    function aiwOpen()  { try { if (panel.style.display === "none") btn.click(); } catch {} }
  function aiwClose() { try { if (panel.style.display !== "none") btn.click(); } catch {} }
  function aiwToggle(){ try { btn.click(); } catch {} }

  // Глобальные события
  window.addEventListener("aiw:open", aiwOpen);
  window.addEventListener("aiw:close", aiwClose);
  window.addEventListener("aiw:toggle", aiwToggle);

  // (опционально) экспортнём мини-API для отладки в консоли
  window.__AIW__ = { open: aiwOpen, close: aiwClose, toggle: aiwToggle };
})();
