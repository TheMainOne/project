const API_BASE_URL = "https://cloudcompliance.duckdns.org/api/compliance/ext";
const AUTH_BASE_URL = "https://cloudcompliance.duckdns.org/api/auth";

// local dev:
// const API_BASE_URL = "http://localhost:3000/api/compliance/ext";
// const AUTH_BASE_URL = "http://localhost:3000/api/auth";

const STORAGE_KEYS = {
  complianceToken: "complianceToken",
  refreshToken: "authRefreshToken",
  user: "authUser",
  lastEmail: "authLastEmail",
};

console.log("BACKGROUND FILE LOADED");
console.log("API_BASE_URL =", API_BASE_URL);
console.log("AUTH_BASE_URL =", AUTH_BASE_URL);

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

async function getStoredAuth() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.complianceToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.user,
    STORAGE_KEYS.lastEmail,
  ]);

  return {
    complianceToken: result[STORAGE_KEYS.complianceToken] || null,
    refreshToken: result[STORAGE_KEYS.refreshToken] || null,
    user: result[STORAGE_KEYS.user] || null,
    lastEmail: result[STORAGE_KEYS.lastEmail] || "",
  };
}

async function setStoredAuth({ complianceToken, refreshToken, user, lastEmail }) {
  const payload = {};

  if (typeof complianceToken === "string") {
    payload[STORAGE_KEYS.complianceToken] = complianceToken;
  }

  if (typeof refreshToken === "string") {
    payload[STORAGE_KEYS.refreshToken] = refreshToken;
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
  const keysToRemove = [
    STORAGE_KEYS.complianceToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.user,
  ];

  if (!keepLastEmail) {
    keysToRemove.push(STORAGE_KEYS.lastEmail);
  }

  await chrome.storage.local.remove(keysToRemove);
}

async function postJson(url, body, token = null) {
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
      };
    }

    const url = `${API_BASE_URL}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenState.complianceToken}`,
      },
      body: JSON.stringify(body),
    });

    const parsed = await parseResponse(res);

    console.log("API RESPONSE:", path, parsed.status, parsed.text);

    if (parsed.status === 401 && allowRetry) {
      const refreshed = await refreshAndIssueExtensionToken();

      if (!refreshed.ok) {
        return {
          ok: false,
          status: 401,
          authRequired: true,
          error: refreshed.error || "Authentication required",
        };
      }

      return callComplianceApi(path, body, false);
    }

    return {
      ok: parsed.ok,
      status: parsed.status,
      body: parsed.text,
      json: parsed.json,
      error: parsed.ok ? null : getErrorMessage(parsed, "Request failed"),
    };
  } catch (err) {
    console.error("callComplianceApi failed:", path, err);
    return {
      ok: false,
      error: err?.message || String(err),
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

  const caseContextResult = await callComplianceApi("/case-context", {
    caseId: effectiveCaseId,
    context: payload,
  });

  if (caseContextResult.authRequired) {
    return {
      ok: false,
      authRequired: true,
      error: caseContextResult.error || "Authentication required",
    };
  }

  const analyzeResult = await callComplianceApi("/analyze", {
    caseId: effectiveCaseId,
    payload,
  });

  if (analyzeResult.authRequired) {
    return {
      ok: false,
      authRequired: true,
      error: analyzeResult.error || "Authentication required",
    };
  }

  return {
    ok: analyzeResult.ok,
    caseContextResult,
    analyzeResult,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("BACKGROUND RECEIVED MESSAGE:", message);

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
});