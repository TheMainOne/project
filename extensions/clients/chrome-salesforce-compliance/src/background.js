const API_BASE_URL = "https://cloudcompliance.duckdns.org/api/compliance/ext";

async function getAuthToken() {
  const { complianceToken } = await chrome.storage.local.get(["complianceToken"]);
  return complianceToken || null;
}

async function callComplianceApi(path, body) {
  const token = await getAuthToken();
  if (!token) return;

  await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "SF_CASE_CONTEXT") return;

  const payload = message.payload || {};
  callComplianceApi("/case-context", {
    caseId: payload.caseId,
    context: payload,
  });

  callComplianceApi("/analyze", {
    caseId: payload.caseId,
    payload,
  });
});
