/*
====================================================
aiw widget v0.1.1 
====================================================
*/
(function widget () {
  const CFG = (window.__AIW_CONFIG__ || {});
  const STREAM = (typeof CFG.stream === "boolean") ? CFG.stream : true;
const RAW_FONT_FAMILY = (CFG.fontFamily || "").trim();       // может быть ""
const FONT_FILE_URL   = (CFG.fontFileUrl || "").trim() || null;
const FONT_CSS_URL    = (CFG.fontCssUrl || "").trim() || null;

  // --- НОВОЕ: ширина окна (для inline это ширина iframe) ---
  const VIEWPORT_W =
    window.innerWidth ||
    document.documentElement?.clientWidth ||
    document.body?.clientWidth ||
    0;

  const IS_MOBILE = VIEWPORT_W <= 480;         // телефоны
  const IS_TABLET = !IS_MOBILE && VIEWPORT_W <= 768; // планшеты
  const UA = navigator.userAgent || "";
  const IS_IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const QUERY = new URLSearchParams(location.search);

// имя, под которым мы реально используем шрифт
const EFFECTIVE_FONT_NAME = RAW_FONT_FAMILY || (FONT_FILE_URL ? "__aiw_custom" : null);

const BASE_FONT_STACK = EFFECTIVE_FONT_NAME
  ? `'${EFFECTIVE_FONT_NAME}', system-ui,-apple-system,Segoe UI,Roboto,sans-serif`
  : 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
  // ▼ NEW: режим рендера
const MODE   = (CFG.mode || QUERY.get("mode") || "float").toLowerCase();
const INLINE = MODE === "inline";
const FIT_MODE = (QUERY.get("fit") || "container").toLowerCase();
const FILL_CONTAINER = INLINE && FIT_MODE === "container";
const PARENT_ORIGIN = QUERY.get("parentOrigin") || "*";
const INSTANCE_ID = QUERY.get("instanceId") || "";
const MAX_LEN = 1000;
let FIRST_BOOT = true; // первый старт виджета за эту загрузку страницы


  if (INLINE) {
    const bodyEl = document.body;
    if (bodyEl) {
      bodyEl.style.margin = "0";
      bodyEl.style.background = bodyEl.style.background || "transparent";
      bodyEl.style.boxSizing = bodyEl.style.boxSizing || "border-box";
    }
  }

  if (INLINE && FILL_CONTAINER) {
    const docEl = document.documentElement;
    if (docEl) {
      docEl.style.height = "100%";
      docEl.style.minHeight = "100%";
    }
    const bodyEl = document.body;
    if (bodyEl) {
      bodyEl.style.height = "100%";
      bodyEl.style.minHeight = "100%";
      bodyEl.style.display = "flex";
      bodyEl.style.flexDirection = "column";
      bodyEl.style.alignItems = "stretch";
      bodyEl.style.justifyContent = "flex-start";
    }
  }

  const ENDPOINT = CFG.endpoint;
  const API_ORIGIN = ENDPOINT ? new URL(ENDPOINT).origin : location.origin;
  const SITE_ID  = CFG.siteId || (location.host + "::default");
  const TITLE    = CFG.title || "AI Assistant";
const ACCENT = CFG.primaryColor || CFG.accent || "#6D28D9";
  const POSITION = CFG.position === "bl" ? "bl" : "br";
  const WELCOME  = CFG.welcome || "Hi! How can I help?";
  const LANG     = CFG.lang || "en";
  const AUTOSTART   = CFG.autostart === true;
  const AUTO_DELAY  = Math.max(0, (CFG.autostartDelay ?? 5000));
  const AUTO_MODE   = (CFG.autostartMode ?? "local").toLowerCase();
  const AUTO_MSG    = CFG.autostartMessage || "";
  const AUTO_PROMPT = CFG.autostartPrompt || "";
  const AUTO_COOLDOWN_HOURS = Math.max(0, (CFG.autostartCooldownHours ?? 12));
  const INLINE_AUTOSTART_CFG = CFG.inlineAutostart || null;
  const USER_INTERACTED_KEY = `aiw:userInteracted:session:${SITE_ID}`;
  const IDLE_DEMO_LOOP_GAP_MS = 1500;
  const IDLE_DEMO_BADGE_TEXT = "Example conversation";
let showWelcomeHint = true;
const PRESERVE_HISTORY   = INLINE ? true : (CFG.preserveHistory !== false);
const RESET_HISTORY_ON_OPEN = !INLINE && CFG.resetHistoryOnOpen === true;

const STORAGE = (() => {
  try {
    if (INLINE && typeof sessionStorage !== "undefined") return sessionStorage;
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {}
  return null;
})();

// логотип для аватарки ассистента
const LOGO =
  CFG.logoUrl ||                              // из loader'а
  (typeof CFG.logo === "string" ? CFG.logo :  // если положили строку
   CFG.logo && CFG.logo.url) ||               // если положили объект { url }
  null;

const DEBUG = (CFG.debugAutostart === true) || /\baiwDebug=1\b/.test(location.search);
const log = (...a) => { if (DEBUG) console.debug("[AIW]", ...a); };

log("CFG", {
  site: SITE_ID, AUTOSTART, AUTO_MODE, AUTO_DELAY, AUTO_COOLDOWN_HOURS,
  AUTO_MSG_len: (AUTO_MSG||"").length, preserveHistory: CFG.preserveHistory,
  resetHistoryOnOpen: RESET_HISTORY_ON_OPEN
});

// тема (тёмная) — всё, что можно, берём из уже существующих полей конфига
const THEME = {
  // фон всего inline-виджета / панели
  bg: CFG.backgroundColor || "#0b0c0f",
  // основной цвет текста (сообщения, подписи, подсказки)
  text: CFG.textColor || "#e5e7eb",
  // фон панели и инпута — по умолчанию такой же, как backgroundColor
  panel: CFG.backgroundColor || "#0f1318",
  // цвет границ — сначала borderColor, иначе акцент
  border: CFG.borderColor || ACCENT,
  // акцент (хедер, кнопка send, плавающая кнопка)
  accent: ACCENT,
  // цвет текста на акцентном фоне (хедер, иконка send, launcher)
  // НОВЫХ полей в конфиге не нужно — берём textColor
  accentText: CFG.textColor || "#ffffff",
  // фон пузыря ассистента (оставляем нейтральным, чтобы всегда читалось)
  bubbleAI: "rgba(255,255,255,.06)",
  // фон пузыря пользователя — привязываем к primaryColor
  bubbleUser: CFG.primaryColor || "#2b2f36",
  // граница пузырей — если есть borderColor, используем его, иначе дефолт
  bubbleBorder: CFG.borderColor || "rgba(255,255,255,.08)",
  // цвет текста в пузыре пользователя
  userText: CFG.textColor || "#ffffff",
  // цвет для времени и подсказок
  time: "rgba(229,231,235,.6)"
};

  let baseSize = Number(CFG.baseFontSize || 14);

  if (IS_MOBILE) {
    baseSize -= 2;      // телефоны – чуть меньше
  } else if (IS_TABLET) {
    baseSize -= 1;      // планшеты – тоже немного меньше
  }

  const BASE_FONT_SIZE = Math.max(
    10,
    Math.min(24, baseSize)
  );


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

function alreadyInteracted() {
  try {
    return sessionStorage.getItem(USER_INTERACTED_KEY) === "1";
  } catch {
    return false;
  }
}

function markUserInteracted() {
  try {
    sessionStorage.setItem(USER_INTERACTED_KEY, "1");
  } catch {}
}

function shouldAutoGreetNow() {
  if (!AUTOSTART) { log("block: AUTOSTART=false"); return false; }
  const sess = sessionStorage.getItem(AUTO_KEY_SESSION);
  if (sess === "1") { log("block: session-flag set", { key: AUTO_KEY_SESSION }); return false; }
  if (!isTabVisible()) { log("block: tab not visible"); return false; }
  if (alreadyInteracted()) { log("block: alreadyInteracted (session)"); return false; }

  const lastTs = +(localStorage.getItem(AUTO_KEY_LAST_TS) || 0);
  const hoursPassed = (Date.now() - lastTs) / 36e5;
  if (hoursPassed < AUTO_COOLDOWN_HOURS) {
    log("block: cooldown", { lastTs, hoursPassed, AUTO_COOLDOWN_HOURS });
    return false;
  }

  log("shouldAutoGreetNow = true");
  return true;
}

function markAutoGreetUsed() {
  sessionStorage.setItem(AUTO_KEY_SESSION, "1");
  localStorage.setItem(AUTO_KEY_LAST_TS, String(Date.now()));
  log("markAutoGreetUsed()", {
    sessionKey: AUTO_KEY_SESSION,
    lastKey: AUTO_KEY_LAST_TS
  });
}

  // ---------- Utilities ----------
const storeKey = `aiw_hist_${SITE_ID}`;

const readHistory = () => {
  if (PRESERVE_HISTORY === false || !STORAGE) return [];
  try {
    return JSON.parse(STORAGE.getItem(storeKey) || "[]");
  } catch {
    return [];
  }
};

const writeHistory = (arr) => {
  if (PRESERVE_HISTORY === false || !STORAGE) return; // no-op
  try {
    STORAGE.setItem(storeKey, JSON.stringify(arr.slice(-30)));
  } catch {}
};

if (PRESERVE_HISTORY === false && STORAGE) {
  try { STORAGE.removeItem(storeKey); } catch {}
}

const sanitize = (s) => (s || "").toString().slice(0, MAX_LEN);


  // ---------- DOM ----------
  const root = document.createElement("div");
 // host должен уметь растянуться на высоту iframe
 root.style.cssText = "display:block;";
  if (INLINE) {
    root.style.width = "100%";
    root.style.maxWidth = "100%";
  }
  if (FILL_CONTAINER) {
    root.style.height = "100%";
    root.style.minHeight = "0";
    root.style.flex = "1 1 auto";
  }
  const shadow = root.attachShadow({ mode: "open" });

  // styles (Shadow DOM)
const style = document.createElement("style");

  if (FONT_CSS_URL) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_CSS_URL;
    shadow.appendChild(link);
  }

style.textContent = `
 ${FONT_FILE_URL && EFFECTIVE_FONT_NAME ? `
 @font-face {
   font-family: '${EFFECTIVE_FONT_NAME}';
   src: url('${FONT_FILE_URL}') format('truetype');
   font-weight: 400;
   font-style: normal;
   font-display: swap;
 }
 ` : ""}
 
 :host {
   all: initial;
   display:block;
   ${INLINE ? "width:100%;" : ""}
   ${FILL_CONTAINER ? "height:100%; min-height:0;" : "height:auto;"}
 }

 @keyframes aiw-bounce {
   0%,80%,100%{transform:scale(.6);opacity:.45}
   40%{transform:scale(1);opacity:1}
 }

 .aiw-wrap{
   position:fixed;
   z-index:2147483000;
   bottom:20px;
 }

.aiw-btn{
  width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;
  box-shadow:0 8px 20px rgba(0,0,0,.2);
  background:${THEME.accent};
  color:${THEME.accentText};
  font-weight:700;font-size:16px;
    font-family:${BASE_FONT_STACK};
}

 .aiw-panel{
   position:absolute;
   bottom:70px;
   width:360px;
   max-width:80vw;
   height:480px;
   max-height:70vh;
   display:none;
   flex-direction:column;
   background:${THEME.panel};
   color:${THEME.text};
   border-radius:16px;
   overflow:hidden;
   box-shadow:0 14px 44px rgba(0,0,0,.25);
   border:1px solid ${THEME.border}22;
 }

.aiw-header-brand{
  display:flex;
  align-items:center;
  gap:8px;
}
  .aiw-header-title{
    display:flex;
    align-items:center;
    gap:8px;
  }

  .aiw-header-title-text{
    font-weight:700;
  }
    
  .aiw-beta-badge{
    display:inline-flex;
    align-items:center;

    /* меньше бейдж */
    padding:1px 5px;
    border-radius:9999px;
    border:1px solid rgba(255,255,255,0.28);
    background:rgba(255,255,255,0.08);

    /* меньше шрифт, как в референсе */
    font-size:8px;
    letter-spacing:0.08em;
    text-transform:uppercase;
    color:${THEME.accentText};
    white-space:nowrap;
    line-height:1;

    opacity:0;
    /* чуть более медленное появление */
    animation: aiw-badge-fade 1.1s ease-out .35s forwards;

    /* немного ПОВЫШЕ относительно текста */
    transform:translateY(-1px);
  }

  @keyframes aiw-badge-fade{
    from{
      opacity:0;
      transform:translateY(-4px);
    }
    to{
      opacity:1;
      transform:translateY(-1px);
    }
  }



.aiw-header-logo{
  width:24px;
  height:24px;
  border-radius:9999px;
  overflow:hidden;
  background:rgba(0,0,0,.25);
  border:1px solid rgba(255,255,255,.3);
  flex:0 0 24px;
}

.aiw-header-logo img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}

.aiw-header .aiw-actions{
  display:flex;
  align-items:center;
  gap:8px;
}

.aiw-header button{
  background:transparent;
  border:none;
  color:#fff;
  font-size:18px;
  cursor:pointer;
}
.aiw-header{
  padding:12px 16px;
  background:${THEME.accent};
  color:${THEME.accentText};
  font-weight:700;
  display:flex;
  align-items:center;
  justify-content:space-between;
    font-family:${BASE_FONT_STACK};
  font-size:${BASE_FONT_SIZE + 1}px;
}
.aiw-header .aiw-actions{
  display:flex;
  align-items:center;
  gap:8px;
}
.aiw-header button{
  background:transparent;
  border:none;
  color:${THEME.accentText};
  font-size:18px;
  cursor:pointer;
}

.aiw-fs-toggle{
  width:34px;
  height:34px;
  border-radius:12px !important;
  border:none !important;
  background:transparent !important;
  color:#dbe4f0 !important;
  display:inline-flex !important;
  align-items:center;
  justify-content:center;
  padding:0 !important;
  line-height:1;
  transition:background-color .15s ease, box-shadow .15s ease, color .15s ease;
}

.aiw-fs-toggle:hover{
  background:rgba(255,255,255,.14) !important;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);
  color:#ffffff !important;
}

.aiw-fs-toggle:active{
  background:rgba(255,255,255,.2) !important;
}

.aiw-fs-toggle:focus-visible{
  outline:2px solid rgba(148,163,184,.45);
  outline-offset:1px;
}

.aiw-fs-toggle svg{
  width:16px;
  height:16px;
  display:block;
  stroke:currentColor;
  fill:none;
  stroke-width:1.8;
  stroke-linecap:round;
  stroke-linejoin:round;
}

.aiw-panel.aiw-panel-fullscreen{
  border-radius:0 !important;
  border-width:0 !important;
}

.aiw-panel.aiw-panel-fullscreen .aiw-header{
  padding-top:calc(12px + env(safe-area-inset-top));
}

.aiw-panel.aiw-panel-fullscreen .aiw-footer{
  padding-bottom:calc(20px + env(safe-area-inset-bottom));
}

.aiw-footer{
  position:relative;                   
  padding:10px 16px;
  border-top:1px solid ${THEME.bubbleBorder};
  display:flex;
  align-items:center;
  background:${THEME.panel};

  --aiw-input-min-h: 44px; /* 1 строка */
  --aiw-input-max-h: 92px; /* до ~3 строк */
}

.aiw-footer-meta{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:4px 16px 10px;
  font-size:11px;
  color:${THEME.time};
}

.aiw-char-counter{
  flex:0 0 auto;
}
.aiw-body{
  display:flex;
  flex-direction:column;
  flex:1;
  gap:8px;
  padding:12px;
  overflow:auto;
  min-height:0;
    font-family:${BASE_FONT_STACK};
  font-size:${BASE_FONT_SIZE}px;
  background:${THEME.panel};

  scrollbar-width:thin;
  scrollbar-color:${THEME.bubbleBorder} transparent;
}

.aiw-body::-webkit-scrollbar{
  width:8px;
}

/* ===== textarea scrollbar (когда overflow-y:auto) ===== */
.aiw-input{
  scrollbar-width: none;          /* скрывает полосу */
}

.aiw-input::-webkit-scrollbar{
  width: 0px;
  height: 0px;
}
.aiw-input::-webkit-scrollbar-thumb{
  background: transparent;
}
.aiw-input::-webkit-scrollbar-track{
  background: transparent;
}

.aiw-body::-webkit-scrollbar-track{
  background:transparent;
}

.aiw-body::-webkit-scrollbar-thumb{
  background:${THEME.bubbleBorder};
  border-radius:4px;
}

${(INLINE && IS_IOS) ? `
/* iOS momentum scroll for inline */
.aiw-body{
  -webkit-overflow-scrolling: touch;
}
.aiw-input{
  -webkit-overflow-scrolling: touch;
}
` : ""}

.aiw-typing-bubble{
  align-self:flex-start;
  margin-top:8px;
  padding:6px 10px;
  border-radius:9999px;
  background:${THEME.bubbleAI};
  color:${THEME.text};
  display:flex;
  align-items:center;
  opacity:.8;
}
.aiw-typing-bubble.me{
  align-self:flex-end;
  background:${THEME.bubbleUser};
  color:${THEME.userText};
}
.aiw-typing-bubble.ai{
  align-self:flex-start;
  background:${THEME.bubbleAI};
  color:${THEME.text};
}

.aiw-typing-dots{
  display:flex;
  gap:4px;
}

.aiw-typing-dot{
  width:6px;
  height:6px;
  border-radius:50%;
  background:${THEME.text};
  opacity:.4;
  animation: aiw-dot 1s infinite ease-in-out;
}

/* анимация точек */
@keyframes aiw-dot{
  0%, 80%, 100%{
    transform:scale(.6);
    opacity:.3;
  }
  40%{
    transform:scale(1);
    opacity:1;
  }
}

.aiw-row{
  display:flex;
  gap:8px;
}
  .aiw-row + .aiw-row{
  margin-top:12px;
}

.aiw-row.me + .aiw-row.ai,
.aiw-row.ai + .aiw-row.me{
  margin-top:16px;
}

.aiw-row.me{ justify-content:flex-end; }

.aiw-ava{
  width:26px;
  height:26px;
  flex:0 0 26px;
  border-radius:50%;
  border:1px solid ${THEME.bubbleBorder};
  overflow:hidden;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:12px;
  font-weight:600;
    font-family:${BASE_FONT_STACK};
}

/* аватар ассистента */
.aiw-ava.ai{
  background:${THEME.bubbleAI};
  color:${THEME.text};
}

/* аватар пользователя */
.aiw-ava.me{
  background:${THEME.bubbleUser};
  color:${THEME.userText};
}

.aiw-ava img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}


.aiw-bubble{
  max-width:85%;
  padding:10px 12px;
  border-radius:12px;
   white-space:normal;
  word-break:break-word;
  border:1px solid transparent;
  box-shadow:0 1px 0 rgba(0,0,0,.2);
    line-height:1.5; 
}

.aiw-h1{ font-size:1.15em; font-weight:800; margin:6px 0 4px; }
.aiw-h2{ font-size:1.08em; font-weight:800; margin:6px 0 4px; }
.aiw-h3{ font-size:1.02em; font-weight:800; margin:6px 0 4px; }

.aiw-bubble a {
  color: ${INLINE ? "#60a5fa" : THEME.accent};
  text-decoration: underline;
  word-break: break-all;
}

.aiw-bubble a:hover {
  text-decoration: none;
}
  
.aiw-row.me .aiw-bubble{
  background:${THEME.bubbleUser};
  color:${THEME.userText};
  border-color:transparent;
}

.aiw-row.ai .aiw-bubble{
  background:${THEME.bubbleAI};
  color:${THEME.text};
  border-color:${THEME.bubbleBorder};
}
  .aiw-bubble-wrap{
  display:flex;
  flex-direction:column;
  max-width:85%;
}

.aiw-time{
  margin-top:4px;
  font-size:11px;
  color:${THEME.time};
}

/* для сообщений ассистента — время слева под пузырём */
.aiw-row.ai .aiw-bubble-wrap{
  align-items:flex-start;
}

/* для сообщений пользователя — время справа под пузырём */
.aiw-row.me .aiw-bubble-wrap{
  align-items:flex-end;
}



/* textarea autosize */
/* wrapper клипает скролл по скруглению */
.aiw-input-wrap{
  flex: 1 1 auto;
  border-radius: 12px;
  overflow: hidden;                 /* <-- главное: скролл не "вылазит" */
  border: 1px solid ${THEME.bubbleBorder};
  background: ${THEME.panel};
  box-sizing: border-box;
}

/* textarea autosize */
.aiw-input {
  width: 100%;
  display: block;

  resize: none;
  border: none;                     /* рамка на wrapper */
  background: transparent;          /* фон на wrapper */
  color: ${THEME.text};
  outline: none;
  box-sizing: border-box;

  font-family: ${BASE_FONT_STACK};
  font-size: ${BASE_FONT_SIZE}px;

  /* многострочный режим */
  line-height: 1.35;

  /* autosize: растём от min до max */
  height: auto;
  min-height: var(--aiw-input-min-h);
  max-height: var(--aiw-input-max-h);

  /* паддинги (место под кнопку в float справа) */
  padding: 10px 52px 10px 16px;

  /* до max — без скролла, после max — включим через JS */
  overflow-y: hidden;
}


/* лимиты по умолчанию (desktop) */
.aiw-footer{
  --aiw-input-min-h: 44px;  /* 1 строка */
  --aiw-input-max-h: 68px;  /* ~2 строки */
}



.aiw-send {
  position:absolute;
  right:24px;
  top:50%;
  transform:translateY(-50%);
  width:32px;              
  height:32px;  
  border:none;
  border-radius:9999px;

  /* белый круг для FLOAT-режима */
  background:#ffffff;
  color:#000000;

  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  flex:none;
  font-family:${BASE_FONT_STACK};
  box-shadow:0 4px 12px rgba(0,0,0,.35);
}

.aiw-send-icon {
  width: 42%;
  height: 42%;
  display: block;
}


.aiw-send:disabled{
  opacity:.6;
  cursor:default;
}


 ${FILL_CONTAINER ? `
 .aiw-wrap {
   position: relative;
   top: auto;
   right: auto;
   bottom: auto;
   left: auto;
   width: 100%;
   height: 100%;
   min-height: 0;
   display: flex;
   flex-direction: column;
 }
 .aiw-panel {
   position: relative;
   top: auto;
   right: auto;
   bottom: auto;
   left: auto;
   width: 100%;
   max-width: 100%;
   height: 100%;
   max-height: 100%;
   display: flex;
   flex: 1 1 auto;
   min-height: 0;
 }
 .aiw-body { flex: 1 1 auto; min-height: 0; }
 .aiw-footer { flex: 0 0 auto; }
 ` : ""}

 /* INLINE overrides — стиль как на макете, но цвета из THEME */
${INLINE ? `
  .aiw-wrap {
    position: relative !important;
    inset: auto !important;
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;

    /* чтобы не было «второго» прямоугольника вокруг панели */
    background: transparent !important;

    display:flex;
    align-items:stretch;
  }

.aiw-panel {
  position: relative !important;
  inset: auto !important;
  width: 100% !important;
  max-width: 100% !important;
  height: 100% !important;
  max-height: 100% !important;

  display:flex !important;
  flex-direction:column;

  box-sizing: border-box;
  border: 1px solid ${THEME.border} !important;
  border-radius: 24px !important;
  overflow: hidden;
  box-shadow: none !important;
  background:${THEME.bg};
}



  /* HEADER + полоска под тайтлом = borderColor */
  .aiw-header {
    background: ${THEME.bg} !important;
    color: ${THEME.accentText} !important;
    border-bottom: 1px solid ${THEME.border};
    padding: 12px 24px;
  }

  .aiw-header-brand {
    gap: 10px;
  }

  /* ЧАТ-ОБЛАСТЬ */
  .aiw-body {
    padding: 32px 40px 16px;
  }

  /* без аватарок и времени */
  .aiw-ava {
    display: none !important;
  }

  .aiw-time {
    display: none !important;
  }

  .aiw-row {
    gap: 0;
  }

  .aiw-bubble-wrap {
    max-width: 75%;
  }

  /* ассистент — тёмный пузырь слева */
  .aiw-row.ai .aiw-bubble {
    background: ${THEME.bubbleAI};
    color: ${THEME.text};
    border-radius: 16px;
    border-color: ${THEME.bubbleBorder};
  }

  /* пользователь — светлый пузырь справа */
  .aiw-row.me {
    justify-content:flex-end;
  }
  .aiw-row.me .aiw-bubble {
    background: #ffffff;
    color: #111827;
    border-radius: 16px;
    border-color: transparent;
  }

  /* FOOTER: без белой полоски сверху */
.aiw-footer{
  position: relative;
  padding: 20px 32px;
  border-top: none !important;
  background:${THEME.bg};
  display:flex;
  align-items:stretch;
}



  .aiw-footer-meta {
    display:none !important;
  }

/* инпут (INLINE): рамка и фон на wrapper */
.aiw-input-wrap{
  position: relative;
  flex: 1 1 auto;
  border-radius: 9999px;
  background: rgba(255,255,255,0.04);
  border: 1px solid ${THEME.border};
  overflow: hidden;
}

/* textarea внутри: просто паддинги */

.aiw-input{
  padding: 12px 60px 12px 16px; /* справа место под кнопку */
}

  .aiw-input::placeholder {
    color: rgba(249,250,251,0.75);
  }

  /* кнопка: белый круг с чёрной стрелкой */
.aiw-send{
  position: absolute !important;
  right: 12px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;

  width: 40px !important;
  height: 40px !important;
  border-radius: 9999px !important;

  background: ${THEME.border} !important;
  box-shadow: none !important;
  padding: 0 !important;
}

.aiw-send-icon{
  width: 18px;
  height: 18px;
}

` : ""}
/* --- RESPONSIVE (работает и в float, и в inline) --- */
@media (max-width: 480px) {
 .aiw-body { font-size: 14px !important; }
  .aiw-header { font-size: 18px !important; }

  .aiw-footer { --aiw-input-min-h: 44px; --aiw-input-max-h: 64px; } /* ~2 строки */
  .aiw-send-icon { width:18px; height:18px; }

  .aiw-btn { width:48px; height:48px; }
  .aiw-panel { max-width: 96vw; }
}

@media (min-width: 481px) and (max-width: 768px) {
  .aiw-body { font-size: 15px !important; }
  .aiw-header { font-size: 19px !important; }

  .aiw-footer { --aiw-input-min-h: 46px; --aiw-input-max-h: 68px; } /* ~2 строки */
  .aiw-send-icon { width:20px; height:20px; }

  .aiw-btn { width:52px; height:52px; }
}

`;

  shadow.appendChild(style);
if (INLINE && FIT_MODE === "content") {
  const fix = document.createElement("style");
  fix.textContent = `
    :host, html, body { height: auto !important; }
    .aiw-wrap { height: auto !important; position: relative !important; }
    .aiw-panel {
      min-height: 480px !important; 
      position: relative !important;
      height: auto !important;
      max-height: none !important;
      display: flex !important;
      width: 100% !important;
      max-width: 100% !important;
      bottom: auto !important;
      right: auto !important;
      left: auto !important;
    }
  `;
  shadow.appendChild(fix);
}
const wrap = document.createElement("div");
wrap.className = "aiw-wrap";

// ▼ NEW: позиционирование зависит от режима
if (INLINE) {
  // внутри iframe/inline — это обычный блочный контейнер
  wrap.style.position = "relative";
  wrap.style.bottom   = "auto";
  wrap.style.right    = "auto";
  wrap.style.left     = "auto";
  wrap.style.width    = "100%";
  wrap.style.height   = FILL_CONTAINER ? "100%" : "auto";
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.alignItems = "stretch";
  wrap.style.flex = "1 1 auto";
  wrap.style.minHeight = FILL_CONTAINER ? "0" : "";
} else {
  wrap.style.position = "fixed";
  wrap.style.bottom = "20px";
  wrap.style[POSITION === "br" ? "right" : "left"] = "20px";
}

shadow.appendChild(wrap);

 const btn = document.createElement("button");
btn.className = "aiw-btn";
btn.textContent = "AI";

const panel = document.createElement("div");
panel.className = "aiw-panel";

// ▼ NEW: размеры/позиция под inline
if (INLINE) {
  panel.style.position = "relative";
  panel.style.bottom = "auto";
  panel.style.right = "auto";
  panel.style.left = "auto";
  panel.style.width = "100%";
  panel.style.maxWidth = "100%";
  panel.style.height = FILL_CONTAINER ? "100%" : "auto";
  panel.style.maxHeight = FILL_CONTAINER ? "100%" : "none";
  panel.style.display = "flex";   // сразу видимая
  panel.style.flex = "1 1 auto";
  panel.style.minHeight = "0";
} else {
  panel.style.position = "absolute";
  panel.style.bottom = "70px";
  panel.style[POSITION === "br" ? "right" : "left"] = "0";
  panel.style.display = "none";   // открывается по кнопке
}

if (INLINE && FIT_MODE === "content") {
  wrap.style.height  = "auto";
  panel.style.height = "auto";
}

const header = document.createElement("div");
header.className = "aiw-header";

// блок с брендом: логотип + текст
const brand = document.createElement("div");
brand.className = "aiw-header-brand";

const brandLogo = document.createElement("div");
brandLogo.className = "aiw-header-logo";
if (LOGO) {
  const img = document.createElement("img");
  img.src = LOGO;
  img.alt = "logo";
  brandLogo.appendChild(img);
}

// обёртка для текста + бейджа
const titleWrap = document.createElement("div");
titleWrap.className = "aiw-header-title";

const brandTitle = document.createElement("span");
brandTitle.className = "aiw-header-title-text";
brandTitle.textContent = TITLE;

// сам бейдж
const betaBadge = document.createElement("span");
betaBadge.className = "aiw-beta-badge";
betaBadge.textContent = "Beta";

titleWrap.appendChild(brandTitle);
titleWrap.appendChild(betaBadge);

brand.appendChild(brandLogo);
brand.appendChild(titleWrap);


const close = document.createElement("button");
close.textContent = "×";
const resetBtn = document.createElement("button");
resetBtn.title = LANG.startsWith("ru") ? "Сбросить диалог" : "Reset chat";
resetBtn.textContent = "↺";

const fsBtn = document.createElement("button");
fsBtn.className = "aiw-fs-toggle";
fsBtn.type = "button";

const FS_ENTER_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 10L20 4"></path>
    <path d="M15 4H20V9"></path>
    <path d="M10 14L4 20"></path>
    <path d="M9 20H4V15"></path>
  </svg>
`;

const FS_EXIT_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6L18 18"></path>
    <path d="M18 6L6 18"></path>
  </svg>
`;

let inlineFullscreen = false;
let inlineBusy = false;

function getInlineFullscreenBaseTitle() {
  return inlineFullscreen
    ? (LANG.startsWith("ru") ? "\u0412\u044b\u0439\u0442\u0438 \u0438\u0437 \u043f\u043e\u043b\u043d\u043e\u0433\u043e \u044d\u043a\u0440\u0430\u043d\u0430" : "Exit fullscreen")
    : (LANG.startsWith("ru") ? "\u041d\u0430 \u0432\u0435\u0441\u044c \u044d\u043a\u0440\u0430\u043d" : "Fullscreen");
}

function syncInlineFullscreenControl() {
  fsBtn.innerHTML = inlineFullscreen ? FS_EXIT_ICON : FS_ENTER_ICON;
  const baseTitle = getInlineFullscreenBaseTitle();
  const busyTitle = LANG.startsWith("ru")
    ? "\u0414\u043e\u0436\u0434\u0438\u0442\u0435\u0441\u044c \u043e\u0442\u0432\u0435\u0442\u0430"
    : "Wait for response";

  fsBtn.title = inlineBusy ? busyTitle : baseTitle;
  fsBtn.setAttribute("aria-label", fsBtn.title);
  fsBtn.setAttribute("aria-pressed", inlineFullscreen ? "true" : "false");
  fsBtn.setAttribute("aria-disabled", inlineBusy ? "true" : "false");
  fsBtn.disabled = inlineBusy;
  panel.classList.toggle("aiw-panel-fullscreen", inlineFullscreen);
}

function setInlineFullscreenState(next) {
  inlineFullscreen = !!next;
  syncInlineFullscreenControl();
}

function setInlineBusyState(next) {
  inlineBusy = !!next;
  syncInlineFullscreenControl();
}

function postInlineFullscreen(next) {
  if (!INLINE || window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: "aiw:fullscreen", instanceId: INSTANCE_ID, value: !!next },
      PARENT_ORIGIN
    );
  } catch {}
}

function requestInlineFullscreenState() {
  if (!INLINE || window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: "aiw:fullscreen:get-state", instanceId: INSTANCE_ID },
      PARENT_ORIGIN
    );
  } catch {}
}

function postInlineBusyState(next) {
  if (!INLINE || window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: "aiw:busy", instanceId: INSTANCE_ID, value: !!next },
      PARENT_ORIGIN
    );
  } catch {}
}

setInlineFullscreenState(false);
setInlineBusyState(false);
fsBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (inlineBusy) return;
  const next = !inlineFullscreen;
  // Optimistic UI update so the user can always toggle back immediately.
  setInlineFullscreenState(next);
  postInlineFullscreen(next);
});

const actions = document.createElement("div");
actions.className = "aiw-actions";
actions.appendChild(resetBtn);
if (INLINE) actions.appendChild(fsBtn);
actions.appendChild(close);

// собираем хедер
header.appendChild(brand);
header.appendChild(actions);

const body = document.createElement("div");
body.className = "aiw-body";
const messagesWrap = document.createElement("div");
messagesWrap.style.display = "flex";
messagesWrap.style.flexDirection = "column";
body.appendChild(messagesWrap);
let demoMessages = [];
let demoActive = false;
let demoTypingActive = false;
const demoBadge = document.createElement("div");
demoBadge.style.cssText = `
  display:none;
  align-self:flex-start;
  margin:6px 0 10px;
  padding:4px 10px;
  border-radius:999px;
  border:1px solid ${THEME.bubbleBorder};
  background:${THEME.bubbleAI};
  color:${THEME.time};
  font-size:12px;
  letter-spacing:.01em;
`;
demoBadge.textContent = "";
body.insertBefore(demoBadge, messagesWrap);
// пустой хинт (виден только когда нет сообщений)
const emptyHint = document.createElement("div");
emptyHint.style.cssText = `
  align-self:flex-start; max-width:85%; margin:8px 0; padding:10px 12px;
  border-radius:12px; background:${THEME.bubbleAI}; color:${THEME.text}; opacity:.7; display:none;
`;

emptyHint.textContent = WELCOME;
body.appendChild(emptyHint);

function visibleMessages() {
  if (INLINE && demoActive) return demoMessages;
  return history;
}

function updateEmptyHint() {
  const shownMessages = visibleMessages();
  const hasMessages = Array.isArray(shownMessages) && shownMessages.length > 0;
  const shouldShow = showWelcomeHint && !hasMessages && !demoTypingActive;
  emptyHint.style.display = shouldShow ? "block" : "none";
}

function updateDemoBadge() {
  demoBadge.style.display = "none";
}

const footer = document.createElement("div");
footer.className = "aiw-footer";

const input = document.createElement("textarea");
input.rows = 1;
input.placeholder = LANG.startsWith("ru") ? "Спросите что-нибудь…" : "Ask anything…";
input.className = "aiw-input";
input.maxLength = MAX_LEN;

const SEND_ICON_URL = new URL("/aiw/assets/arrow-right.png", API_ORIGIN).href;

const sendBtn = document.createElement("button");
sendBtn.className = "aiw-send";
sendBtn.innerHTML = `
  <img
    src="${SEND_ICON_URL}"
    alt=""
    class="aiw-send-icon"
  />
`;

const inputWrap = document.createElement("div");
inputWrap.className = "aiw-input-wrap";
inputWrap.appendChild(input);

inputWrap.appendChild(sendBtn);
footer.appendChild(inputWrap);
  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);

const SCROLL_STICKY_THRESHOLD = 24; 
let userPinnedToBottom = true;

let ignoreScroll = false;   // чтобы scroll от наших scrollTop не сбивал флаг
let scrollRaf = null;       // чтобы не дергать scroll на каждый чанк

function isNearBottom() {
  return (body.scrollHeight - (body.scrollTop + body.clientHeight)) <= SCROLL_STICKY_THRESHOLD;
}

function scrollToBottom(force = false) {
  if (!(force || userPinnedToBottom)) return;

  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = null;

    ignoreScroll = true;
    body.scrollTop = body.scrollHeight;

    requestAnimationFrame(() => { ignoreScroll = false; });
  });
}

body.addEventListener("scroll", () => {
  if (ignoreScroll) return;
  userPinnedToBottom = isNearBottom();
}, { passive: true });


  const footerMeta = document.createElement("div");
footerMeta.className = "aiw-footer-meta";

const footerHint = document.createElement("div");
footerHint.textContent = LANG.startsWith("ru")
  ? "Enter — отправить, Shift+Enter — новая строка"
  : "Press Enter to send, Shift+Enter for new line";

const footerCounter = document.createElement("div");
footerCounter.className = "aiw-char-counter";
footerCounter.textContent = `0/${MAX_LEN}`;

footerMeta.appendChild(footerHint);
footerMeta.appendChild(footerCounter);

panel.appendChild(footerMeta);
// в inline кнопка не нужна
if (!INLINE) wrap.appendChild(btn);
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
function showTyping(role = "assistant") {
  if (panel.style.display === "none") return;
  const isUserRole = role === "user";
  typing.classList.toggle("me", isUserRole);
  typing.classList.toggle("ai", !isUserRole);
  if (!typing.isConnected) messagesWrap.appendChild(typing);
  typing.style.visibility = "visible";
   scrollToBottom();
    postHeight(); 
}
function hideTyping() {
  typing.style.visibility = "hidden";
    postHeight();
}

function getCurrentDemoTypingRole() {
  if (!INLINE || !demoActive || !idleDemoScript || !demoTypingActive) return "assistant";
  const steps = Array.isArray(idleDemoScript.messages) ? idleDemoScript.messages : [];
  const step = steps[idleDemoStepIndex];
  return step?.role === "user" ? "user" : "assistant";
}

function hasRenderableAssistantContent(text) {
  return String(text || "").replace(/\u200B/g, "").trim().length > 0;
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

function updateCounter() {
  const len = input.value.length;
  footerCounter.textContent = `${len}/${MAX_LEN}`;
}

function autoResizeInput() {
  // сбрасываем, чтобы scrollHeight считался корректно
  input.style.height = "auto";

  const cs = getComputedStyle(input);
  const maxH = parseFloat(cs.maxHeight) || 92;

  const next = Math.min(input.scrollHeight, maxH);
  input.style.height = next + "px";

  // если упёрлись — включаем скролл внутри textarea
  input.style.overflowY = (input.scrollHeight > maxH) ? "auto" : "hidden";

  postHeight();
}

function handleWidgetUserInteraction(evt, { hard = false } = {}) {
  if ((evt?.type === "scroll" || evt?.type === "wheel") && ignoreScroll) return;
  if (hard) markUserInteracted();
  cancelAllAutogreetTimers();
  if (INLINE) {
    const hasIdleDemoState =
      demoActive ||
      demoTypingActive ||
      !!idleDemoScript ||
      (Array.isArray(demoMessages) && demoMessages.length > 0);
    if (hasIdleDemoState) {
      stopIdleDemo({ clearMessages: true, restoreWelcome: true });
    }
  }
}

input.addEventListener("input", () => {
  handleWidgetUserInteraction({ type: "input" }, { hard: false });
  updateCounter();
  autoResizeInput();
});
updateCounter(); // начальное значение
setTimeout(autoResizeInput, 0);

  // ---------- Chat logic ----------
let history = readHistory();

// ===== INLINE AUTOSTART (сценарий из нескольких сообщений) =====
const INLINE_AUTO_SESSION_KEY  = `aiw:inlineAutoGreet:session:${SITE_ID}`;
const INLINE_AUTO_COOLDOWN_KEY = `aiw:inlineAutoGreet:lastTs:${SITE_ID}`;

// таймеры автогрита (float + inline)
let AUTO_TIMER_ID = null;          // одиночный таймер scheduleAutoGreet
const INLINE_AUTO_TIMEOUTS = [];   // массив таймеров для inline-скрипта

function cancelAllAutogreetTimers() {
  // общий стоп для всех приветствий
  try {
    if (AUTO_TIMER_ID !== null) {
      clearTimeout(AUTO_TIMER_ID);
      AUTO_TIMER_ID = null;
    }
    if (INLINE_AUTO_TIMEOUTS.length) {
      INLINE_AUTO_TIMEOUTS.forEach(id => clearTimeout(id));
      INLINE_AUTO_TIMEOUTS.length = 0;
    }
  } catch {}
}

let idleDemoScript = null;
let idleDemoStepIndex = 0;
let idleDemoTimerId = null;
let idleDemoListenersBound = false;

function toNonNegativeMs(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function clearIdleDemoTimer() {
  if (idleDemoTimerId === null) return;
  clearTimeout(idleDemoTimerId);
  idleDemoTimerId = null;
}

function scheduleIdleDemo(nextFn, delayMs) {
  clearIdleDemoTimer();
  idleDemoTimerId = setTimeout(() => {
    idleDemoTimerId = null;
    nextFn();
  }, toNonNegativeMs(delayMs, 0));
}

function stopIdleDemo({ clearMessages = true, restoreWelcome = false } = {}) {
  const hadDemoState =
    demoActive ||
    demoTypingActive ||
    !!idleDemoScript ||
    (Array.isArray(demoMessages) && demoMessages.length > 0);

  clearIdleDemoTimer();
  demoActive = false;
  demoTypingActive = false;
  idleDemoScript = null;
  idleDemoStepIndex = 0;
  if (clearMessages) demoMessages = [];
  hideTyping();

  if (restoreWelcome && (!history || history.length === 0)) {
    showWelcomeHint = true;
  }

  if (hadDemoState) {
    renderAll();
  }
}

function playIdleDemoStep() {
  if (!demoActive || !idleDemoScript) return;

  const scriptMessages = Array.isArray(idleDemoScript.messages) ? idleDemoScript.messages : [];
  if (!scriptMessages.length) {
    stopIdleDemo({ clearMessages: true, restoreWelcome: true });
    return;
  }

  const step = scriptMessages[idleDemoStepIndex];
  if (!step) {
    idleDemoStepIndex = 0;
    scheduleIdleDemo(playIdleDemoStep, IDLE_DEMO_LOOP_GAP_MS);
    return;
  }

  demoTypingActive = true;
  renderAll();

  scheduleIdleDemo(() => {
    if (!demoActive || !idleDemoScript) return;

    demoTypingActive = false;
    demoMessages.push({
      role: step.role,
      content: step.text,
      meta: { kind: "idleDemo" },
      ts: Date.now(),
    });
    if (demoMessages.length > 30) {
      demoMessages = demoMessages.slice(-30);
    }
    renderAll();

    scheduleIdleDemo(() => {
      if (!demoActive || !idleDemoScript) return;

      idleDemoStepIndex += 1;
      if (idleDemoStepIndex >= scriptMessages.length) {
        if (idleDemoScript.loop === false) {
          demoTypingActive = false;
          renderAll();
          return;
        }
        idleDemoStepIndex = 0;
        demoTypingActive = false;
        demoMessages = [];
        renderAll();
        scheduleIdleDemo(playIdleDemoStep, IDLE_DEMO_LOOP_GAP_MS);
        return;
      }

      playIdleDemoStep();
    }, toNonNegativeMs(step.delayAfterMs, 1200));
  }, toNonNegativeMs(step.typingMs, 800));
}

function normalizeIdleDemoScript(raw) {
  if (!raw || raw.enabled !== true) return null;

  const lang = String(raw.lang || "en").toLowerCase();
  if (!lang.startsWith("en")) return null;

  const messages = Array.isArray(raw.messages)
    ? raw.messages
      .map((step) => {
        const role = String(step?.role || "").trim();
        const text = sanitize(step?.text || "").trim();
        if (!text) return null;
        if (role !== "user" && role !== "assistant") return null;
        return {
          role,
          text,
          typingMs: toNonNegativeMs(step?.typingMs, 800),
          delayAfterMs: toNonNegativeMs(step?.delayAfterMs, 1200),
        };
      })
      .filter(Boolean)
    : [];

  if (!messages.length) return null;

  return {
    enabled: true,
    lang: "en",
    loop: raw.loop !== false,
    startDelayMs: toNonNegativeMs(raw.startDelayMs, 1200),
    messages,
  };
}

async function fetchIdleDemoScript() {
  const url = new URL("/api/widget/demo-script", API_ORIGIN);
  url.searchParams.set("siteId", SITE_ID);

  const res = await fetch(url.toString(), {
    method: "GET",
    credentials: "omit",
    mode: "cors",
  });

  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return normalizeIdleDemoScript(data);
}

async function maybeStartIdleDemo() {
  if (!INLINE) return false;
  if (alreadyInteracted()) return false;
  if (history && history.length > 0) return false;

  let script = null;
  try {
    script = await fetchIdleDemoScript();
  } catch (err) {
    log("idleDemo: fetch failed", err?.message || err);
    return false;
  }

  if (!script) return false;
  if (alreadyInteracted()) return false;
  if (history && history.length > 0) return false;

  idleDemoScript = script;
  idleDemoStepIndex = 0;
  demoMessages = [];
  demoTypingActive = false;
  demoActive = true;
  showWelcomeHint = false;
  renderAll();

  scheduleIdleDemo(playIdleDemoStep, script.startDelayMs);
  return true;
}

function bindIdleDemoStopListeners() {
  if (!INLINE || idleDemoListenersBound) return;
  idleDemoListenersBound = true;

  const onUserAction = (evt) => handleWidgetUserInteraction(evt, { hard: false });
  shadow.addEventListener("click", onUserAction, true);
  shadow.addEventListener("keydown", onUserAction, true);
  input.addEventListener("focusin", onUserAction, true);
}

function runInlineAutostart(cfg) {
  if (!INLINE) return;                               // только для inline
  if (!cfg || cfg.enabled !== true) return;

  const script = Array.isArray(cfg.script) ? cfg.script : [];
  if (!script.length) return;

  // Если уже было реальное взаимодействие в сессии — не запускаем сценарий,
  // оставляем обычный приветственный placeholder.
  if (alreadyInteracted()) {
    showWelcomeHint = true;
    updateEmptyHint();
    return;
  }

  // если уже есть история – не спамим (приветствие только когда чат "чистый")
  if (history && history.length > 0) return;

  const mode = (cfg.mode || "always").toLowerCase();
  const cooldownMinutes = Math.max(0, cfg.cooldownMinutes || 0);
  const now = Date.now();

  // если сценарий не запустится (session/cooldown), а чат пустой —
  // хотим вернуться к обычному приветственному пузырю
  function fallbackToWelcome() {
    if (!history || !history.length) {
      showWelcomeHint = true;
      updateEmptyHint();
    }
  }

  if (mode === "session") {
    if (sessionStorage.getItem(INLINE_AUTO_SESSION_KEY) === "1") {
      // автопривет уже был в этой вкладке → включаем плейсхолдер
      fallbackToWelcome();
      return;
    }
    sessionStorage.setItem(INLINE_AUTO_SESSION_KEY, "1");
  } else if (mode === "cooldown" && cooldownMinutes > 0) {
    const lastTs = +(localStorage.getItem(INLINE_AUTO_COOLDOWN_KEY) || 0);
    const diffMin = (now - lastTs) / 60000;
    if (diffMin < cooldownMinutes) {
      fallbackToWelcome();
      return;
    }
    localStorage.setItem(INLINE_AUTO_COOLDOWN_KEY, String(now));
  }
  // mode === "always" — без ограничений

  // Если дошли сюда — сценарий действительно будет выполняться → плейсхолдер убираем
  showWelcomeHint = false;
  updateEmptyHint();

  let totalDelay = 0;

  script.forEach((stepRaw, idx) => {
    const step = stepRaw || {};
    const text = sanitize(step.text || "");
    if (!text) return;

    const delay = Math.max(0, step.delayMs || 0);
    totalDelay += delay;

    const tid = setTimeout(() => {
      // если пользователь уже успел что-то отправить — не спамим
      if (alreadyInteracted()) return;

      history.push({
        role: "assistant",
        content: text,
        meta: { kind: "inlineAutostart", stepIndex: idx },
        ts: Date.now()
      });
      writeHistory(history);
      renderAll();
    }, totalDelay);

    INLINE_AUTO_TIMEOUTS.push(tid);
  });
}

function fmtTime(ts){
  try{
    return new Date(ts).toLocaleTimeString(LANG.startsWith("ru") ? "ru-RU" : "en-US", { hour:"2-digit", minute:"2-digit" });
  }catch{ return ""; }
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkify(html) {
  if (!html) return "";

  // URL: http(s)://... или www....
  const urlPattern = /\b((https?:\/\/|www\.)[^\s<]+[^\s<\.)])/gi;

  // email
  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

  // сначала URL
  let out = html.replace(urlPattern, (match, url) => {
    let href = url;
    if (!/^https?:\/\//i.test(href)) {
      href = "https://" + href;        // для www. добавим https://
    }
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });

  // потом email
  out = out.replace(emailPattern, (email) => {
    return `<a href="mailto:${email}">${email}</a>`;
  });

  return out;
}

function renderMarkdownBasic(text) {
  const cleaned = String(text || "").replace(/\s+$/g, "");
  let html = escapeHtml(cleaned);

  // Заголовки markdown: ###, ##, #
  html = html.replace(/^###\s+(.+)$/gm, "<div class=\"aiw-h3\">$1</div>");
  html = html.replace(/^##\s+(.+)$/gm, "<div class=\"aiw-h2\">$1</div>");
  html = html.replace(/^#\s+(.+)$/gm, "<div class=\"aiw-h1\">$1</div>");

  // **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // `code`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // переносы строк
  html = html.replace(/\n/g, "<br>");

  // авто-линковка URL и email
  html = linkify(html);

  return html;
}

// создаём DOM для одного сообщения и сразу добавляем его в messagesWrap
function appendMessageDOM(m) {
  const isUser = m.role === "user";

  const row = document.createElement("div");
  row.className = "aiw-row " + (isUser ? "me" : "ai");

  // аватар
  const ava = document.createElement("div");
  ava.className = "aiw-ava " + (isUser ? "me" : "ai");

  if (!isUser && LOGO) {
    // один логотип — одна загрузка, браузер потом закэширует
    const img = document.createElement("img");
    img.src = LOGO;
    img.alt = "logo";
    ava.appendChild(img);
  } else if (isUser) {
    ava.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="8" r="4" fill="currentColor"></circle>
        <path d="M4 20c1.5-3 3.5-5 8-5s6.5 2 8 5" fill="currentColor"></path>
      </svg>
    `;
  }

  if (!isUser) row.appendChild(ava);

  // пузырь + время
  const bubbleWrap = document.createElement("div");
  bubbleWrap.className = "aiw-bubble-wrap";

  const bubble = document.createElement("div");
  bubble.className = "aiw-bubble";
bubble.innerHTML = renderMarkdownBasic(m.content);
  bubbleWrap.appendChild(bubble);

  const time = document.createElement("div");
  time.className = "aiw-time";
  time.textContent = fmtTime(m.ts || Date.now());
  bubbleWrap.appendChild(time);

  row.appendChild(bubbleWrap);

  if (isUser) row.appendChild(ava);

  messagesWrap.appendChild(row);

  return { row, bubble, time };
}

// полный рендер — используем только когда реально нужно всё перерисовать
function renderAll() {
  while (messagesWrap.firstChild) messagesWrap.removeChild(messagesWrap.firstChild);
  const messagesToRender = visibleMessages();
  for (const m of messagesToRender) {
    appendMessageDOM(m);
  }
  updateDemoBadge();
  if (INLINE && demoActive && demoTypingActive) showTyping(getCurrentDemoTypingRole());
  else hideTyping();
  updateEmptyHint();
  // при полном перерендере: скроллим только если юзер был pinned
scrollToBottom(false);
  postHeight();
}


function postHeight() {
  try {
    if (FIT_MODE === "container") return; // родитель сам управляет высотой
    if (window.parent && window.parent !== window) {
      const h = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: "aiw:resize", height: h }, "*");
    }
  } catch {}
}

  renderAll();
  scrollToBottom(true); 

  try {
  const ro = new ResizeObserver(() => postHeight());
  ro.observe(document.documentElement);
} catch {}

let open = INLINE ? true : false;

if (!INLINE) {
  btn.addEventListener("click", () => {
    open = !open;
    panel.style.display = open ? "flex" : "none";
    if (open) {
      if (RESET_HISTORY_ON_OPEN) {
        try { localStorage.removeItem(storeKey); } catch {}
        try { sessionStorage.removeItem(USER_INTERACTED_KEY); } catch {}
        history = [];
        writeHistory(history);
        renderAll();
      }
      setTimeout(() => input.focus(), 0);
    }
  });
    close.addEventListener("click", () => { open = false; panel.style.display = "none"; });
} else {
  // в inline закрывашку можно спрятать или оставить — на твой вкус
  close.style.display = "none";

  if (window.parent && window.parent !== window) {
    window.addEventListener("message", (e) => {
      if (PARENT_ORIGIN !== "*" && e.origin !== PARENT_ORIGIN) return;
      const d = e.data || {};
      if (!d || typeof d !== "object") return;
      if (d.type !== "aiw:fullscreen-state") return;
      if (d.instanceId && INSTANCE_ID && d.instanceId !== INSTANCE_ID) return;
      setInlineFullscreenState(!!d.value);
    }, { passive: true });

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!inlineFullscreen) return;
      if (inlineBusy) return;
      e.preventDefault();
      postInlineFullscreen(false);
    });

    // If the iframe was reparented/reloaded, request the current state from parent.
    requestInlineFullscreenState();
    setTimeout(requestInlineFullscreenState, 120);
    setTimeout(requestInlineFullscreenState, 400);
  }
}

resetBtn.addEventListener("click", (e) => {
  e.preventDefault();
  stopIdleDemo({ clearMessages: true, restoreWelcome: false });

  try {
    if (STORAGE) STORAGE.removeItem(storeKey);
  } catch {}
  try { sessionStorage.removeItem(USER_INTERACTED_KEY); } catch {}

  // после ресета хотим видеть приветственный пузырь
  showWelcomeHint = true;

  history = [];
  writeHistory(history);
  SESSION_ID = newSessionId();
  input.value = "";
  updateCounter();
  autoResizeInput();
  renderAll();
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
      parts.forEach(block =>
        block.split(/\r?\n/).forEach(ln => {
          if (ln.startsWith("data:")) onData(ln.slice(5));   
        })
      );
    }
    if (buffer)
      buffer.split(/\r?\n/).forEach(ln => {
        if (ln.startsWith("data:")) onData(ln.slice(5));     
      });
  })();
}

  let inflight = null;

function panelIsHidden() {
  if (INLINE) return false;
  try { return getComputedStyle(panel).display === "none"; } catch { return false; }
}
function openPanelIfHidden() {
  if (INLINE) return; // в inline всегда открыт
  if (panelIsHidden()) panel.style.display = "flex";
}

function showLocalGreeting() {
  if (!AUTO_MSG) { log("showLocalGreeting: no AUTO_MSG"); return; }
  log("showLocalGreeting: start");
  openPanelIfHidden();
  showTyping();
  setTimeout(() => {
    hideTyping();
    dedupeAutogreetAtTail();
    history.push({ role: "assistant", content: AUTO_MSG, meta: { kind: "autogreet" }, ts: Date.now()});
    writeHistory(history);
    renderAll();
    log("showLocalGreeting: message pushed");
    markAutoGreetUsed();
  }, 250);
}

  async function fetchAIGreeting() {
    const wasPinnedAtStart = userPinnedToBottom;
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
            stream: STREAM,  
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
        renderAll();
         log("fetchAIGreeting(JSON): message pushed, length=", (reply||"").length);
    markAutoGreetUsed();
    return;
      }

// SSE
const msg = { role: "assistant", content: "", ts: Date.now() };
history.push(msg);
writeHistory(history);

// пузырь создаём только, когда придёт первый chunk
let rendered = false;
let bubble;

const reader = res.body.getReader();
await pumpSSE(reader, (data) => {
  if (data.trim() === "[DONE]") return;
    const chunk = data.replace(/\\n/g, "\n");
  msg.content += chunk;

  if (!rendered && hasRenderableAssistantContent(msg.content)) {
    // первый кусок — убираем точки и рисуем пузырь
    hideTyping();
    const dom = appendMessageDOM(msg);
    bubble = dom.bubble;
    updateEmptyHint();
    rendered = true;
  }

  if (bubble) {
      bubble.innerHTML = renderMarkdownBasic(msg.content);
    if (wasPinnedAtStart) scrollToBottom();
    postHeight();
  }
});

if (!rendered) {
  msg.content = hasRenderableAssistantContent(msg.content)
    ? msg.content
    : (LANG.startsWith("ru") ? "â€¦" : "â€¦");
  hideTyping();
  const dom = appendMessageDOM(msg);
  bubble = dom.bubble;
  updateEmptyHint();
  rendered = true;
  if (wasPinnedAtStart) scrollToBottom();
  postHeight();
}

writeHistory(history);

log("fetchAIGreeting(SSE): stream ended, len=", (msg.content || "").length);
markAutoGreetUsed();

    } catch (e) {
      history.push({ role: "assistant", content: LANG.startsWith("ru") ? "⚠️ Ошибка соединения" : "⚠️ Connection error" });
      writeHistory(history);
      renderAll();
    } finally {
      hideTyping();
    }
  }

function scheduleAutoGreet() {
  if (!AUTOSTART) return;
  if (!shouldAutoGreetNow()) return;

  log("scheduleAutoGreet: scheduled in", AUTO_DELAY, "ms");

  AUTO_TIMER_ID = setTimeout(() => {
    AUTO_TIMER_ID = null; // таймер отработал

    // если пользователь уже что-то отправил — не показываем приветствие
    if (alreadyInteracted()) {
      log("scheduleAutoGreet: cancelled because user already interacted");
      return;
    }

    log("scheduleAutoGreet: timer fired");
    if (!shouldAutoGreetNow()) {
      log("scheduleAutoGreet: recheck blocked");
      return;
    }

    if (AUTO_MODE === "ai") {
      log("autogreet -> AI mode");
      if (RESET_HISTORY_ON_OPEN) {
        try { localStorage.removeItem(storeKey); } catch {}
        history = []; writeHistory(history); renderAll();
      }
      fetchAIGreeting();
    } else {
      log("autogreet -> LOCAL mode");
      if (RESET_HISTORY_ON_OPEN) {
        try { localStorage.removeItem(storeKey); } catch {}
        history = []; writeHistory(history); renderAll();
      }
      showLocalGreeting();
    }
  }, AUTO_DELAY);
}

  async function doSend() {
    const text = sanitize(input.value).trim();
    if (!text || inflight) return;

    handleWidgetUserInteraction({ type: "send" }, { hard: true });


    history.push({ role: "user", content: text, ts: Date.now() });
    writeHistory(history);
    renderAll();
    input.value = "";
    updateCounter(); 
    autoResizeInput();

    const safeMsgs = history.map(({ role, content }) => ({ role, content })).slice(-30);
    const controller = new AbortController();
    inflight = controller;
    setInlineBusyState(true);
    postInlineBusyState(true);
const wasPinnedAtStart = userPinnedToBottom;
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
      stream: STREAM, 
    meta // <- отправляем всю мету
  }),
  signal: controller.signal,
  keepalive: true,
  mode: "cors",
});

      const ct = (res.headers.get("content-type") || "").toLowerCase();

      if (!ct.includes("text/event-stream")) {
const raw = await res.text();
 let reply = "";
 let citations = [];
 try { 
   const obj = JSON.parse(raw) || {};
   reply = obj.reply || ""; 
   citations = Array.isArray(obj.citations) ? obj.citations : [];
 } catch { reply = raw || ""; }
history.push({
  role: "assistant",
  content: reply || (LANG.startsWith("ru") ? "…" : "…"),
  meta: { citations }, // при желании сохраняем, но не рендерим
  ts: Date.now()
});

        writeHistory(history);
        renderAll();
        return;
      }

      // SSE mode
const msg = { role: "assistant", content: "", ts: Date.now() };
history.push(msg);
writeHistory(history);

// пузырь создаём только при первом чанке
let rendered = false;
let bubble;

const reader = res.body.getReader();
await pumpSSE(reader, (data) => {
  if (data.trim() === "[DONE]") return;
  const chunk = data.replace(/\\n/g, "\n");
  msg.content += chunk;

  if (!rendered && hasRenderableAssistantContent(msg.content)) {
    // первый кусок — скрываем индикатор набора и добавляем пузырь
    hideTyping();
    const dom = appendMessageDOM(msg);
    bubble = dom.bubble;
    updateEmptyHint();
    rendered = true;
  }

if (bubble) {
  bubble.innerHTML = renderMarkdownBasic(msg.content);
   if (wasPinnedAtStart) scrollToBottom();
  postHeight();
}
});

if (!rendered) {
  msg.content = hasRenderableAssistantContent(msg.content)
    ? msg.content
    : (LANG.startsWith("ru") ? "â€¦" : "â€¦");
  hideTyping();
  const dom = appendMessageDOM(msg);
  bubble = dom.bubble;
  updateEmptyHint();
  rendered = true;
  if (wasPinnedAtStart) scrollToBottom();
  postHeight();
}

writeHistory(history);

    } catch (err) {
      history.push({ role: "assistant", content: LANG.startsWith("ru") ? "⚠️ Ошибка соединения" : "⚠️ Connection error" });
      writeHistory(history); renderAll();
    } finally {
      hideTyping();
      inflight = null;
      setInlineBusyState(false);
      postInlineBusyState(false);
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

function initClassicAutostart() {
  scheduleAutoGreet();

  log("init", {
    sessionFlag: sessionStorage.getItem(AUTO_KEY_SESSION),
    userInteracted: sessionStorage.getItem(USER_INTERACTED_KEY),
    lastTs: +localStorage.getItem(AUTO_KEY_LAST_TS) || 0,
    historyLen: (Array.isArray(history) ? history.length : -1)
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleAutoGreet();
      log("visible: recheck", {
        sessionFlag: sessionStorage.getItem(AUTO_KEY_SESSION),
        userInteracted: sessionStorage.getItem(USER_INTERACTED_KEY),
        lastTs: +localStorage.getItem(AUTO_KEY_LAST_TS) || 0,
        historyLen: (Array.isArray(history) ? history.length : -1)
      });
    }
  });
}

async function initGreetingFlows() {
  if (INLINE) {
    bindIdleDemoStopListeners();
    const demoStarted = await maybeStartIdleDemo();
    if (demoStarted) {
      log("init: idle demo started");
      return;
    }

    if (INLINE_AUTOSTART_CFG && INLINE_AUTOSTART_CFG.enabled) {
      log("init: inlineAutostart enabled");
      runInlineAutostart(INLINE_AUTOSTART_CFG);
      return;
    }
  }

  initClassicAutostart();
}

initGreetingFlows().catch((e) => {
  console.debug("[AIW][autogreet] trigger error:", e);
});
})();

