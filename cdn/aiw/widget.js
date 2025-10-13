/*
====================================================
aiw widget (fixed)
====================================================
*/
(function widget () {
  const CFG = (window.__AIW_CONFIG__ || {});
  const ENDPOINT = CFG.endpoint;
  const SITE_ID  = CFG.siteId || (location.host + "::default");
  const TITLE    = CFG.title || "AI Assistant";
  const ACCENT   = CFG.accent || "#6D28D9";
  const POSITION = CFG.position === "bl" ? "bl" : "br";
  const WELCOME  = CFG.welcome || "Hi! How can I help?";
  const LANG     = CFG.lang || "en";

  // ---------- Utilities ----------
  const storeKey = `aiw_hist_${SITE_ID}`;
  const readHistory = () => { try { return JSON.parse(localStorage.getItem(storeKey) || "[]"); } catch { return []; } };
  const writeHistory = (arr) => { try { localStorage.setItem(storeKey, JSON.stringify(arr.slice(-30))); } catch {} };
  const sanitize = (s) => (s || "").toString().slice(0, 4000);

  function parseSSEChunk(buf, onData) {
    for (const block of buf.split(/\r?\n\r?\n/)) {
      for (const ln of block.split(/\r?\n/)) {
        if (ln.startsWith("data:")) onData(ln.slice(5).trimStart());
      }
    }
  }

  // ---------- DOM ----------
  const root = document.createElement("div");
  const shadow = root.attachShadow({ mode: "open" });

  // styles (Shadow DOM)
  const style = document.createElement("style");
  style.textContent = `
@keyframes aiw-bounce { 0%,80%,100%{transform:scale(.6);opacity:.45} 40%{transform:scale(1);opacity:1} }
.aiw-typing-bubble{ display:none; align-self:flex-start; max-width:85%; margin:8px 0; padding:10px 12px; border-radius:12px; background:#EEF2FF; }
.aiw-typing-dots{ display:inline-flex; gap:6px; align-items:center; }
.aiw-typing-dot{ width:8px;height:8px;border-radius:50%;background:#9aa1b2; animation:aiw-bounce 1.2s infinite ease-in-out both; }
.aiw-typing-dot:nth-child(2){ animation-delay:.15s }
.aiw-typing-dot:nth-child(3){ animation-delay:.30s }
`;
  shadow.appendChild(style);

  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.zIndex = 2147483000;
  wrap.style[POSITION === "br" ? "right" : "left"] = "20px";
  wrap.style.bottom = "20px";
  shadow.appendChild(wrap);

  const btn = document.createElement("button");
  btn.style.cssText = `
    width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;
    box-shadow:0 8px 20px rgba(0,0,0,.2);background:${ACCENT};color:#fff;
    font-weight:700;font-size:16px;
  `;
  btn.textContent = "AI";

  const panel = document.createElement("div");
  panel.style.cssText = `
    position:absolute;${POSITION === "br" ? "right:0" : "left:0"};bottom:70px;
    width:360px;max-width:80vw;height:480px;max-height:70vh;display:none;flex-direction:column;
    background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 14px 44px rgba(0,0,0,.25);
  `;

  const header = document.createElement("div");
  header.style.cssText = `padding:12px 16px;background:${ACCENT};color:#fff;font-weight:700;display:flex;align-items:center;justify-content:space-between`;
  header.innerHTML = `<span>${TITLE}</span>`;
  const close = document.createElement("button");
  close.textContent = "×";
  close.style.cssText = `background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer`;
  header.appendChild(close);

  const body = document.createElement("div");
  body.style.cssText = `flex:1;padding:12px;overflow:auto;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px`;

  const footer = document.createElement("div");
  footer.style.cssText = `padding:10px;border-top:1px solid #eee;display:flex;gap:8px`;

  const input = document.createElement("textarea");
  input.rows = 1;
  input.placeholder = LANG.startsWith("ru") ? "Спросите что-нибудь…" : "Ask me anything…";
  input.style.cssText = `flex:1;resize:none;border:1px solid #ddd;border-radius:10px;padding:10px;outline:none`;

  const sendBtn = document.createElement("button");
  sendBtn.textContent = LANG.startsWith("ru") ? "Отправить" : "Send";
  sendBtn.style.cssText = `background:${ACCENT};color:#fff;border:none;border-radius:10px;padding:0 14px;cursor:pointer`;

  footer.appendChild(input);
  footer.appendChild(sendBtn);
  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);
  wrap.appendChild(btn);
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
  function showTyping(){ typing.style.display = "inline-block"; if(!typing.isConnected) body.appendChild(typing); body.scrollTop = body.scrollHeight; }
  function hideTyping(){ typing.style.display = "none"; }

  // ---------- Chat logic ----------
  let history = readHistory();
  if (history.length === 0) history.push({ role: "assistant", content: WELCOME });

  function render() {
    body.innerHTML = "";
    for (const m of history) {
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
    }
    body.scrollTop = body.scrollHeight;
  }
  render();

  let open = false;
  btn.addEventListener("click", () => { open = !open; panel.style.display = open ? "flex" : "none"; if (open) setTimeout(() => input.focus(), 0); });
  close.addEventListener("click", () => { open = false; panel.style.display = "none"; });

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
        parts.forEach(block => block.split(/\r?\n/).forEach(ln => { if (ln.startsWith("data:")) onData(ln.slice(5).trimStart()); }));
      }
      if (buffer) buffer.split(/\r?\n/).forEach(ln => { if (ln.startsWith("data:")) onData(ln.slice(5).trimStart()); });
    })();
  }

  let inflight = null;

  async function doSend() {
    const text = sanitize(input.value).trim();
    if (!text || inflight) return;

    history.push({ role: "user", content: text });
    writeHistory(history);
    render();
    input.value = "";

    const safeMsgs = history.map(({ role, content }) => ({ role, content })).slice(-30);
    const controller = new AbortController();
    inflight = controller;

    try {
      showTyping();

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-aiw-site": SITE_ID },
        body: JSON.stringify({ messages: safeMsgs, stream: false, meta: { referrer: location.href } }),
        signal: controller.signal,
        keepalive: true,
        mode: "cors",
      });

      const ct = (res.headers.get("content-type") || "").toLowerCase();

      if (!ct.includes("text/event-stream")) {
        // JSON mode
        const raw = await res.text();
        let reply = "";
        try { reply = (JSON.parse(raw) || {}).reply || ""; } catch { reply = raw || ""; }
        history.push({ role: "assistant", content: reply || (LANG.startsWith("ru") ? "…" : "…") });
        writeHistory(history);
        render();
        return;
      }

      // SSE mode
      history.push({ role: "assistant", content: "" });
      const assistantIndex = history.length - 1;
      writeHistory(history); render();

      const reader = res.body.getReader();
      await pumpSSE(reader, (data) => {
        if (data === "[DONE]") return;
        history[assistantIndex].content += data;
        render();
      });

    } catch (err) {
      history.push({ role: "assistant", content: LANG.startsWith("ru") ? "⚠️ Ошибка соединения" : "⚠️ Connection error" });
      writeHistory(history); render();
    } finally {
      hideTyping();
      inflight = null;
    }
  }

  // Global events
  function aiwOpen(){ try { if (panel.style.display === "none") btn.click(); } catch {} }
  function aiwClose(){ try { if (panel.style.display !== "none") btn.click(); } catch {} }
  function aiwToggle(){ try { btn.click(); } catch {} }
  window.addEventListener("aiw:open", aiwOpen);
  window.addEventListener("aiw:close", aiwClose);
  window.addEventListener("aiw:toggle", aiwToggle);
  window.__AIW__ = { open: aiwOpen, close: aiwClose, toggle: aiwToggle };
})();
