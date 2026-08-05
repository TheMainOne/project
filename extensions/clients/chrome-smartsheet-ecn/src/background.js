const DEFAULT_API_BASE_URL = "https://cloudcompliance.duckdns.org/api/ecn/ext";
const AUTH_BASE_URL = "https://cloudcompliance.duckdns.org/api/auth";
const REQUEST_TIMEOUT_MS = 20_000;
const STORAGE_KEYS = Object.freeze({
  token: "ecnExtensionToken",
  user: "ecnAuthUser",
  lastEmail: "ecnLastEmail",
  language: "ecnLanguage",
  refreshToken: "ecnSessionRefreshToken",
  apiBaseUrl: "ecnApiBaseUrl",
});
const ECN_SCOPES = ["ecn:read", "ecn:analyze"];
const SIDE_PANEL_PATH = "sidepanel/index.html";
const SMARTSHEET_HOSTS = Object.freeze([
  "app.smartsheet.com",
  "app.smartsheet.com.au",
  "app.smartsheet.eu",
  "app.smartsheetgov.com",
]);
const SMARTSHEET_URL_PATTERNS = SMARTSHEET_HOSTS.map((host) => `https://${host}/*`);

let tokenRefreshInFlight = null;

function isSmartsheetUrl(value) {
  try {
    const parsed = new URL(value || "about:blank");
    return parsed.protocol === "https:" && SMARTSHEET_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function reportSidePanelError(context, error) {
  console.error(`[ECN Assistant] ${context}:`, error?.message || error);
}

async function configureSidePanelForTab(tab) {
  const tabId = Number(tab?.id);
  if (!Number.isInteger(tabId)) return;
  const enabled = isSmartsheetUrl(tab?.url);
  const results = await Promise.allSettled([
    chrome.sidePanel.setOptions({
      tabId,
      path: SIDE_PANEL_PATH,
      enabled,
    }),
    chrome.action.setTitle({
      tabId,
      title: enabled ? "Open ECN Assistant" : "Open a Smartsheet sheet first",
    }),
  ]);
  for (const result of results) {
    if (result.status === "rejected") reportSidePanelError("Could not configure tab", result.reason);
  }
}

function enableToolbarSidePanel() {
  return chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => reportSidePanelError("Could not enable toolbar opening", error));
}

function configureExistingSmartsheetTabs() {
  return chrome.tabs
    .query({ url: SMARTSHEET_URL_PATTERNS })
    .then((tabs) => Promise.allSettled(tabs.map((tab) => configureSidePanelForTab(tab))))
    .catch((error) => reportSidePanelError("Could not initialize open tabs", error));
}

async function initializeSidePanel() {
  const results = await Promise.allSettled([
    chrome.sidePanel.setOptions({ path: SIDE_PANEL_PATH, enabled: false }),
    enableToolbarSidePanel(),
  ]);
  for (const result of results) {
    if (result.status === "rejected") reportSidePanelError("Could not initialize side panel", result.reason);
  }
  await configureExistingSmartsheetTabs();
}

void enableToolbarSidePanel();
void configureExistingSmartsheetTabs();
chrome.runtime.onInstalled.addListener(() => { void initializeSidePanel(); });
chrome.runtime.onStartup.addListener(() => { void initializeSidePanel(); });

chrome.action.onClicked.addListener((tab) => {
  const tabId = Number(tab?.id);
  if (!tab?.id || !isSmartsheetUrl(tab.url)) {
    if (!Number.isInteger(tabId)) return;
    void chrome.sidePanel.setOptions({ tabId, path: SIDE_PANEL_PATH, enabled: false })
      .catch((error) => reportSidePanelError("Could not disable non-Smartsheet tab", error));
    void chrome.action.setBadgeBackgroundColor({ tabId, color: "#b42318" });
    void chrome.action.setBadgeText({ tabId, text: "!" });
    void chrome.action.setTitle({ tabId, title: "Open a Smartsheet sheet first" });
    setTimeout(() => {
      void chrome.action.setBadgeText({ tabId, text: "" });
    }, 2500);
    return;
  }
  void chrome.action.setBadgeText({ tabId, text: "" });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  void configureSidePanelForTab({ id: tabId, url: changeInfo.url || tab?.url })
    .catch((error) => reportSidePanelError("Could not update tab configuration", error));
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId)
    .then((tab) => configureSidePanelForTab(tab))
    .catch((error) => reportSidePanelError("Could not activate tab configuration", error));
});

function assertAllowedUrl(url) {
  const parsed = new URL(url);
  const production = parsed.protocol === "https:" && parsed.hostname === "cloudcompliance.duckdns.org";
  const local = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (!production && !local) throw new Error("Backend URL is not allowlisted");
}

function tokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return Number(payload.exp) * 1000;
  } catch {
    return Date.now() + 55 * 60_000;
  }
}

function safeError(value, fallback = "Request failed") {
  if (!value) return fallback;
  if (typeof value === "string") return value.slice(0, 500);
  return String(value.error || value.message || fallback).slice(0, 500);
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { response, text, data };
}

async function fetchJson(url, { method = "GET", body, token } = {}) {
  assertAllowedUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    return parseResponse(response);
  } finally {
    clearTimeout(timeout);
  }
}

async function getApiBaseUrl() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.apiBaseUrl);
  const candidate = String(stored[STORAGE_KEYS.apiBaseUrl] || DEFAULT_API_BASE_URL).replace(/\/$/, "");
  assertAllowedUrl(candidate);
  return candidate;
}

async function getStoredAuth() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.token,
    STORAGE_KEYS.user,
    STORAGE_KEYS.lastEmail,
  ]);
  const record = stored[STORAGE_KEYS.token];
  const valid = record?.token && (!record.expiresAt || record.expiresAt > Date.now() + 10_000);
  if (record && !valid) await chrome.storage.local.remove(STORAGE_KEYS.token);
  return {
    token: valid ? record.token : null,
    user: stored[STORAGE_KEYS.user] || null,
    lastEmail: stored[STORAGE_KEYS.lastEmail] || "",
  };
}

async function setAuth({ token, refreshToken, user, lastEmail }) {
  const changes = {
    [STORAGE_KEYS.token]: { token, expiresAt: tokenExpiry(token) },
    [STORAGE_KEYS.lastEmail]: String(lastEmail || "").trim().toLowerCase(),
  };
  if (user) changes[STORAGE_KEYS.user] = user;
  await chrome.storage.local.set(changes);
  if (typeof refreshToken === "string") {
    await chrome.storage.session.set({ [STORAGE_KEYS.refreshToken]: refreshToken });
  }
}

async function clearAuth() {
  await chrome.storage.local.remove([STORAGE_KEYS.token, STORAGE_KEYS.user]);
  await chrome.storage.session.remove(STORAGE_KEYS.refreshToken);
}

async function issueEcnToken(accessToken) {
  const parsed = await fetchJson(`${AUTH_BASE_URL}/extension-token`, {
    method: "POST",
    body: { scopes: ECN_SCOPES },
    token: accessToken,
  });
  if (!parsed.response.ok || !parsed.data?.token) {
    const error = new Error(safeError(parsed.data || parsed.text, "Could not issue ECN token"));
    error.status = parsed.response.status;
    throw error;
  }
  return parsed.data;
}

async function login(payload = {}) {
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  if (!email || !password) return { ok: false, error: "Email and password are required" };
  try {
    const parsed = await fetchJson(`${AUTH_BASE_URL}/login`, {
      method: "POST",
      body: { email, password },
    });
    if (!parsed.response.ok) {
      return { ok: false, status: parsed.response.status, error: safeError(parsed.data || parsed.text, "Login failed") };
    }
    const accessToken = parsed.data?.tokens?.accessToken;
    const refreshToken = parsed.data?.tokens?.refreshToken;
    if (!accessToken) return { ok: false, error: "Login response did not include an access token" };
    const issued = await issueEcnToken(accessToken);
    await setAuth({ token: issued.token, refreshToken, user: parsed.data?.user, lastEmail: email });
    return { ok: true, authenticated: true, user: parsed.data?.user || null, scope: issued.scope || "" };
  } catch (error) {
    return { ok: false, status: error?.status, error: safeError(error, "Login failed") };
  }
}

async function refreshToken() {
  const session = await chrome.storage.session.get(STORAGE_KEYS.refreshToken);
  const refreshTokenValue = session[STORAGE_KEYS.refreshToken];
  if (!refreshTokenValue) return { ok: false, authRequired: true, error: "Sign in again" };
  try {
    const parsed = await fetchJson(`${AUTH_BASE_URL}/refresh`, {
      method: "POST",
      body: { refreshToken: refreshTokenValue },
    });
    if (!parsed.response.ok || !parsed.data?.accessToken) throw new Error("Session expired");
    const issued = await issueEcnToken(parsed.data.accessToken);
    const auth = await getStoredAuth();
    await setAuth({ token: issued.token, user: auth.user, lastEmail: auth.lastEmail });
    return { ok: true, token: issued.token };
  } catch (error) {
    await clearAuth();
    return { ok: false, authRequired: true, error: safeError(error, "Session expired") };
  }
}

async function ensureToken() {
  const auth = await getStoredAuth();
  if (auth.token) return { ok: true, token: auth.token };
  if (!tokenRefreshInFlight) {
    tokenRefreshInFlight = refreshToken().finally(() => { tokenRefreshInFlight = null; });
  }
  return tokenRefreshInFlight;
}

function sanitizeSnapshot(snapshot) {
  const safe = snapshot && typeof snapshot === "object" ? snapshot : {};
  const captureStates = new Set(["complete", "partial", "ambiguous"]);
  const captureModes = new Set(["dom", "paste"]);
  return {
    pageUrl: typeof safe.pageUrl === "string" ? safe.pageUrl.slice(0, 2048) : "",
    sheetTitle: typeof safe.sheetTitle === "string" ? safe.sheetTitle.slice(0, 300) : "",
    rowHint: {
      ...(Number.isInteger(safe.rowHint?.rowIndex) ? { rowIndex: safe.rowHint.rowIndex } : {}),
      ...(typeof safe.rowHint?.primaryValue === "string" ? { primaryValue: safe.rowHint.primaryValue.slice(0, 500) } : {}),
      ...(typeof safe.rowHint?.ecnNumber === "string" ? { ecnNumber: safe.rowHint.ecnNumber.slice(0, 200) } : {}),
    },
    captureMode: captureModes.has(safe.captureMode) ? safe.captureMode : "dom",
    captureState: captureStates.has(safe.captureState) ? safe.captureState : "ambiguous",
    observedHeaders: Array.isArray(safe.observedHeaders)
      ? safe.observedHeaders.slice(0, 500).map((value) => String(value).slice(0, 300))
      : [],
    fields: Array.isArray(safe.fields)
      ? safe.fields.slice(0, 500).map((field) => ({
        header: String(field?.header || "").slice(0, 300),
        ordinal: Number.isInteger(field?.ordinal) && field.ordinal > 0 ? field.ordinal : 0,
        value: typeof field?.value === "string" ? field.value.slice(0, 10_000) : field?.value ?? null,
      })).filter((field) => field.header && field.ordinal)
      : [],
    capturedAt: typeof safe.capturedAt === "string" ? safe.capturedAt : new Date().toISOString(),
  };
}

function sanitizeSelectedTypes(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim().slice(0, 200)).filter(Boolean))).slice(0, 25);
}

async function callApi(path, { method = "GET", body, retry = true } = {}) {
  const auth = await ensureToken();
  if (!auth.ok) return { ok: false, status: 401, authRequired: true, error: auth.error || "Authentication required" };
  try {
    const apiBaseUrl = await getApiBaseUrl();
    const parsed = await fetchJson(`${apiBaseUrl}${path}`, { method, body, token: auth.token });
    if (parsed.response.status === 401 && retry) {
      const refreshed = await refreshToken();
      if (!refreshed.ok) return refreshed;
      return callApi(path, { method, body, retry: false });
    }
    if (!parsed.response.ok) {
      return {
        ok: false,
        status: parsed.response.status,
        authRequired: parsed.response.status === 401,
        error: safeError(parsed.data || parsed.text),
      };
    }
    return { ok: true, status: parsed.response.status, data: parsed.data };
  } catch (error) {
    return {
      ok: false,
      error: error?.name === "AbortError" ? "Request timed out" : safeError(error),
      errorType: error?.name === "AbortError" ? "timeout" : "network",
    };
  }
}

async function queryActiveSmartsheetTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  const url = new URL(tab.url || "about:blank");
  const allowed = ["app.smartsheet.com", "app.smartsheet.com.au", "app.smartsheet.eu", "app.smartsheetgov.com"];
  if (url.protocol !== "https:" || !allowed.includes(url.hostname)) throw new Error("Open a Smartsheet sheet in the active tab");
  return tab;
}

async function sendToActiveTab(message) {
  const tab = await queryActiveSmartsheetTab();
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    throw new Error("ECN capture is unavailable on this tab. Reload the Smartsheet page once.");
  }
}

async function setProfileOnActiveTab(profile) {
  try {
    const response = await sendToActiveTab({ type: "ECN_SET_SHEET_PROFILE", profile: profile || null });
    return response?.ok ? { ok: true } : { ok: false, error: response?.error || "Profile was not accepted" };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

async function getPreferences() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.language]);
  const auth = await getStoredAuth();
  return {
    ok: true,
    language: stored[STORAGE_KEYS.language] === "en" ? "en" : "ru",
    authenticated: Boolean(auth.token),
    user: auth.user,
    lastEmail: auth.lastEmail,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender?.id !== chrome.runtime.id) return false;
  const run = async () => {
    switch (message?.type) {
      case "ECN_GET_SESSION":
        return getPreferences();
      case "ECN_SET_LANGUAGE": {
        const language = message.language === "en" ? "en" : "ru";
        await chrome.storage.local.set({ [STORAGE_KEYS.language]: language });
        return { ok: true, language };
      }
      case "ECN_LOGIN":
        return login(message.payload || {});
      case "ECN_LOGOUT":
        await clearAuth();
        return { ok: true };
      case "ECN_BOOTSTRAP":
        return callApi("/bootstrap");
      case "ECN_SAVE_SHEET_PROFILE":
        return callApi("/sheet-profile", {
          method: "PUT",
          body: { profile: message.profile || {}, confirmed: message.confirmed === true },
        });
      case "ECN_ANALYZE":
        return callApi("/analyze", {
          method: "POST",
          body: {
            snapshot: sanitizeSnapshot(message.snapshot),
            selectedTypes: sanitizeSelectedTypes(message.selectedTypes),
            language: message.language === "en" ? "en" : "ru",
          },
        });
      case "ECN_SET_ACTIVE_PROFILE":
        return setProfileOnActiveTab(message.profile || null);
      case "ECN_GET_ACTIVE_TAB_CONTEXT": {
        const tab = await queryActiveSmartsheetTab();
        return {
          ok: true,
          pageUrl: String(tab.url || ""),
          sheetTitle: String(tab.title || "Smartsheet row").slice(0, 300),
        };
      }
      case "ECN_CAPTURE_ACTIVE_ROW": {
        const response = await sendToActiveTab({ type: "ECN_CAPTURE_SELECTED_ROW" });
        return response?.ok ? { ok: true, snapshot: response.snapshot } : { ok: false, error: response?.error || "Capture failed" };
      }
      case "ECN_GET_SELECTOR_DIAGNOSTICS": {
        const response = await sendToActiveTab({ type: "ECN_SELECTOR_DIAGNOSTICS" });
        return response?.ok
          ? { ok: true, diagnostics: response.diagnostics }
          : { ok: false, error: response?.error || "Diagnostics failed" };
      }
      default:
        return { ok: false, error: "Unsupported message" };
    }
  };

  run().then(sendResponse).catch((error) => sendResponse({ ok: false, error: safeError(error) }));
  return true;
});
