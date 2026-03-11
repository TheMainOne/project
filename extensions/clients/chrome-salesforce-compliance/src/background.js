// const API_BASE_URL = "https://cloudcompliance.duckdns.org/api/compliance/ext";
const API_BASE_URL = "http://localhost:3000/api/compliance/ext";

console.log("BACKGROUND FILE LOADED");
console.log("API_BASE_URL =", API_BASE_URL);

// helpers
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

// helpers

async function getAuthToken() {
  const { complianceToken } = await chrome.storage.local.get(["complianceToken"]);
  console.log("TOKEN FOUND:", !!complianceToken);
  return complianceToken || null;
}

async function callComplianceApi(path, body) {
  try {
    const token = await getAuthToken();

    if (!token) {
      console.warn("No complianceToken found in chrome.storage.local");
      return { ok: false, error: "No token" };
    }

    const url = `${API_BASE_URL}${path}`;
    console.log("CALLING API:", url, body);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log("API RESPONSE:", path, res.status, text);

let json = null;

try {
  json = JSON.parse(text);
} catch {
  json = null;
}

return {
  ok: res.ok,
  status: res.status,
  body: text,
  json,
};
  } catch (err) {
    console.error("callComplianceApi failed:", path, err);
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("BACKGROUND RECEIVED MESSAGE:", message);

  if (message?.type !== "SF_CASE_CONTEXT") {
    return;
  }

  const payload = buildSafeCasePayload(message.payload || {});
  console.log("PAYLOAD FROM CONTENT SCRIPT:", payload);

  const effectiveCaseId = payload.caseId || payload.recordId || null;

  if (!effectiveCaseId) {
    console.warn("Skipping API calls: no caseId/recordId in payload");
    sendResponse({
      ok: false,
      error: "No caseId or recordId in payload",
    });
    return true;
  }

  (async () => {
    const caseContextResult = await callComplianceApi("/case-context", {
      caseId: effectiveCaseId,
      context: payload,
    });

    const analyzeResult = await callComplianceApi("/analyze", {
      caseId: effectiveCaseId,
      payload,
    });

    sendResponse({
      ok: true,
      caseContextResult,
      analyzeResult,
    });
  })();

  return true;
});