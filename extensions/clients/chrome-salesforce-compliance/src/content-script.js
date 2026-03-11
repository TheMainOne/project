console.log("CONTENT SCRIPT LOADED:", window.location.href);

let lastSeenUrl = window.location.href;
let lastSentCaseUrl = null;
let authState = {
  authenticated: false,
  user: null,
  lastEmail: "",
};

function normalizeText(value, maxLength = 2000) {
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  return cleaned.slice(0, maxLength);
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isVisible(el) {
  if (!el) return false;

  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findFirstVisible(selectors) {
  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    const visibleNode = nodes.find(isVisible);
    if (visibleNode) return visibleNode;
  }
  return null;
}

function cleanCaseNumber(raw) {
  if (!raw) return null;

  const text = String(raw).trim();
  const match = text.match(/(\d{6,8})/);

  return match ? match[1] : text;
}

function cleanSubject(raw) {
  if (!raw) return null;

  return String(raw)
    .trim()
    .replace(/^Subject\s*/i, "")
    .trim();
}

function sendMessageAsync(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }

      resolve(response || {});
    });
  });
}

function getRecordIdFromUrl() {
  const match = window.location.pathname.match(/\/lightning\/r\/Case\/([^/]+)\/view/);
  return match ? match[1] : null;
}

function isCaseRecordPage() {
  return !!getRecordIdFromUrl();
}

function getOrCreateCaseToast() {
  let toast = document.getElementById("sf-compliance-case-toast");

  if (toast) return toast;

  toast = document.createElement("div");
  toast.id = "sf-compliance-case-toast";

  Object.assign(toast.style, {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: "999999",
    background: "#ffffff",
    color: "#111111",
    border: "1px solid #d0d7de",
    borderRadius: "12px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
    padding: "12px 14px",
    minWidth: "320px",
    maxWidth: "520px",
    fontSize: "13px",
    lineHeight: "1.45",
  });

  const header = document.createElement("div");
  header.id = "sf-compliance-case-toast-header";

  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  });

  const title = document.createElement("div");
  title.textContent = "Compliance Assistant";
  title.style.fontWeight = "700";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "×";

  Object.assign(closeBtn.style, {
    background: "none",
    border: "none",
    fontSize: "16px",
    cursor: "pointer",
    lineHeight: "1",
  });

  closeBtn.addEventListener("click", () => toast.remove());

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.id = "sf-compliance-case-toast-body";

  toast.appendChild(header);
  toast.appendChild(body);

  document.body.appendChild(toast);

  return toast;
}

function createInfoRow(label, value) {
  const row = document.createElement("div");
  row.style.marginBottom = "6px";

  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;

  const text = document.createElement("span");
  text.textContent = value || "N/A";

  row.appendChild(strong);
  row.appendChild(text);

  return row;
}

function createListRow(label, values = []) {
  const row = document.createElement("div");
  row.style.marginBottom = "6px";

  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;

  const text = document.createElement("span");
  text.textContent = values.length ? values.join(", ") : "N/A";

  row.appendChild(strong);
  row.appendChild(text);

  return row;
}

function clearToastBody(body) {
  while (body.firstChild) {
    body.removeChild(body.firstChild);
  }
}

function renderCaseToastInitial(payload) {
  const toast = getOrCreateCaseToast();
  const body = toast.querySelector("#sf-compliance-case-toast-body");
  if (!body) return;

  clearToastBody(body);

  body.appendChild(createInfoRow("Case Number", payload.caseId));
  body.appendChild(createInfoRow("Subject", payload.subject));
  body.appendChild(createInfoRow("Status", "Analyzing..."));
}

function renderCaseToastAnalysis(payload, response) {
  const toast = getOrCreateCaseToast();
  const body = toast.querySelector("#sf-compliance-case-toast-body");
  if (!body) return;

  clearToastBody(body);

  body.appendChild(createInfoRow("Case Number", payload.caseId));
  body.appendChild(createInfoRow("Subject", payload.subject));

  const analyzeJson =
    response?.analyzeResult?.json ||
    safeParseJson(response?.analyzeResult?.body || "");

  const analysis = analyzeJson?.result?.analysis || null;

  if (!response?.analyzeResult?.ok) {
    body.appendChild(createInfoRow("Status", "Analysis failed"));
    body.appendChild(
      createInfoRow(
        "Error",
        analyzeJson?.error ||
          response?.analyzeResult?.error ||
          response?.analyzeResult?.status ||
          "Unknown error"
      )
    );
    return;
  }

  if (!analysis) {
    body.appendChild(createInfoRow("Status", "Analysis unavailable"));
    return;
  }

  body.appendChild(createInfoRow("Status", "Analysis complete"));

  const requesterValue =
    analysis?.requester?.name ||
    analysis?.requester?.company ||
    analysis?.requester?.email ||
    "N/A";

  body.appendChild(createInfoRow("Requester", requesterValue));
  body.appendChild(createListRow("Request Types", analysis?.request_types || []));

  const materials = Array.isArray(analysis?.materials)
    ? analysis.materials
        .map((item) => {
          const part = item?.part_number || null;
          const desc = item?.description || null;

          if (part && desc) return `${part} (${desc})`;
          if (part) return part;
          if (desc) return desc;
          return null;
        })
        .filter(Boolean)
    : [];

  body.appendChild(createListRow("Materials", materials));

  const deadlineValue = analysis?.deadline?.mentioned
    ? analysis?.deadline?.raw_text || analysis?.deadline?.date_iso || "Yes"
    : "No";

  body.appendChild(createInfoRow("Deadline", deadlineValue));
  body.appendChild(
    createInfoRow(
      "Supplier Follow-up",
      analysis?.supplier_follow_up_needed ? "Yes" : "No"
    )
  );
  body.appendChild(createInfoRow("Summary", analysis?.summary || "N/A"));

  if (Array.isArray(analysis?.notes) && analysis.notes.length > 0) {
    const notesBlock = document.createElement("div");
    notesBlock.style.marginTop = "8px";

    const notesLabel = document.createElement("strong");
    notesLabel.textContent = "Notes:";

    notesBlock.appendChild(notesLabel);

    analysis.notes.forEach((note) => {
      const line = document.createElement("div");
      line.textContent = `• ${note}`;
      line.style.marginTop = "4px";
      line.style.whiteSpace = "normal";
      notesBlock.appendChild(line);
    });

    body.appendChild(notesBlock);
  }
}

function renderCaseToastAuthRequired(payload, message = "Sign in required") {
  const toast = getOrCreateCaseToast();
  const body = toast.querySelector("#sf-compliance-case-toast-body");
  if (!body) return;

  clearToastBody(body);

  body.appendChild(createInfoRow("Case Number", payload?.caseId));
  body.appendChild(createInfoRow("Subject", payload?.subject));
  body.appendChild(createInfoRow("Status", message));
}

function updateLauncherState() {
  const launcher = getOrCreateAuthLauncher();

  if (authState.authenticated) {
    launcher.textContent = "CA";
    launcher.title = authState.user?.email
      ? `Compliance Assistant — signed in as ${authState.user.email}`
      : "Compliance Assistant — connected";
    launcher.style.background = "#0a7b34";
    launcher.style.color = "#ffffff";
    launcher.style.borderColor = "#08662b";
  } else {
    launcher.textContent = "CA";
    launcher.title = "Compliance Assistant — sign in required";
    launcher.style.background = "#ffffff";
    launcher.style.color = "#111111";
    launcher.style.borderColor = "#d0d7de";
  }
}

function toggleAuthCard() {
  if (!isCaseRecordPage()) return;

  const card = getOrCreateAuthCard();

  if (card.style.display === "none" || !card.style.display) {
    card.style.display = "block";
    syncAuthCardUi();

    if (authState.authenticated) {
      setAuthStatus("Connected.", "#0a7b34");
    } else {
      setAuthStatus("Sign in to use Compliance Assistant.");
    }
  } else {
    card.style.display = "none";
  }
}

function getOrCreateAuthLauncher() {
  let launcher = document.getElementById("sf-compliance-auth-launcher");

  if (launcher) return launcher;

  launcher = document.createElement("button");
  launcher.id = "sf-compliance-auth-launcher";
  launcher.type = "button";
  launcher.textContent = "CA";
  launcher.title = "Compliance Assistant";

  Object.assign(launcher.style, {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: "1000001",
    width: "42px",
    height: "42px",
    borderRadius: "999px",
    border: "1px solid #d0d7de",
    background: "#ffffff",
    color: "#111111",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 8px 22px rgba(0,0,0,0.14)",
  });

  launcher.addEventListener("click", () => {
    toggleAuthCard();
  });

  document.body.appendChild(launcher);

  return launcher;
}

function ensureLauncherVisible() {
  if (!isCaseRecordPage()) return;

  const launcher = getOrCreateAuthLauncher();
  launcher.style.display = "block";
  updateLauncherState();
}

function hideLauncher() {
  const launcher = document.getElementById("sf-compliance-auth-launcher");
  if (launcher) {
    launcher.style.display = "none";
  }
}

function getOrCreateAuthCard() {
  let card = document.getElementById("sf-compliance-auth-card");

  if (card) return card;

  card = document.createElement("div");
  card.id = "sf-compliance-auth-card";

  Object.assign(card.style, {
    position: "fixed",
    top: "66px",
    right: "16px",
    zIndex: "1000000",
    width: "360px",
    background: "#ffffff",
    color: "#111111",
    border: "1px solid #d0d7de",
    borderRadius: "14px",
    boxShadow: "0 12px 34px rgba(0,0,0,0.22)",
    padding: "14px",
    fontSize: "13px",
    lineHeight: "1.45",
    fontFamily: "Arial, sans-serif",
    display: "none",
  });

  card.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <div style="font-size:14px; font-weight:700;">Compliance Assistant</div>
      <button
        id="sf-compliance-auth-close"
        type="button"
        style="background:none; border:none; font-size:16px; cursor:pointer; line-height:1;"
        title="Close"
      >
        ×
      </button>
    </div>

    <div
      id="sf-compliance-auth-connected-box"
      style="display:none; margin-bottom:10px; padding:8px 10px; background:#f6f8fa; border:1px solid #d8dee4; border-radius:10px;"
    >
      <div style="font-weight:600; margin-bottom:4px;">Signed in</div>
      <div id="sf-compliance-auth-user-line" style="word-break:break-word; color:#444;"></div>
      <div id="sf-compliance-auth-connection-line" style="margin-top:4px; color:#0a7b34; font-weight:600;">Connected</div>
    </div>

    <div id="sf-compliance-auth-form">
      <div style="margin-bottom:8px;">
        <label style="display:block; font-weight:600; margin-bottom:4px;">Email</label>
        <input
          id="sf-compliance-auth-email"
          type="email"
          autocomplete="username"
          style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c9d1d9; border-radius:8px;"
          placeholder="you@example.com"
        />
      </div>

      <div style="margin-bottom:10px;">
        <label style="display:block; font-weight:600; margin-bottom:4px;">Password</label>
        <input
          id="sf-compliance-auth-password"
          type="password"
          autocomplete="current-password"
          style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c9d1d9; border-radius:8px;"
          placeholder="Password"
        />
      </div>

      <div style="display:flex; gap:8px;">
        <button
          id="sf-compliance-auth-submit"
          type="button"
          style="flex:1; padding:9px 12px; border:none; border-radius:9px; background:#0176d3; color:#ffffff; font-weight:700; cursor:pointer;"
        >
          Sign in
        </button>

        <button
          id="sf-compliance-auth-signout"
          type="button"
          style="padding:9px 12px; border:1px solid #d0d7de; border-radius:9px; background:#ffffff; color:#111111; font-weight:600; cursor:pointer; display:none;"
        >
          Sign out
        </button>
      </div>
    </div>

    <div
      id="sf-compliance-auth-status"
      style="margin-top:10px; min-height:18px; color:#5b5f66;"
    ></div>
  `;

  document.body.appendChild(card);

  const emailInput = card.querySelector("#sf-compliance-auth-email");
  const passwordInput = card.querySelector("#sf-compliance-auth-password");
  const submitBtn = card.querySelector("#sf-compliance-auth-submit");
  const signOutBtn = card.querySelector("#sf-compliance-auth-signout");
  const closeBtn = card.querySelector("#sf-compliance-auth-close");

  const handleEnter = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAuthSubmit();
    }
  };

  emailInput.addEventListener("keydown", handleEnter);
  passwordInput.addEventListener("keydown", handleEnter);
  submitBtn.addEventListener("click", handleAuthSubmit);
  signOutBtn.addEventListener("click", handleLogout);
  closeBtn.addEventListener("click", () => {
    card.style.display = "none";
  });

  return card;
}

function setAuthStatus(message, color = "#5b5f66") {
  const card = getOrCreateAuthCard();
  const status = card.querySelector("#sf-compliance-auth-status");
  if (!status) return;

  status.textContent = message || "";
  status.style.color = color;
}

function setAuthBusy(isBusy) {
  const card = getOrCreateAuthCard();
  const submitBtn = card.querySelector("#sf-compliance-auth-submit");
  const signOutBtn = card.querySelector("#sf-compliance-auth-signout");
  const emailInput = card.querySelector("#sf-compliance-auth-email");
  const passwordInput = card.querySelector("#sf-compliance-auth-password");

  if (submitBtn) {
    submitBtn.disabled = isBusy;
    submitBtn.style.opacity = isBusy ? "0.7" : "1";
    submitBtn.textContent = isBusy ? "Signing in..." : "Sign in";
  }

  if (signOutBtn) {
    signOutBtn.disabled = isBusy;
    signOutBtn.style.opacity = isBusy ? "0.7" : "1";
  }

  if (emailInput) emailInput.disabled = isBusy;
  if (passwordInput) passwordInput.disabled = isBusy;
}

function syncAuthCardUi() {
  const card = getOrCreateAuthCard();
  const connectedBox = card.querySelector("#sf-compliance-auth-connected-box");
  const userLine = card.querySelector("#sf-compliance-auth-user-line");
  const connectionLine = card.querySelector("#sf-compliance-auth-connection-line");
  const emailInput = card.querySelector("#sf-compliance-auth-email");
  const passwordInput = card.querySelector("#sf-compliance-auth-password");
  const submitBtn = card.querySelector("#sf-compliance-auth-submit");
  const signOutBtn = card.querySelector("#sf-compliance-auth-signout");

  if (emailInput && authState.lastEmail && !emailInput.value) {
    emailInput.value = authState.lastEmail;
  }

  if (authState.authenticated) {
    connectedBox.style.display = "block";
    userLine.textContent =
      authState.user?.email || authState.user?.name || "Authenticated user";
    connectionLine.textContent = "Connected";

    if (passwordInput) {
      passwordInput.value = "";
    }

    if (submitBtn) {
      submitBtn.style.display = "none";
    }

    if (signOutBtn) {
      signOutBtn.style.display = "inline-block";
      signOutBtn.textContent = "Sign out";
      signOutBtn.style.flex = "1";
    }
  } else {
    connectedBox.style.display = "none";
    userLine.textContent = "";
    connectionLine.textContent = "";

    if (submitBtn) {
      submitBtn.style.display = "inline-block";
      submitBtn.style.flex = "1";
    }

    if (signOutBtn) {
      signOutBtn.style.display = "none";
    }
  }

  updateLauncherState();
}

function showAuthCard(message = "Sign in to use Compliance Assistant.") {
  if (!isCaseRecordPage()) return;

  ensureLauncherVisible();

  const card = getOrCreateAuthCard();
  card.style.display = "block";
  syncAuthCardUi();
  setAuthStatus(message);
}

function hideAuthCard() {
  const card = document.getElementById("sf-compliance-auth-card");
  if (card) {
    card.style.display = "none";
  }

  if (isCaseRecordPage()) {
    ensureLauncherVisible();
  }
}

async function handleAuthSubmit() {
  const card = getOrCreateAuthCard();
  const emailInput = card.querySelector("#sf-compliance-auth-email");
  const passwordInput = card.querySelector("#sf-compliance-auth-password");

  const email = String(emailInput?.value || "").trim();
  const password = String(passwordInput?.value || "");

  if (!email || !password) {
    setAuthStatus("Enter email and password.", "#b42318");
    return;
  }

  setAuthBusy(true);
  setAuthStatus("Signing in...");

  const response = await sendMessageAsync({
    type: "AUTH_LOGIN",
    payload: { email, password },
  });

  setAuthBusy(false);

  if (!response?.ok) {
    authState = {
      ...authState,
      authenticated: false,
      user: null,
      lastEmail: email,
    };
    syncAuthCardUi();
    setAuthStatus(response?.error || "Sign in failed.", "#b42318");
    return;
  }

  authState = {
    authenticated: true,
    user: response?.user || null,
    lastEmail: email,
  };

  if (passwordInput) {
    passwordInput.value = "";
  }

  syncAuthCardUi();
  setAuthStatus("Connected.", "#0a7b34");

  lastSentCaseUrl = null;
  scheduleChecks();
}

async function handleLogout() {
  setAuthBusy(true);
  setAuthStatus("Signing out...");

  await sendMessageAsync({ type: "AUTH_LOGOUT" });

  const card = getOrCreateAuthCard();
  const passwordInput = card.querySelector("#sf-compliance-auth-password");

  authState = {
    authenticated: false,
    user: null,
    lastEmail: authState.lastEmail || "",
  };

  if (passwordInput) {
    passwordInput.value = "";
  }

  setAuthBusy(false);
  syncAuthCardUi();
  showAuthCard("Signed out. Sign in to continue.");
  setAuthStatus("Signed out.", "#5b5f66");

  lastSentCaseUrl = null;
}

function readSalesforceCaseFromDom() {
  const caseIdNode = findFirstVisible([
    '[data-target-selection-name="sfdc:RecordField.Case.CaseNumber"] lightning-formatted-text',
    '[data-target-selection-name="sfdc:RecordField.Case.CaseNumber"]',
    '[field-label="Case Number"] lightning-formatted-text',
    '[field-label="Case Number"]',
    'span[title^="000"]'
  ]);

  const subjectNode = findFirstVisible([
    '[data-target-selection-name="sfdc:RecordField.Case.Subject"] lightning-formatted-text',
    '[data-target-selection-name="sfdc:RecordField.Case.Subject"]',
    '[field-label="Subject"] lightning-formatted-text',
    '[field-label="Subject"]'
  ]);

  const descriptionNode = findFirstVisible([
    '[data-target-selection-name="sfdc:RecordField.Case.Description"] lightning-formatted-rich-text',
    '[data-target-selection-name="sfdc:RecordField.Case.Description"]',
    '[field-label="Description"] lightning-formatted-rich-text',
    '[field-label="Description"]'
  ]);

  return {
    caseId: cleanCaseNumber(normalizeText(caseIdNode?.textContent, 100)),
    subject: normalizeText(cleanSubject(subjectNode?.textContent), 500),
    description: normalizeText(descriptionNode?.textContent, 4000),
    href: window.location.href,
    title: normalizeText(document.title, 300),
    capturedAt: new Date().toISOString(),
  };
}

async function syncAuthState() {
  const response = await sendMessageAsync({ type: "AUTH_GET_STATE" });

  authState = {
    authenticated: !!response?.authenticated,
    user: response?.user || null,
    lastEmail: response?.lastEmail || "",
  };

  ensureLauncherVisible();
  syncAuthCardUi();

  if (authState.authenticated) {
    hideAuthCard();
    return true;
  }

  showAuthCard("Sign in to use Compliance Assistant.");
  return false;
}

async function trySendCaseContext() {
  if (!isCaseRecordPage()) {
    return;
  }

  if (!authState.authenticated) {
    showAuthCard("Sign in to analyze this case.");
    return;
  }

  const recordId = getRecordIdFromUrl();

  if (!recordId) {
    return;
  }

  const currentUrl = window.location.href;

  if (currentUrl === lastSentCaseUrl) {
    return;
  }

  const payload = readSalesforceCaseFromDom();
  payload.recordId = recordId;

  if (!payload.caseId && !payload.subject && !payload.description) {
    console.log("Case detected but DOM not ready yet:", currentUrl);
    return;
  }

  lastSentCaseUrl = currentUrl;

  console.log("SF payload:", payload);

  renderCaseToastInitial(payload);

  const response = await sendMessageAsync({
    type: "SF_CASE_CONTEXT",
    payload,
  });

  console.log("background response:", response);

  const currentRecordId = getRecordIdFromUrl();

  if (!currentRecordId || payload.recordId !== currentRecordId) {
    console.log("Skipping toast update because payload does not match current active case");
    return;
  }

  if (response?.authRequired) {
    authState = {
      authenticated: false,
      user: null,
      lastEmail: authState.lastEmail || authState.user?.email || "",
    };

    syncAuthCardUi();
    lastSentCaseUrl = null;
    renderCaseToastAuthRequired(payload, response?.error || "Session expired");
    showAuthCard("Session expired. Sign in again.");
    setAuthStatus("Session expired.", "#b42318");
    return;
  }

  if (response?.ok) {
    renderCaseToastAnalysis(payload, response);
    return;
  }

  const toast = getOrCreateCaseToast();
  const body = toast.querySelector("#sf-compliance-case-toast-body");
  if (body) {
    clearToastBody(body);
    body.appendChild(createInfoRow("Case Number", payload.caseId));
    body.appendChild(createInfoRow("Subject", payload.subject));
    body.appendChild(createInfoRow("Status", "Analysis failed"));
    body.appendChild(createInfoRow("Error", response?.error || "Unknown error"));
  }
}

function scheduleChecks() {
  if (!isCaseRecordPage()) return;

  setTimeout(() => {
    trySendCaseContext();
  }, 500);

  setTimeout(() => {
    trySendCaseContext();
  }, 1500);

  setTimeout(() => {
    trySendCaseContext();
  }, 3000);

  setTimeout(() => {
    trySendCaseContext();
  }, 5000);
}

function handlePotentialRouteChange() {
  const currentUrl = window.location.href;

  if (currentUrl !== lastSeenUrl) {
    console.log("Route changed:", currentUrl);
    lastSeenUrl = currentUrl;
    lastSentCaseUrl = null;

    if (!isCaseRecordPage()) {
      hideAuthCard();
      hideLauncher();
      return;
    }

    ensureLauncherVisible();

    if (authState.authenticated) {
      scheduleChecks();
    } else {
      showAuthCard("Sign in to use Compliance Assistant.");
    }
  }
}

async function bootstrap() {
  if (!isCaseRecordPage()) {
    hideLauncher();
    return;
  }

  ensureLauncherVisible();

  const isAuthenticated = await syncAuthState();

  if (isAuthenticated) {
    scheduleChecks();
  }
}

bootstrap();

const observer = new MutationObserver(() => {
  handlePotentialRouteChange();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

window.addEventListener("popstate", handlePotentialRouteChange);
window.addEventListener("hashchange", handlePotentialRouteChange);