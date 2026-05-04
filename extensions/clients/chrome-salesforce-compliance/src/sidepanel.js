// ─────────────────────────────────────────────────────────────────────────────
// sidepanel.js — Side Panel overrides
//
// content-script.js is loaded first (via <script> in sidepanel.html).
// It defines all render/UI functions but does NOT call bootstrap() in side
// panel mode (guarded by _IS_SIDE_PANEL flag).
//
// This file overrides the functions that behave differently in a side panel:
//   • Panel is a fixed Chrome sidebar — no drag, resize, or floating overlay
//   • Auth form fills the auth view, not a floating card
//   • Case data arrives via chrome.storage (relayed by content script)
//   • Navigation detection is handled by the content script, not this page
// ─────────────────────────────────────────────────────────────────────────────

// ── View helpers ─────────────────────────────────────────────────────────────

function _spHideAll() {
  document.getElementById("sp-loading").style.display = "none";
  document.getElementById("sp-auth-view").style.display = "none";
  document.getElementById("sp-no-case-view").style.display = "none";
  document.getElementById("sp-panel-wrapper").style.display = "none";
}

function showNoCaseView() {
  _spHideAll();
  document.getElementById("sp-no-case-view").style.display = "flex";
}

function showMainPanel() {
  _spHideAll();
  document.getElementById("sp-panel-wrapper").style.display = "flex";
}

// ── Override: getOrCreateCaseToast ───────────────────────────────────────────
// Creates the panel DOM inside #sp-panel-wrapper (no drag/resize/close btn).

getOrCreateCaseToast = function () {
  let toast = document.getElementById("sf-compliance-case-toast");
  if (toast) {
    showMainPanel();
    return toast;
  }

  toast = document.createElement("div");
  toast.id = "sf-compliance-case-toast";
  Object.assign(toast.style, {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    background: "#ffffff",
    color: "#111111",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    fontSize: "13px",
    lineHeight: "1.45",
    overflow: "hidden",
  });

  // Header
  const header = document.createElement("div");
  header.id = "sf-compliance-case-toast-header";
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px 10px 14px",
    flexShrink: "0",
  });

  const title = document.createElement("div");
  title.textContent = "Compliance Assistant";
  title.style.fontWeight = "700";
  title.style.fontSize = "13px";

  const searchWrapper = document.createElement("div");
  Object.assign(searchWrapper.style, {
    flex: "1",
    margin: "0 10px",
    position: "relative",
  });

  const searchInput = document.createElement("input");
  searchInput.id = "sf-compliance-global-search";
  searchInput.type = "text";
  searchInput.placeholder = "Search suppliers, materials, outreach...";
  searchInput.value = currentCaseAnalysisState.globalSearchQuery || "";
  Object.assign(searchInput.style, {
    width: "100%",
    padding: "5px 24px 5px 10px",
    fontSize: "12px",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    outline: "none",
    background: "#f9fafb",
    color: "#111111",
    boxSizing: "border-box",
  });

  const clearBtn = document.createElement("button");
  clearBtn.textContent = "×";
  Object.assign(clearBtn.style, {
    position: "absolute",
    right: "6px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
    lineHeight: "1",
    color: "#9ca3af",
    padding: "0 2px",
    display: currentCaseAnalysisState.globalSearchQuery ? "" : "none",
  });

  let _spSearchTimer = null;
  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearTimeout(_spSearchTimer);
    currentCaseAnalysisState.globalSearchQuery = "";
    currentCaseAnalysisState.globalSearchMaterialsQuery = "";
    currentCaseAnalysisState.globalSearchMaterialsResults = null;
    currentCaseAnalysisState.globalSearchMaterialsLoading = false;
    clearBtn.style.display = "none";
    rerenderCurrentCaseToast();
  });

  searchInput.addEventListener("input", (e) => {
    clearTimeout(_spSearchTimer);
    clearBtn.style.display = e.target.value ? "" : "none";
    _spSearchTimer = setTimeout(() => {
      const val = e.target.value.trim();
      currentCaseAnalysisState.globalSearchQuery = val;
      if (!val) {
        currentCaseAnalysisState.globalSearchMaterialsQuery = "";
        currentCaseAnalysisState.globalSearchMaterialsResults = null;
        currentCaseAnalysisState.globalSearchMaterialsLoading = false;
      }
      rerenderCurrentCaseToast();
      if (val) runGlobalMaterialsSearch(val);
    }, 300);
  });

  searchWrapper.appendChild(searchInput);
  searchWrapper.appendChild(clearBtn);
  header.appendChild(title);
  header.appendChild(searchWrapper);

  // Tab bar
  const tabs = document.createElement("div");
  tabs.id = "sf-compliance-case-toast-tabs";
  Object.assign(tabs.style, {
    display: "flex",
    gap: "8px",
    padding: "0 14px 10px 14px",
    borderBottom: "1px solid #e5e7eb",
    flexShrink: "0",
  });

  const tabDefs = [
    { id: "sf-compliance-tab-overview", label: "Overview" },
    { id: "sf-compliance-tab-materials", label: "Materials" },
    { id: "sf-compliance-tab-suppliers", label: "Suppliers" },
    { id: "sf-compliance-tab-lookup", label: "Lookup" },
  ];

  tabDefs.forEach(({ id, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = id;
    btn.textContent = label;
    Object.assign(btn.style, {
      border: "1px solid #d0d7de",
      background: "#ffffff",
      color: "#111111",
      borderRadius: "8px",
      padding: "6px 10px",
      cursor: "pointer",
      fontWeight: "600",
      fontSize: "12px",
    });
    tabs.appendChild(btn);
  });

  // Body
  const body = document.createElement("div");
  body.id = "sf-compliance-case-toast-body";
  Object.assign(body.style, {
    padding: "14px 16px 18px 16px",
    overflowY: "auto",
    flex: "1",
    background: "#ffffff",
    minHeight: "0",
  });

  toast.appendChild(header);
  toast.appendChild(tabs);
  toast.appendChild(body);

  document.getElementById("sp-panel-wrapper").appendChild(toast);
  showMainPanel();
  return toast;
};

// ── Override: removeCaseToast — no-op in side panel ──────────────────────────
removeCaseToast = function () {};

// ── Override: showAuthCard ────────────────────────────────────────────────────
showAuthCard = function (message = "Sign in to use Compliance Assistant.") {
  _spHideAll();
  document.getElementById("sp-auth-view").style.display = "flex";
  getOrCreateAuthCard();
  syncAuthCardUi();
  setAuthStatus(message);
};

// ── Override: hideAuthCard ────────────────────────────────────────────────────
hideAuthCard = function () {
  document.getElementById("sp-auth-view").style.display = "none";
};

// ── Override: getOrCreateAuthCard ────────────────────────────────────────────
// Auth form goes into #sp-auth-view, not document.body. No close button,
// no fixed positioning — it fills the auth view like a normal form.

getOrCreateAuthCard = function () {
  let card = document.getElementById("sf-compliance-auth-card");
  if (card) return card;

  card = document.createElement("div");
  card.id = "sf-compliance-auth-card";
  Object.assign(card.style, {
    width: "100%",
    maxWidth: "340px",
    background: "#ffffff",
    color: "#111111",
    border: "1px solid #d0d7de",
    borderRadius: "14px",
    padding: "18px",
    fontSize: "13px",
    lineHeight: "1.45",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    marginTop: "8px",
  });

  card.innerHTML = `
    <div style="font-size:15px; font-weight:700; margin-bottom:14px; text-align:center;">
      Compliance Assistant
    </div>

    <div
      id="sf-compliance-auth-connected-box"
      style="display:none; margin-bottom:12px; padding:10px 12px; background:#f6f8fa; border:1px solid #d8dee4; border-radius:10px;"
    >
      <div style="font-weight:600; margin-bottom:4px;">Signed in</div>
      <div id="sf-compliance-auth-user-line" style="word-break:break-word; color:#444;"></div>
      <div id="sf-compliance-auth-connection-line" style="margin-top:4px; color:#0a7b34; font-weight:600;">Connected</div>
    </div>

    <div id="sf-compliance-auth-form">
      <div style="display:flex; gap:0; margin-bottom:12px; border:1px solid #d0d7de; border-radius:9px; overflow:hidden;">
        <button
          id="sf-compliance-tab-login"
          type="button"
          style="flex:1; padding:7px; border:none; background:#0176d3; color:#fff; font-size:12px; font-weight:700; cursor:pointer;"
        >Sign in</button>
        <button
          id="sf-compliance-tab-register"
          type="button"
          style="flex:1; padding:7px; border:none; background:#ffffff; color:#444; font-size:12px; font-weight:600; cursor:pointer;"
        >Register</button>
      </div>

      <div id="sf-compliance-name-row" style="display:none; margin-bottom:8px;">
        <label style="display:block; font-weight:600; margin-bottom:4px; font-size:12px;">Name</label>
        <input
          id="sf-compliance-auth-name"
          type="text"
          autocomplete="name"
          style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c9d1d9; border-radius:8px; font-size:13px;"
          placeholder="Your name"
        />
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:block; font-weight:600; margin-bottom:4px; font-size:12px;">Email</label>
        <input
          id="sf-compliance-auth-email"
          type="email"
          autocomplete="username"
          style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c9d1d9; border-radius:8px; font-size:13px;"
          placeholder="you@example.com"
        />
      </div>

      <div style="margin-bottom:12px;">
        <label style="display:block; font-weight:600; margin-bottom:4px; font-size:12px;">Password</label>
        <input
          id="sf-compliance-auth-password"
          type="password"
          autocomplete="current-password"
          style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c9d1d9; border-radius:8px; font-size:13px;"
          placeholder="Password"
        />
      </div>

      <div style="display:flex; gap:8px;">
        <button
          id="sf-compliance-auth-submit"
          type="button"
          style="flex:1; padding:9px 12px; border:none; border-radius:9px; background:#0176d3; color:#ffffff; font-weight:700; cursor:pointer; font-size:13px;"
        >
          Sign in
        </button>
        <button
          id="sf-compliance-auth-signout"
          type="button"
          style="padding:9px 12px; border:1px solid #d0d7de; border-radius:9px; background:#ffffff; color:#111111; font-weight:600; cursor:pointer; display:none; font-size:13px;"
        >
          Sign out
        </button>
      </div>
    </div>

    <div
      id="sf-compliance-auth-status"
      style="margin-top:10px; min-height:18px; color:#5b5f66; font-size:12px; text-align:center;"
    ></div>
  `;

  document.getElementById("sp-auth-view").appendChild(card);

  // Wire up events (mirrors the original getOrCreateAuthCard logic)
  const nameInput = card.querySelector("#sf-compliance-auth-name");
  const nameRow = card.querySelector("#sf-compliance-name-row");
  const emailInput = card.querySelector("#sf-compliance-auth-email");
  const passwordInput = card.querySelector("#sf-compliance-auth-password");
  const submitBtn = card.querySelector("#sf-compliance-auth-submit");
  const signOutBtn = card.querySelector("#sf-compliance-auth-signout");
  const tabLogin = card.querySelector("#sf-compliance-tab-login");
  const tabRegister = card.querySelector("#sf-compliance-tab-register");

  card._authMode = "login";

  function setAuthMode(mode) {
    card._authMode = mode;
    const isRegister = mode === "register";
    nameRow.style.display = isRegister ? "block" : "none";
    submitBtn.textContent = isRegister ? "Create account" : "Sign in";
    tabLogin.style.background = isRegister ? "#ffffff" : "#0176d3";
    tabLogin.style.color = isRegister ? "#444" : "#fff";
    tabRegister.style.background = isRegister ? "#0176d3" : "#ffffff";
    tabRegister.style.color = isRegister ? "#fff" : "#444";
    setAuthStatus("");
  }

  tabLogin.addEventListener("click", () => setAuthMode("login"));
  tabRegister.addEventListener("click", () => setAuthMode("register"));

  const handleEnter = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAuthSubmit(); }
  };
  nameInput.addEventListener("keydown", handleEnter);
  emailInput.addEventListener("keydown", handleEnter);
  passwordInput.addEventListener("keydown", handleEnter);
  submitBtn.addEventListener("click", handleAuthSubmit);
  signOutBtn.addEventListener("click", handleLogout);

  return card;
};

// ── Override: syncAuthCardUi ──────────────────────────────────────────────────
// Mirrors the original but omits the "Open Panel" button (not needed in panel).

syncAuthCardUi = function () {
  const card = getOrCreateAuthCard();
  const connectedBox = card.querySelector("#sf-compliance-auth-connected-box");
  const userLine = card.querySelector("#sf-compliance-auth-user-line");
  const connectionLine = card.querySelector("#sf-compliance-auth-connection-line");
  const emailInput = card.querySelector("#sf-compliance-auth-email");
  const passwordInput = card.querySelector("#sf-compliance-auth-password");
  const submitBtn = card.querySelector("#sf-compliance-auth-submit");
  const signOutBtn = card.querySelector("#sf-compliance-auth-signout");
  const tabRow = card.querySelector("#sf-compliance-tab-login")?.parentElement;
  const nameRow = card.querySelector("#sf-compliance-name-row");

  if (emailInput && authState.lastEmail && !emailInput.value) {
    emailInput.value = authState.lastEmail;
  }

  if (authState.authenticated) {
    connectedBox.style.display = "block";
    userLine.textContent = authState.user?.email || authState.user?.name || "Authenticated user";
    connectionLine.textContent = "Connected";
    if (tabRow) tabRow.style.display = "none";
    if (nameRow) nameRow.style.display = "none";
    if (passwordInput) passwordInput.value = "";
    if (submitBtn) submitBtn.style.display = "none";
    if (signOutBtn) {
      signOutBtn.style.display = "inline-block";
      signOutBtn.textContent = "Sign out";
      signOutBtn.style.flex = "1";
    }
  } else {
    connectedBox.style.display = "none";
    userLine.textContent = "";
    connectionLine.textContent = "";
    if (tabRow) tabRow.style.display = "flex";
    if (submitBtn) {
      submitBtn.style.display = "inline-block";
      submitBtn.style.flex = "1";
    }
    if (signOutBtn) signOutBtn.style.display = "none";
  }
};

// ── Override: scheduleChecks ──────────────────────────────────────────────────
// Called after successful login. In side panel, check storage for active case.

scheduleChecks = async function () {
  const stored = await chrome.storage.local.get(["activeCasePayload"]);
  if (stored.activeCasePayload) {
    lastCompletedRecordId = null;
    processCasePayload(stored.activeCasePayload);
  } else {
    showNoCaseView();
  }
};

// ── processCasePayload ────────────────────────────────────────────────────────
// Replaces trySendCaseContext for the side panel. Receives a payload object
// (already read from Salesforce DOM by the content script) and runs analysis.

async function processCasePayload(payload) {
  if (!authState.authenticated) return;

  const recordId = payload?.recordId;
  if (!recordId) {
    showNoCaseView();
    return;
  }

  if (lastCompletedRecordId === recordId) {
    showMainPanel();
    return;
  }

  const requestToken = ++activeCaseRequestToken;
  showMainPanel();
  renderCaseToastInitial(payload);

  const response = await sendMessageAsync({ type: "SF_CASE_CONTEXT", payload });

  if (requestToken !== activeCaseRequestToken) return;

  if (response?.authRequired) {
    authState = {
      authenticated: false,
      user: null,
      lastEmail: authState.lastEmail || authState.user?.email || "",
    };
    syncAuthCardUi();
    lastCompletedRecordId = null;
    renderCaseToastAuthRequired(payload, response?.error || "Session expired");
    showAuthCard("Session expired. Sign in again.");
    setAuthStatus("Session expired.", "#b42318");
    return;
  }

  if (response?.ok) {
    currentCaseAnalysisState.payload = payload;
    currentCaseAnalysisState.cachedAt = response.fromCache ? (response.cachedAt || null) : null;
    renderCaseToastAnalysis(payload, response);
    lastCompletedRecordId = recordId;
    return;
  }

  lastCompletedRecordId = null;

  const toast = getOrCreateCaseToast();
  const body = toast.querySelector("#sf-compliance-case-toast-body");
  if (body) {
    clearToastBody(body);
    body.appendChild(createInfoRow("Case Number", payload.caseId));
    body.appendChild(createInfoRow("Subject", payload.subject));

    const errorType = response?.errorType;
    const statusMap = {
      timeout: "Request timed out",
      network: "Network error",
      server: "Server error",
      forbidden: "Access denied",
    };
    body.appendChild(createInfoRow("Status", statusMap[errorType] || "Analysis failed"));
    body.appendChild(createInfoRow("Detail", response?.error || "Unknown error"));
  }
}

// ── Storage listener: receive case updates from content script ────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !("activeCasePayload" in changes)) return;

  const newPayload = changes.activeCasePayload.newValue;
  if (newPayload) {
    lastCompletedRecordId = null;
    activeCaseRequestToken += 1;
    if (authState.authenticated) {
      processCasePayload(newPayload);
    }
  } else {
    showNoCaseView();
  }
});

// ── Override: bootstrap ───────────────────────────────────────────────────────

bootstrap = async function () {
  const isAuthenticated = await syncAuthState();

  if (!isAuthenticated) {
    showAuthCard("Sign in to use Compliance Assistant.");
    return;
  }

  const stored = await chrome.storage.local.get(["activeCasePayload"]);
  if (stored.activeCasePayload) {
    await processCasePayload(stored.activeCasePayload);
  } else {
    showNoCaseView();
  }
};

bootstrap();
