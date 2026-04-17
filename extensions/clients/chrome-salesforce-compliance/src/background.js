const API_BASE_URL = "https://cloudcompliance.duckdns.org/api/compliance/ext";
const AUTH_BASE_URL = "https://cloudcompliance.duckdns.org/api/auth";

const DEBUG = false;

function assertHttps(url) {
  if (new URL(url).protocol !== "https:") {
    throw new Error(`Non-HTTPS requests are not allowed: ${url}`);
  }
}

function sanitizeId(id) {
  const s = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!s) throw new Error("Invalid ID format");
  return s;
}

const STORAGE_KEYS = {
  complianceToken: "complianceToken",
  refreshToken: "authRefreshToken",
  user: "authUser",
  lastEmail: "authLastEmail",
};

if (DEBUG) console.log("BACKGROUND FILE LOADED");

function buildSafeCasePayload(payload = {}) {
  return {
    recordId: typeof payload.recordId === "string" ? payload.recordId : null,
    caseId: typeof payload.caseId === "string" ? payload.caseId : null,
    subject: typeof payload.subject === "string" ? payload.subject : null,
    description: typeof payload.description === "string" ? payload.description : null,
    href: typeof payload.href === "string" ? payload.href : null,
    title: typeof payload.title === "string" ? payload.title : null,
    capturedAt: typeof payload.capturedAt === "string" ? payload.capturedAt : null,
  };
}

async function parseResponse(res) {
  const text = await res.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    text,
    json,
  };
}

function getErrorMessage(parsed, fallback = "Request failed") {
  return parsed?.json?.error || parsed?.json?.message || parsed?.text || fallback;
}

async function handleManualMaterialsLookup(payload) {
  const caseId = String(payload?.caseId || "").trim();
  const queries = Array.isArray(payload?.queries)
    ? payload.queries.map((q) => String(q || "").trim()).filter(Boolean)
    : [];
  const requestedRegulations = Array.isArray(payload?.requestedRegulations)
    ? payload.requestedRegulations.map((code) => String(code || "").trim().toUpperCase()).filter(Boolean)
    : [];

  if (queries.length === 0) {
    return {
      ok: false,
      error: "queries are required",
    };
  }

  const lookupResult = await callComplianceApi("/material-suppliers", {
    caseId: caseId || "manual-lookup",
    queries,
    requestedRegulations,
  });

  if (lookupResult.authRequired) {
    return {
      ok: false,
      authRequired: true,
      error: lookupResult.error || "Authentication required",
    };
  }

  return {
    ok: lookupResult.ok,
    componentSuppliersResult: lookupResult,
  };
}

const SUPPLIERS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

async function handleSuppliersLibraryLookup(payload = {}) {
  const search = String(payload?.search || "").trim();
  const forceRefresh = Boolean(payload?.forceRefresh);

  if (!forceRefresh) {
    const stored = await chrome.storage.local.get("suppliersLibraryCache");
    const cache = stored.suppliersLibraryCache;
    if (
      cache &&
      cache.search === search &&
      typeof cache.fetchedAt === "number" &&
      Date.now() - cache.fetchedAt < SUPPLIERS_CACHE_TTL_MS
    ) {
      return { ok: true, suppliersLibraryResult: cache.result, fromCache: true };
    }
  }

  const libraryResult = await callComplianceApi("/suppliers-library", { search });

  if (libraryResult.authRequired) {
    return {
      ok: false,
      authRequired: true,
      error: libraryResult.error || "Authentication required",
    };
  }

  if (libraryResult.ok) {
    await chrome.storage.local.set({
      suppliersLibraryCache: { search, fetchedAt: Date.now(), result: libraryResult },
    });
  }

  return {
    ok: libraryResult.ok,
    suppliersLibraryResult: libraryResult,
  };
}

async function handleSaveComplianceSnapshot(snapshot = {}) {
  const { compliancePercent, coveragePercent, totalSuppliers } = snapshot;
  const stored = await chrome.storage.local.get("complianceSnapshots");
  const existing = Array.isArray(stored.complianceSnapshots) ? stored.complianceSnapshots : [];
  const newEntry = {
    date: new Date().toISOString(),
    compliancePercent: typeof compliancePercent === "number" ? compliancePercent : 0,
    coveragePercent: typeof coveragePercent === "number" ? coveragePercent : 0,
    totalSuppliers: typeof totalSuppliers === "number" ? totalSuppliers : 0,
  };
  const updated = [newEntry, ...existing].slice(0, 30);
  await chrome.storage.local.set({ complianceSnapshots: updated });
  return { ok: true };
}

async function handleGetComplianceSnapshots() {
  const stored = await chrome.storage.local.get("complianceSnapshots");
  return {
    ok: true,
    snapshots: Array.isArray(stored.complianceSnapshots) ? stored.complianceSnapshots : [],
  };
}

function normalizePartNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "");
}

function isLikelyPartNumber(value) {
  const v = normalizePartNumber(value);
  if (!v) return false;

  if (v.length < 5 || v.length > 30) return false;
  if (!/[0-9]/.test(v)) return false;

  // разрешаем букву в начале, цифры, дефисы
  return /^[A-Z0-9-]+$/.test(v);
}

function extractStructuredPartNumbersFromText(text) {
  const source = String(text || "")
    .replace(/[–—]/g, "-");

  if (!source.trim()) return [];

  const matches = [
    ...source.matchAll(/\b[A-Z]?\d{5,7}-\d{2,3}\b/gi),
    ...source.matchAll(/\b[A-Z]\d{5,8}\b/gi),
    ...source.matchAll(/\b\d{5,8}\b/g),
  ];

  const values = matches
    .map((m) => normalizePartNumber(m[0]))
    .filter(isLikelyPartNumber);

  return Array.from(new Set(values));
}

function extractAiMaterialCandidates(analyzeResult) {
  const analysis = analyzeResult?.json?.result?.analysis || null;

  if (!analysis || !Array.isArray(analysis.materials)) {
    return [];
  }

  const aiParts = analysis.materials
    .map((item) => normalizePartNumber(item?.part_number || ""))
    .filter(Boolean)
    .filter(isLikelyPartNumber);

  return Array.from(new Set(aiParts));
}

function extractRequestedRegulations(analyzeResult) {
  const analysis = analyzeResult?.json?.result?.analysis || null;

  if (!analysis || !Array.isArray(analysis.requested_regulations)) {
    return [];
  }

  return Array.from(
    new Set(
      analysis.requested_regulations
        .map((code) => String(code || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function extractPartNumbersForLookup(analyzeResult, payload) {
  const fromAi = extractAiMaterialCandidates(analyzeResult);

  const fromRawText = Array.from(
    new Set([
      ...extractStructuredPartNumbersFromText(payload?.subject || ""),
      ...extractStructuredPartNumbersFromText(payload?.description || ""),
    ])
  );

  // Если AI уже вернула нормальные part numbers — используем именно их.
  if (fromAi.length > 0) {
    return fromAi;
  }

  // Только если AI ничего не дала, падаем в regex fallback.
  return fromRawText;
}

// Refresh token is kept only in memory — never persisted to storage.
let _sessionRefreshToken = null;

async function getStoredAuth() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.complianceToken,
    STORAGE_KEYS.user,
    STORAGE_KEYS.lastEmail,
  ]);

  const stored = result[STORAGE_KEYS.complianceToken];
  let complianceToken = null;

  if (stored && typeof stored === "object" && stored.token) {
    if (!stored.expiresAt || stored.expiresAt > Date.now()) {
      complianceToken = stored.token;
    } else {
      await chrome.storage.local.remove([STORAGE_KEYS.complianceToken]);
    }
  }

  return {
    complianceToken,
    refreshToken: _sessionRefreshToken,
    user: result[STORAGE_KEYS.user] || null,
    lastEmail: result[STORAGE_KEYS.lastEmail] || "",
  };
}

async function setStoredAuth({ complianceToken, refreshToken, user, lastEmail, expiresAt }) {
  const payload = {};

  if (typeof complianceToken === "string") {
    // Store with expiry — default 1 hour if not provided
    const expiry = typeof expiresAt === "number" ? expiresAt : Date.now() + 3600_000;
    payload[STORAGE_KEYS.complianceToken] = { token: complianceToken, expiresAt: expiry };
  }

  // Never persist refresh token — keep in memory only
  if (typeof refreshToken === "string") {
    _sessionRefreshToken = refreshToken;
  }

  if (user) {
    payload[STORAGE_KEYS.user] = user;
  }

  if (typeof lastEmail === "string") {
    payload[STORAGE_KEYS.lastEmail] = lastEmail;
  }

  await chrome.storage.local.set(payload);
}

async function clearStoredAuth({ keepLastEmail = true } = {}) {
  _sessionRefreshToken = null;

  const keysToRemove = [
    STORAGE_KEYS.complianceToken,
    STORAGE_KEYS.user,
  ];

  if (!keepLastEmail) {
    keysToRemove.push(STORAGE_KEYS.lastEmail);
  }

  await chrome.storage.local.remove(keysToRemove);
}

async function postJson(url, body, token = null) {
  assertHttps(url);

  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });

  return parseResponse(res);
}

async function loginAndIssueExtensionToken({ email, password }) {
  try {
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const loginResult = await postJson(`${AUTH_BASE_URL}/login`, {
      email: normalizedEmail,
      password,
    });

    if (!loginResult.ok) {
      return {
        ok: false,
        error: getErrorMessage(loginResult, "Login failed"),
      };
    }

    const accessToken = loginResult?.json?.tokens?.accessToken;
    const refreshToken = loginResult?.json?.tokens?.refreshToken;
    const user = loginResult?.json?.user || null;

    if (!accessToken || !refreshToken) {
      return {
        ok: false,
        error: "Login succeeded but tokens were not returned",
      };
    }

    const extensionResult = await postJson(
      `${AUTH_BASE_URL}/extension-token`,
      {
        scopes: ["compliance:read", "compliance:analyze"],
      },
      accessToken
    );

    if (!extensionResult.ok) {
      return {
        ok: false,
        error: getErrorMessage(extensionResult, "Failed to issue extension token"),
      };
    }

    const complianceToken = extensionResult?.json?.token;

    if (!complianceToken) {
      return {
        ok: false,
        error: "Extension token was not returned",
      };
    }

    await setStoredAuth({
      complianceToken,
      refreshToken,
      user,
      lastEmail: normalizedEmail,
    });

    return {
      ok: true,
      authenticated: true,
      user,
      scope: extensionResult?.json?.scope || "",
    };
  } catch (err) {
    console.error("loginAndIssueExtensionToken failed:", err);
    return {
      ok: false,
      error: err?.message || "Login failed",
    };
  }
}

async function refreshAndIssueExtensionToken() {
  try {
    const { refreshToken, user, lastEmail } = await getStoredAuth();

    if (!refreshToken) {
      return {
        ok: false,
        error: "Missing refresh token",
      };
    }

    const refreshResult = await postJson(`${AUTH_BASE_URL}/refresh`, {
      refreshToken,
    });

    if (!refreshResult.ok) {
      await clearStoredAuth({ keepLastEmail: true });
      return {
        ok: false,
        error: getErrorMessage(refreshResult, "Refresh failed"),
      };
    }

    const accessToken = refreshResult?.json?.accessToken;

    if (!accessToken) {
      await clearStoredAuth({ keepLastEmail: true });
      return {
        ok: false,
        error: "Refresh succeeded but access token was not returned",
      };
    }

    const extensionResult = await postJson(
      `${AUTH_BASE_URL}/extension-token`,
      {
        scopes: ["compliance:read", "compliance:analyze"],
      },
      accessToken
    );

    if (!extensionResult.ok) {
      await clearStoredAuth({ keepLastEmail: true });
      return {
        ok: false,
        error: getErrorMessage(extensionResult, "Failed to re-issue extension token"),
      };
    }

    const complianceToken = extensionResult?.json?.token;

    if (!complianceToken) {
      await clearStoredAuth({ keepLastEmail: true });
      return {
        ok: false,
        error: "Extension token was not returned",
      };
    }

    await setStoredAuth({
      complianceToken,
      refreshToken,
      user,
      lastEmail,
    });

    return {
      ok: true,
      authenticated: true,
      user,
      scope: extensionResult?.json?.scope || "",
    };
  } catch (err) {
    console.error("refreshAndIssueExtensionToken failed:", err);
    await clearStoredAuth({ keepLastEmail: true });
    return {
      ok: false,
      error: err?.message || "Refresh failed",
    };
  }
}

async function ensureComplianceToken() {
  const { complianceToken } = await getStoredAuth();

  if (complianceToken) {
    return { ok: true, complianceToken };
  }

  const refreshResult = await refreshAndIssueExtensionToken();

  if (!refreshResult.ok) {
    return {
      ok: false,
      authRequired: true,
      error: refreshResult.error || "Authentication required",
    };
  }

  const auth = await getStoredAuth();

  if (!auth.complianceToken) {
    return {
      ok: false,
      authRequired: true,
      error: "Authentication required",
    };
  }

  return {
    ok: true,
    complianceToken: auth.complianceToken,
  };
}

async function callComplianceApi(path, body, allowRetry = true) {
  try {
    const tokenState = await ensureComplianceToken();

    if (!tokenState.ok) {
      return {
        ok: false,
        status: 401,
        authRequired: true,
        error: tokenState.error || "Authentication required",
        errorType: "auth",
      };
    }

    const url = `${API_BASE_URL}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenState.complianceToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const parsed = await parseResponse(res);

    if (parsed.status === 401 && allowRetry) {
      const refreshed = await refreshAndIssueExtensionToken();

      if (!refreshed.ok) {
        return {
          ok: false,
          status: 401,
          authRequired: true,
          error: refreshed.error || "Authentication required",
          errorType: "auth",
        };
      }

      return callComplianceApi(path, body, false);
    }

    const errorType = parsed.ok ? null
      : parsed.status >= 500 ? "server"
      : parsed.status === 403 ? "forbidden"
      : parsed.status === 401 ? "auth"
      : "api";

    return {
      ok: parsed.ok,
      status: parsed.status,
      body: parsed.text,
      json: parsed.json,
      error: parsed.ok ? null : getErrorMessage(parsed, "Request failed"),
      errorType,
    };
  } catch (err) {
    console.error("callComplianceApi failed:", path, err);
    const isTimeout = err?.name === "AbortError";
    return {
      ok: false,
      error: isTimeout ? "Request timed out (15s). Check your connection." : (err?.message || String(err)),
      errorType: isTimeout ? "timeout" : "network",
    };
  }
}

async function getAuthState() {
  const { complianceToken, user, lastEmail } = await getStoredAuth();

  return {
    ok: true,
    authenticated: !!complianceToken,
    user: user || null,
    lastEmail: lastEmail || "",
  };
}

async function handleCaseContext(rawPayload) {
  const payload = buildSafeCasePayload(rawPayload || {});
  const effectiveCaseId = payload.caseId || payload.recordId || null;

  if (!effectiveCaseId) {
    return {
      ok: false,
      error: "No caseId or recordId in payload",
    };
  }

  const tokenState = await ensureComplianceToken();

  if (!tokenState.ok) {
    return {
      ok: false,
      authRequired: true,
      error: tokenState.error || "Authentication required",
    };
  }

  // Run case-context (storage) and analyze (AI) in parallel — they are independent
  const [caseContextResult, analyzeResult] = await Promise.all([
    callComplianceApi("/case-context", { caseId: effectiveCaseId, context: payload }),
    callComplianceApi("/analyze", { caseId: effectiveCaseId, payload }),
  ]);

  if (caseContextResult.authRequired || analyzeResult.authRequired) {
    return {
      ok: false,
      authRequired: true,
      error: caseContextResult.error || analyzeResult.error || "Authentication required",
    };
  }

const materialQueries = extractPartNumbersForLookup(analyzeResult, payload);
const requestedRegulations = extractRequestedRegulations(analyzeResult);

  let componentSuppliersResult = {
    ok: true,
    status: 200,
    body: "",
    json: {
      ok: true,
      total: 0,
      results: [],
    },
    error: null,
  };

if (materialQueries.length > 0) {
  componentSuppliersResult = await callComplianceApi("/material-suppliers", {
    caseId: effectiveCaseId,
    queries: materialQueries,
    requestedRegulations,
  });

    if (componentSuppliersResult.authRequired) {
      return {
        ok: false,
        authRequired: true,
        error: componentSuppliersResult.error || "Authentication required",
      };
    }
  }

  return {
    ok: analyzeResult.ok && componentSuppliersResult.ok,
    caseContextResult,
    analyzeResult,
    componentSuppliersResult,
  };
}

async function handleAddStatement(payload) {
  const result = await callComplianceApi("/add-statement", payload);

  if (result.authRequired) {
    return { ok: false, authRequired: true, error: result.error || "Authentication required" };
  }

  return {
    ok: result.ok,
    result: result.json,
    error: result.error,
  };
}

async function handleFetchRegulations() {
  const result = await callComplianceApi("/regulations", {});

  if (result.authRequired) {
    return { ok: false, authRequired: true, error: "Authentication required" };
  }

  return {
    ok: result.ok,
    regulations: result.json?.regulations || [],
    error: result.error,
  };
}

async function handleSearchSuppliers(payload) {
  const result = await callComplianceApi("/suppliers-search", {
    q: payload?.q || "",
  });

  if (result.authRequired) {
    return { ok: false, authRequired: true, error: "Authentication required" };
  }

  return {
    ok: result.ok,
    suppliers: result.json?.suppliers || [],
    error: result.error,
  };
}

async function handleAddRegulation(payload) {
  const result = await callComplianceApi("/add-regulation", payload);

  if (result.authRequired) {
    return { ok: false, authRequired: true, error: "Authentication required" };
  }

  return {
    ok: result.ok,
    result: result.json,
    error: result.json?.error || result.error,
  };
}

async function callComplianceApiMethod(method, path, body = null, allowRetry = true) {
  try {
    const tokenState = await ensureComplianceToken();

    if (!tokenState.ok) {
      return { ok: false, status: 401, authRequired: true, error: tokenState.error || "Authentication required", errorType: "auth" };
    }

    const url = `${API_BASE_URL}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const fetchOptions = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenState.complianceToken}`,
      },
      signal: controller.signal,
    };

    if (body !== null && method !== "GET") {
      fetchOptions.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(url, fetchOptions);
    } finally {
      clearTimeout(timer);
    }

    const parsed = await parseResponse(res);

    if (parsed.status === 401 && allowRetry) {
      const refreshed = await refreshAndIssueExtensionToken();
      if (!refreshed.ok) {
        return { ok: false, status: 401, authRequired: true, error: refreshed.error || "Authentication required", errorType: "auth" };
      }
      return callComplianceApiMethod(method, path, body, false);
    }

    const errorType = parsed.ok ? null
      : parsed.status >= 500 ? "server"
      : parsed.status === 403 ? "forbidden"
      : parsed.status === 401 ? "auth"
      : "api";

    return {
      ok: parsed.ok,
      status: parsed.status,
      json: parsed.json,
      error: parsed.ok ? null : getErrorMessage(parsed, "Request failed"),
      errorType,
    };
  } catch (err) {
    console.error("callComplianceApiMethod failed:", method, path, err);
    const isTimeout = err?.name === "AbortError";
    return {
      ok: false,
      error: isTimeout ? "Request timed out (15s). Check your connection." : (err?.message || String(err)),
      errorType: isTimeout ? "timeout" : "network",
    };
  }
}

async function handleGetOutreach(payload) {
  const params = new URLSearchParams();
  if (payload?.supplierId) params.set("supplierId", payload.supplierId);
  if (payload?.caseId) params.set("caseId", payload.caseId);
  if (payload?.status) params.set("status", payload.status);

  const query = params.toString() ? `?${params.toString()}` : "";
  const result = await callComplianceApiMethod("GET", `/outreach${query}`);

  if (result.authRequired) {
    return { ok: false, authRequired: true, error: result.error || "Authentication required" };
  }

  return {
    ok: result.ok,
    records: result.json?.records || [],
    total: result.json?.total || 0,
    error: result.error,
  };
}

async function handleCreateOutreach(payload) {
  const result = await callComplianceApiMethod("POST", "/outreach", payload);

  if (result.authRequired) {
    return { ok: false, authRequired: true, error: result.error || "Authentication required" };
  }

  return {
    ok: result.ok,
    record: result.json?.record || null,
    error: result.json?.error || result.error,
  };
}

async function handleUpdateOutreach(payload) {
  const { id, ...update } = payload || {};

  if (!id) return { ok: false, error: "id is required" };

  const result = await callComplianceApiMethod("PATCH", `/outreach/${id}`, update);

  if (result.authRequired) {
    return { ok: false, authRequired: true, error: result.error || "Authentication required" };
  }

  return {
    ok: result.ok,
    record: result.json?.record || null,
    error: result.json?.error || result.error,
  };
}

async function handleDeleteOutreach(payload) {
  const { id } = payload || {};

  if (!id) return { ok: false, error: "id is required" };

  const result = await callComplianceApiMethod("DELETE", `/outreach/${id}`);

  if (result.authRequired) {
    return { ok: false, authRequired: true, error: result.error || "Authentication required" };
  }

  return {
    ok: result.ok,
    error: result.json?.error || result.error,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Outreach reminders (chrome.alarms + chrome.notifications)
// ─────────────────────────────────────────────────────────────────────────────

const REMINDERS_KEY = "outreachReminders";

async function handleSetOutreachReminder({ recordId, remindAt, supplierName, subject }) {
  if (!recordId || typeof recordId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(recordId)) {
    return { ok: false, error: "Invalid recordId format" };
  }
  if (!remindAt) return { ok: false, error: "Missing remindAt" };

  const when = new Date(remindAt).getTime();
  if (isNaN(when)) return { ok: false, error: "Invalid date format" };
  if (when <= Date.now()) return { ok: false, error: "Reminder date must be in the future" };
  if (when > Date.now() + 365 * 86400_000) return { ok: false, error: "Reminder date too far in the future (max 1 year)" };

  const alarms = await chrome.alarms.getAll();
  if (alarms.length >= 100) return { ok: false, error: "Too many reminders set. Please delete some reminders first." };

  const safeName = String(supplierName || "Unknown").slice(0, 200).trim();
  const safeSubject = String(subject || "Outreach follow-up").slice(0, 200).trim();

  const alarmName = `outreach_${recordId}`;
  chrome.alarms.create(alarmName, { when });

  const stored = await chrome.storage.local.get(REMINDERS_KEY);
  const reminders = stored[REMINDERS_KEY] || {};
  reminders[recordId] = { remindAt, supplierName: safeName, subject: safeSubject };
  await chrome.storage.local.set({ [REMINDERS_KEY]: reminders });

  return { ok: true };
}

async function handleCancelOutreachReminder({ recordId }) {
  if (!recordId) return { ok: false };
  chrome.alarms.clear(`outreach_${recordId}`);
  const stored = await chrome.storage.local.get(REMINDERS_KEY);
  const reminders = stored[REMINDERS_KEY] || {};
  delete reminders[recordId];
  await chrome.storage.local.set({ [REMINDERS_KEY]: reminders });
  return { ok: true };
}

async function handleGetOutreachReminders() {
  const stored = await chrome.storage.local.get(REMINDERS_KEY);
  return { ok: true, reminders: stored[REMINDERS_KEY] || {} };
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("outreach_")) return;
  const recordId = alarm.name.replace("outreach_", "");
  const stored = await chrome.storage.local.get(REMINDERS_KEY);
  const reminder = (stored[REMINDERS_KEY] || {})[recordId];
  if (!reminder) return;

  chrome.notifications.create(`outreach_notif_${recordId}`, {
    type: "basic",
    iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    title: "Outreach follow-up reminder",
    message: `${reminder.supplierName}: ${reminder.subject}`,
    priority: 1,
  });

  // Clean up the fired reminder
  const reminders = stored[REMINDERS_KEY] || {};
  delete reminders[recordId];
  await chrome.storage.local.set({ [REMINDERS_KEY]: reminders });
});

const ALLOWED_MESSAGE_TYPES = new Set([
  "SF_MATERIALS_LOOKUP", "SF_SUPPLIERS_LIBRARY", "AUTH_GET_STATE", "AUTH_LOGIN",
  "AUTH_LOGOUT", "SF_CASE_CONTEXT", "EXT_ADD_STATEMENT", "EXT_FETCH_REGULATIONS",
  "EXT_SEARCH_SUPPLIERS", "EXT_ADD_REGULATION", "EXT_GET_OUTREACH", "EXT_CREATE_OUTREACH",
  "EXT_UPDATE_OUTREACH", "EXT_DELETE_OUTREACH", "EXT_SAVE_COMPLIANCE_SNAPSHOT",
  "EXT_GET_COMPLIANCE_SNAPSHOTS", "EXT_SET_REMINDER", "EXT_CANCEL_REMINDER",
  "EXT_GET_REMINDERS", "EXT_ADD_SUPPLIER_CONTACT", "EXT_UPDATE_SUPPLIER_CONTACT",
  "EXT_DELETE_SUPPLIER_CONTACT",
]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "Unauthorized sender" });
    return false;
  }

  if (!ALLOWED_MESSAGE_TYPES.has(message?.type)) {
    sendResponse({ ok: false, error: "Invalid message type" });
    return false;
  }

  if (message?.type === "SF_MATERIALS_LOOKUP") {
  handleManualMaterialsLookup(message.payload || {}).then(sendResponse);
  return true;
}

  if (message?.type === "SF_SUPPLIERS_LIBRARY") {
    handleSuppliersLibraryLookup(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message?.type === "AUTH_GET_STATE") {
    getAuthState().then(sendResponse);
    return true;
  }

  if (message?.type === "AUTH_LOGIN") {
    loginAndIssueExtensionToken(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message?.type === "AUTH_LOGOUT") {
    clearStoredAuth({ keepLastEmail: true }).then(() =>
      sendResponse({
        ok: true,
        authenticated: false,
      })
    );
    return true;
  }

  if (message?.type === "SF_CASE_CONTEXT") {
    handleCaseContext(message.payload || {}).then(sendResponse);
    return true;
  }
  if (message?.type === "EXT_ADD_STATEMENT") {
    handleAddStatement(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message?.type === "EXT_FETCH_REGULATIONS") {
    handleFetchRegulations().then(sendResponse);
    return true;
  }

  if (message?.type === "EXT_SEARCH_SUPPLIERS") {
    handleSearchSuppliers(message.payload || {}).then(sendResponse);
    return true;
  }

    if (message?.type === "EXT_ADD_REGULATION") {
    handleAddRegulation(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message?.type === "EXT_GET_OUTREACH") {
    handleGetOutreach(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message?.type === "EXT_CREATE_OUTREACH") {
    handleCreateOutreach(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message?.type === "EXT_UPDATE_OUTREACH") {
    handleUpdateOutreach(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message?.type === "EXT_DELETE_OUTREACH") {
    handleDeleteOutreach(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message?.type === "EXT_SAVE_COMPLIANCE_SNAPSHOT") {
    handleSaveComplianceSnapshot(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message?.type === "EXT_GET_COMPLIANCE_SNAPSHOTS") {
    handleGetComplianceSnapshots().then(sendResponse);
    return true;
  }

  if (message?.type === "EXT_SET_REMINDER") {
    handleSetOutreachReminder(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message?.type === "EXT_CANCEL_REMINDER") {
    handleCancelOutreachReminder(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message?.type === "EXT_GET_REMINDERS") {
    handleGetOutreachReminders().then(sendResponse);
    return true;
  }

  if (message?.type === "EXT_ADD_SUPPLIER_CONTACT") {
    const { supplierId, ...contactData } = message.payload || {};
    try {
      const safeId = sanitizeId(supplierId);
      callComplianceApiMethod("POST", `/suppliers/${safeId}/contacts`, contactData)
        .then(async (result) => {
          if (result.ok) await chrome.storage.local.remove("suppliersLibraryCache");
          sendResponse(result);
        });
    } catch {
      sendResponse({ ok: false, error: "Invalid supplierId" });
    }
    return true;
  }

  if (message?.type === "EXT_UPDATE_SUPPLIER_CONTACT") {
    const { supplierId, contactId, ...contactData } = message.payload || {};
    try {
      const safeSupId = sanitizeId(supplierId);
      const safeConId = sanitizeId(contactId);
      callComplianceApiMethod("PATCH", `/suppliers/${safeSupId}/contacts/${safeConId}`, contactData)
        .then(async (result) => {
          if (result.ok) await chrome.storage.local.remove("suppliersLibraryCache");
          sendResponse(result);
        });
    } catch {
      sendResponse({ ok: false, error: "Invalid supplierId or contactId" });
    }
    return true;
  }

  if (message?.type === "EXT_DELETE_SUPPLIER_CONTACT") {
    const { supplierId, contactId } = message.payload || {};
    try {
      const safeSupId = sanitizeId(supplierId);
      const safeConId = sanitizeId(contactId);
      callComplianceApiMethod("DELETE", `/suppliers/${safeSupId}/contacts/${safeConId}`, {})
        .then(async (result) => {
          if (result.ok) await chrome.storage.local.remove("suppliersLibraryCache");
          sendResponse(result);
        });
    } catch {
      sendResponse({ ok: false, error: "Invalid supplierId or contactId" });
    }
    return true;
  }
});