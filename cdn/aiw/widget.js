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
  const AUTOSTART   = CFG.autostart === true;
  const AUTO_DELAY  = Math.max(0, CFG.autostartDelay || 5000);
  const AUTO_MODE   = (CFG.autostartMode || "local").toLowerCase(); // "local"|"ai"
  const AUTO_MSG    = CFG.autostartMessage || "";
  const AUTO_PROMPT = CFG.autostartPrompt || "";
  const AUTO_COOLDOWN_HOURS = Math.max(0, CFG.autostartCooldownHours || 12);

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

// создаём/переиспользуем идентификаторы
const VISITOR_ID = getVisitorId();
// сессию создаём при загрузке виджета (сбросится кнопкой Reset)
let SESSION_ID = newSessionId();

// [AIW-LOGGING] сбор метаданных страницы и UTM
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
    // если пользователь уже что-то писал в этой сессии
    try {
      const arr = readHistory();
      return arr.some(m => m.role === "user");
    } catch { return false; }
  }

  function shouldAutoGreetNow() {
    if (!AUTOSTART) return false;
    if (sessionStorage.getItem(AUTO_KEY_SESSION) === "1") return false;
    if (!isTabVisible()) return false;
    if (alreadyInteracted()) return false;

    const lastTs = +(localStorage.getItem(AUTO_KEY_LAST_TS) || 0);
    const hoursPassed = (Date.now() - lastTs) / 36e5;
    if (hoursPassed < AUTO_COOLDOWN_HOURS) return false;

    return true;
  }

  function markAutoGreetUsed() {
    sessionStorage.setItem(AUTO_KEY_SESSION, "1");
    localStorage.setItem(AUTO_KEY_LAST_TS, String(Date.now()));
  }



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
.aiw-typing-bubble{
  display:inline-block;          /* <= всегда пузырь */
  visibility:hidden;             /* <= прячем без сдвига вёрстки */
  align-self:flex-start;
  max-width:85%;
  margin:8px 0;
  padding:10px 12px;
  border-radius:12px;
  background:#EEF2FF;
}
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

  const resetBtn = document.createElement("button");
resetBtn.title = LANG.startsWith("ru") ? "Сбросить диалог" : "Reset chat";
resetBtn.textContent = "↺";
resetBtn.style.cssText = `
  background:transparent;border:none;color:#fff;font-size:18px;cursor:pointer;
  margin-right: 8px;
`;

// Порядок: [title] ... [Reset] [×]
const rightWrap = document.createElement("div");
rightWrap.style.display = "flex";
rightWrap.style.alignItems = "center";
rightWrap.appendChild(resetBtn);
rightWrap.appendChild(close);
header.innerHTML = `<span>${TITLE}</span>`;
header.appendChild(rightWrap);

  const body = document.createElement("div");
body.style.cssText = `
  display:flex;
  flex-direction:column;
  flex:1;
  padding:12px;
  overflow:auto;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  font-size:14px
`;

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
function showTyping() {
  if (panel.style.display === "none") return;
  if (!typing.isConnected) body.appendChild(typing);
  typing.style.visibility = "visible";
  body.scrollTop = body.scrollHeight;
}
function hideTyping() {
  typing.style.visibility = "hidden";
}

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
resetBtn.addEventListener("click", (e) => {
  e.preventDefault();

  try { localStorage.removeItem(storeKey); } catch {}
  history = [{ role: "assistant", content: WELCOME }];
  writeHistory(history);
  SESSION_ID = newSessionId();
  render();
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
        parts.forEach(block => block.split(/\r?\n/).forEach(ln => { if (ln.startsWith("data:")) onData(ln.slice(5).trimStart()); }));
      }
      if (buffer) buffer.split(/\r?\n/).forEach(ln => { if (ln.startsWith("data:")) onData(ln.slice(5).trimStart()); });
    })();
  }

  let inflight = null;


    function openPanelIfHidden() {
    if (panel.style.display === "none") {
      btn.click(); // использует твою логику открытия
    }
  }

function showLocalGreeting() {
  if (!AUTO_MSG) return;
  openPanelIfHidden();

  // можно показать "typing" ради эффекта
  showTyping();
  setTimeout(() => {
    hideTyping();
    history.push({ role: "assistant", content: AUTO_MSG });
    writeHistory(history);
    render();

    // OPTIONAL: быстрые предложения
    renderSuggestions([
      "Pricing for 10 users",
      "What bundles do you have?",
      "Book a demo"
    ]);
  }, 250); // делаем почти мгновенно
}

function renderSuggestions(suggestions) {
  if (!Array.isArray(suggestions) || !suggestions.length) return;

  const row = document.createElement("div");
  row.style.cssText = "display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;";

  suggestions.forEach(label => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `
      padding:6px 10px; border:1px solid #e2e8f0; border-radius:9999px;
      background:#fff; cursor:pointer; font-size:12px;
    `;
    b.addEventListener("click", () => {
      input.value = label;
      doSend(); // обычная отправка (вот тут уже пойдёт запрос на бэк)
    });
    row.appendChild(b);
  });

  // рисуем как "сообщение ассистента"
  const bubble = document.createElement("div");
  bubble.style.margin = "6px 0";
  bubble.style.maxWidth = "85%";
  bubble.style.alignSelf = "flex-start";
  bubble.style.padding = "8px 10px";
  bubble.style.borderRadius = "12px";
  bubble.style.background = "#EEF2FF";
  bubble.appendChild(row);

  body.appendChild(bubble);
  body.scrollTop = body.scrollHeight;
}



  async function fetchAIGreeting() {
    openPanelIfHidden();
    const safeMsgs = [
      { role: "system", content: "You are a concise, friendly website assistant." },
      { role: "user",   content: AUTO_PROMPT || "Write a short warm greeting and suggest 3 quick questions." }
    ];

    const controller = new AbortController();
    try {
      showTyping();

      const meta = collectMeta();
      // помечаем автогрит для аналитики на бэке
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
          stream: false,
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
        history.push({ role: "assistant", content: reply || (LANG.startsWith("ru") ? "…" : "…") });
        writeHistory(history);
        render();
        return;
      }

      // SSE
      history.push({ role: "assistant", content: "" });
      const idx = history.length - 1;
      writeHistory(history);
      render();

      const reader = res.body.getReader();
      await pumpSSE(reader, (data) => {
        if (data === "[DONE]") return;
        history[idx].content += data;
        render();
      });
    } catch (e) {
      history.push({ role: "assistant", content: LANG.startsWith("ru") ? "⚠️ Ошибка соединения" : "⚠️ Connection error" });
      writeHistory(history);
      render();
    } finally {
      hideTyping();
    }
  }

  function scheduleAutoGreet() {
    if (!shouldAutoGreetNow()) return;
    setTimeout(() => {
      if (!shouldAutoGreetNow()) return; // повторная проверка (вкладка могла стать невидимой и т.п.)
      markAutoGreetUsed();
      if (AUTO_MODE === "ai") {
        fetchAIGreeting();
      } else {
        showLocalGreeting();
      }
    }, AUTO_DELAY);
  }


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
    stream: false,
    meta // <- отправляем всю мету
  }),
  signal: controller.signal,
  keepalive: true,
  mode: "cors",
});


      // const res = await fetch(ENDPOINT, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json", "x-aiw-site": SITE_ID },
      //   body: JSON.stringify({ messages: safeMsgs, stream: false, meta: { referrer: location.href, lang: LANG } }),
      //   signal: controller.signal,
      //   keepalive: true,
      //   mode: "cors",
      // });

      const ct = (res.headers.get("content-type") || "").toLowerCase();

      if (!ct.includes("text/event-stream")) {
        // JSON mode
        // const raw = await res.text();
        // let reply = "";
        // try { reply = (JSON.parse(raw) || {}).reply || ""; } catch { reply = raw || ""; }
        // history.push({ role: "assistant", content: reply || (LANG.startsWith("ru") ? "…" : "…") });
const raw = await res.text();
 let reply = "";
 let citations = [];
 try { 
   const obj = JSON.parse(raw) || {};
   reply = obj.reply || ""; 
   citations = Array.isArray(obj.citations) ? obj.citations : [];
 } catch { reply = raw || ""; }
//  if (citations.length) {
//    const label = LANG.startsWith("ru") ? "Источники:" : "Sources:";
//    const list  = citations.map((c,i)=>`[${i+1}] ${c.url}`).join("  ");
//    reply = `${reply}\n\n${label} ${list}`;
//  }
history.push({
  role: "assistant",
  content: reply || (LANG.startsWith("ru") ? "…" : "…"),
  meta: { citations } // при желании сохраняем, но не рендерим
});

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
     try {
    // первичный запуск через AUTO_DELAY
    scheduleAutoGreet();

    // если вкладка стала видимой (вернулись на страницу) — пробуем ещё раз
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        scheduleAutoGreet();
      }
    });
  } catch (e) {
    console.debug("[AIW][autogreet] trigger error:", e);
  }
})();
