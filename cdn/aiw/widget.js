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
  const AUTO_DELAY  = Math.max(0, (CFG.autostartDelay ?? 5000));
  const AUTO_MODE   = (CFG.autostartMode ?? "local").toLowerCase();
  const AUTO_MSG    = CFG.autostartMessage || "";
  const AUTO_PROMPT = CFG.autostartPrompt || "";
  const AUTO_COOLDOWN_HOURS = Math.max(0, (CFG.autostartCooldownHours ?? 12));
  const USER_INTERACTED_KEY = `aiw:userInteracted:session:${SITE_ID}`;
  const PRESERVE_HISTORY   = CFG.preserveHistory !== false;   // по умолчанию true (сохранять историю)
const RESET_HISTORY_ON_OPEN = CFG.resetHistoryOnOpen === true; // если true — чистим при каждом открытии
// логотип для аватарки ассистента
const LOGO = (
  typeof CFG.logo === "string"
    ? CFG.logo
    : (CFG.logo && CFG.logo.url) // поддержка { url: "..." }
) || null;

// тема (тёмная) — цвета по умолчанию + из конфига
const THEME = {
  bg: CFG.backgroundColor || "#0b0c0f",
  text: CFG.textColor || "#e5e7eb",
  panel: "#0f1318",
  border: CFG.borderColor || ACCENT,
  accent: ACCENT,
  bubbleAI: "rgba(255,255,255,.06)",
  bubbleUser: "#2b2f36",
  bubbleBorder: "rgba(255,255,255,.08)",
  time: "rgba(229,231,235,.6)"
};

console.debug("[AIW][cfg]", { AUTOSTART, AUTO_MODE, AUTO_DELAY, AUTO_COOLDOWN_HOURS, AUTO_MSG });

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

  // function alreadyInteracted() {
  //   // если пользователь уже что-то писал в этой сессии
  //   try {
  //     const arr = readHistory();
  //     return arr.some(m => m.role === "user");
  //   } catch { return false; }
  // }

function alreadyInteracted() {
  return sessionStorage.getItem(USER_INTERACTED_KEY) === "1";
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

const readHistory = () => {
  if (PRESERVE_HISTORY === false) return [];
  try { return JSON.parse(localStorage.getItem(storeKey) || "[]"); } catch { return []; }
};

const writeHistory = (arr) => {
  if (PRESERVE_HISTORY === false) return; // no-op
  try { localStorage.setItem(storeKey, JSON.stringify(arr.slice(-30))); } catch {}
};

if (PRESERVE_HISTORY === false) {
  try { localStorage.removeItem(storeKey); } catch {}
}
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
:host { all: initial; }
@keyframes aiw-bounce { 0%,80%,100%{transform:scale(.6);opacity:.45} 40%{transform:scale(1);opacity:1} }

.aiw-wrap{ position:fixed; z-index:2147483000; bottom:20px; }
.aiw-btn{ width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;
  box-shadow:0 8px 20px rgba(0,0,0,.2); background:${THEME.accent}; color:#fff;font-weight:700;font-size:16px; }
.aiw-panel{
  position:absolute; bottom:70px; width:360px; max-width:80vw; height:480px; max-height:70vh;
  display:none; flex-direction:column; background:${THEME.panel}; color:${THEME.text};
  border-radius:16px; overflow:hidden; box-shadow:0 14px 44px rgba(0,0,0,.25);
  border:1px solid ${THEME.border}22;
}
.aiw-header{ padding:12px 16px; background:${THEME.accent}; color:#fff; font-weight:700;
  display:flex; align-items:center; justify-content:space-between; }
.aiw-header .aiw-actions{ display:flex; align-items:center; gap:8px; }
.aiw-header button{ background:transparent; border:none; color:#fff; font-size:18px; cursor:pointer; }

.aiw-body{
  display:flex; flex-direction:column; flex:1; gap:8px; padding:12px; overflow:auto;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; font-size:14px;
  background:${THEME.panel};
}
.aiw-row{ display:flex; gap:8px; }
.aiw-row.me{ justify-content:flex-end; }
.aiw-ava{
  width:26px; height:26px; flex:0 0 26px; border-radius:50%;
  background:${THEME.bubbleUser}; border:1px solid ${THEME.bubbleBorder}; overflow:hidden;
}
.aiw-ava img{ width:100%; height:100%; object-fit:cover; display:block; }
.aiw-bubble{
  max-width:85%; padding:10px 12px; border-radius:12px; white-space:pre-wrap; word-break:break-word;
  border:1px solid transparent; box-shadow:0 1px 0 rgba(0,0,0,.2);
}
.aiw-row.me .aiw-bubble{
  background:${THEME.bubbleUser}; color:#fff; border-color:transparent;
}
.aiw-row.ai .aiw-bubble{
  background:${THEME.bubbleAI}; color:${THEME.text}; border-color:${THEME.bubbleBorder};
}
.aiw-time{ font-size:11px; color:${THEME.time}; margin-top:4px; }

.aiw-typing-bubble{
  display:inline-block; visibility:hidden; align-self:flex-start; max-width:85%; margin:8px 34px; /* отступ под аватар */
  padding:10px 12px; border-radius:12px; background:${THEME.bubbleAI}; color:${THEME.text};
}
.aiw-typing-dots{ display:inline-flex; gap:6px; align-items:center; }
.aiw-typing-dot{ width:8px;height:8px;border-radius:50%;background:#9aa1b2; animation:aiw-bounce 1.2s infinite ease-in-out both; }
.aiw-typing-dot:nth-child(2){ animation-delay:.15s } .aiw-typing-dot:nth-child(3){ animation-delay:.30s }

.aiw-footer{ padding:10px; border-top:1px solid ${THEME.bubbleBorder}; display:flex; gap:8px; align-items:center; background:${THEME.panel}; }
.aiw-input{
  flex:1; resize:none; border:1px solid #3a3a42; background:#1b1c20; color:${THEME.text};
  border-radius:12px; padding:10px 44px 10px 12px; outline:none; min-height:40px;
}
.aiw-send{
  position:relative; margin-left:-44px; width:36px; height:36px; border:none; border-radius:9999px;
  background:${THEME.accent}; color:#fff; cursor:pointer; flex:0 0 36px;
}
.aiw-send:disabled{ opacity:.6; cursor:default; }
`;


  shadow.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "aiw-wrap";
wrap.style[POSITION === "br" ? "right" : "left"] = "20px";

  shadow.appendChild(wrap);

  const btn = document.createElement("button");
btn.className = "aiw-btn";
btn.textContent = "AI";

const panel = document.createElement("div");
panel.className = "aiw-panel";
panel.style[POSITION === "br" ? "right" : "left"] = "0";


const header = document.createElement("div");
header.className = "aiw-header";
header.innerHTML = `<span>${TITLE}</span>`;
const close = document.createElement("button");
close.textContent = "×";
const resetBtn = document.createElement("button");
resetBtn.title = LANG.startsWith("ru") ? "Сбросить диалог" : "Reset chat";
resetBtn.textContent = "↺";
const actions = document.createElement("div");
actions.className = "aiw-actions";
actions.appendChild(resetBtn); actions.appendChild(close);
header.appendChild(actions);


const body = document.createElement("div");
body.className = "aiw-body";
const messagesWrap = document.createElement("div");
messagesWrap.style.display = "flex";
messagesWrap.style.flexDirection = "column";
body.appendChild(messagesWrap);
// пустой хинт (виден только когда нет сообщений)
const emptyHint = document.createElement("div");
emptyHint.style.cssText = `
  align-self:flex-start; max-width:85%; margin:8px 0; padding:10px 12px;
  border-radius:12px; background:${THEME.bubbleAI}; color:${THEME.text}; opacity:.7; display:none;
`;

emptyHint.textContent = WELCOME;
body.appendChild(emptyHint);

function updateEmptyHint(){
  emptyHint.style.display = history.length ? "none" : "block";
}


const footer = document.createElement("div");
footer.className = "aiw-footer";

const input = document.createElement("textarea");
input.rows = 1;
input.placeholder = LANG.startsWith("ru") ? "Спросите что-нибудь…" : "Ask me anything…";
input.className = "aiw-input";

const sendBtn = document.createElement("button");
sendBtn.className = "aiw-send";
sendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path fill="currentColor" d="M2 21l20-9L2 3l5 8-5 10z"></path>
</svg>`;

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
  if (!typing.isConnected) messagesWrap.appendChild(typing);
  typing.style.visibility = "visible";
  body.scrollTop = body.scrollHeight;
}
function hideTyping() {
  typing.style.visibility = "hidden";
}

function dedupeAutogreetAtTail() {
  let seen = false;
  for (let k = history.length - 1; k >= 0; k--) {
    const m = history[k];
    if (m && m.meta && m.meta.kind === "autogreet") {
      if (seen) {
        history.splice(k, 1); // убрать лишние автоприветы перед последним
      } else {
        seen = true; // сохраняем самый последний автопривет
      }
    } else {
      break; // как только дошли до не-автоприветствия — стоп
    }
  }
}


  // ---------- Chat logic ----------
let history = readHistory();

function fmtTime(ts){
  try{
    return new Date(ts).toLocaleTimeString(LANG.startsWith("ru") ? "ru-RU" : "en-US", { hour:"2-digit", minute:"2-digit" });
  }catch{ return ""; }
}

function render() {
  while (messagesWrap.firstChild) messagesWrap.removeChild(messagesWrap.firstChild);

  for (const m of history) {
    const isUser = m.role === "user";
    const row = document.createElement("div");
    row.className = "aiw-row " + (isUser ? "me" : "ai");

    // avatar
    const ava = document.createElement("div");
    ava.className = "aiw-ava";
    if (!isUser && LOGO) {
      const img = document.createElement("img");
      img.src = LOGO; img.alt = "logo"; ava.appendChild(img);
    }
    if (!isUser) row.appendChild(ava);

    // bubble + time
    const bubbleWrap = document.createElement("div");
    const bubble = document.createElement("div");
    bubble.className = "aiw-bubble";
    bubble.textContent = m.content || "";
    bubbleWrap.appendChild(bubble);

    const time = document.createElement("div");
    time.className = "aiw-time";
    time.textContent = fmtTime(m.ts || Date.now());
    bubbleWrap.appendChild(time);

    row.appendChild(bubbleWrap);
    if (isUser) row.appendChild(ava); // у пользователя — аватарка справа (пустой кружок)
    messagesWrap.appendChild(row);
  }

  updateEmptyHint();
  body.scrollTop = body.scrollHeight;
}


  render();

  let open = false;
  btn.addEventListener("click", () => {
  open = !open;
  panel.style.display = open ? "flex" : "none";

  if (open) {
    if (RESET_HISTORY_ON_OPEN) {
      try { localStorage.removeItem(storeKey); } catch {}
      try { sessionStorage.removeItem(USER_INTERACTED_KEY); } catch {}
      history = [];
      writeHistory(history);
      render();
    }
    setTimeout(() => input.focus(), 0);
  }
});

  close.addEventListener("click", () => { open = false; panel.style.display = "none"; });
resetBtn.addEventListener("click", (e) => {
  e.preventDefault();

  try { localStorage.removeItem(storeKey); } catch {}
  try { sessionStorage.removeItem(USER_INTERACTED_KEY); } catch {}
  history = [];
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
    dedupeAutogreetAtTail();
    history.push({ role: "assistant", content: AUTO_MSG, meta: { kind: "autogreet" }, ts: Date.now()});
    writeHistory(history);
    render();
    markAutoGreetUsed();

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

  // убрать прежний блок подсказок, если был
  const prev = messagesWrap.querySelector('[data-aiw-suggestions="1"]');
  if (prev) prev.remove();

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
      doSend();
    });
    row.appendChild(b);
  });

  const bubble = document.createElement("div");
  bubble.setAttribute("data-aiw-suggestions", "1");
  bubble.style.margin = "6px 0";
  bubble.style.maxWidth = "85%";
  bubble.style.alignSelf = "flex-start";
  bubble.style.padding = "8px 10px";
  bubble.style.borderRadius = "12px";
  bubble.style.background = "#EEF2FF";
  bubble.appendChild(row);

  messagesWrap.appendChild(bubble);
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
        dedupeAutogreetAtTail();
        history.push({ role: "assistant", content: reply || (LANG.startsWith("ru") ? "…" : "…"), meta: { kind: "autogreet" }, ts: Date.now()});
        writeHistory(history);
        render();
        markAutoGreetUsed();
        return;
      }

      // SSE
      history.push({ role: "assistant", content: "",  ts: Date.now()});
      const idx = history.length - 1;
      writeHistory(history);
      render();

      const reader = res.body.getReader();
      await pumpSSE(reader, (data) => {
        if (data === "[DONE]") return;
        history[idx].content += data;
        render();
      });
      markAutoGreetUsed();
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
      if (!shouldAutoGreetNow()) return;
      if (AUTO_MODE === "ai") {
        if (RESET_HISTORY_ON_OPEN) {
          try { localStorage.removeItem(storeKey); } catch {}
          history = []; writeHistory(history); render();
        }
        fetchAIGreeting();
      } else {
        if (RESET_HISTORY_ON_OPEN) {
          try { localStorage.removeItem(storeKey); } catch {}
          history = []; writeHistory(history); render();
        }
        showLocalGreeting();
      }
    }, AUTO_DELAY);
  }



  async function doSend() {
    const text = sanitize(input.value).trim();
    if (!text || inflight) return;

    history.push({ role: "user", content: text, ts: Date.now() });
    try { sessionStorage.setItem(USER_INTERACTED_KEY, "1"); } catch {}
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
  meta: { citations }, // при желании сохраняем, но не рендерим
  ts: Date.now()
});

        writeHistory(history);
        render();
        return;
      }

      // SSE mode
      history.push({ role: "assistant", content: "", ts: Date.now() });
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
