import axios from "axios";

const API_VERSION = process.env.SALESFORCE_API_VERSION || "v61.0";

function getConfig() {
  const baseUrl = process.env.SALESFORCE_BASE_URL;
  const token = process.env.SALESFORCE_ACCESS_TOKEN;

  if (!baseUrl || !token) {
    throw new Error("Salesforce adapter is not configured. Set SALESFORCE_BASE_URL and SALESFORCE_ACCESS_TOKEN");
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

async function sfRequest(path, params = {}) {
  const { baseUrl, token } = getConfig();
  const url = `${baseUrl}/services/data/${API_VERSION}${path}`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    params,
    timeout: 15000,
  });
  return response.data;
}

export async function fetchCase(caseId) {
  if (!caseId) throw new Error("caseId is required");

  return sfRequest(`/sobjects/Case/${encodeURIComponent(caseId)}`);
}

export async function fetchCaseAttachments(caseId) {
  if (!caseId) throw new Error("caseId is required");

  const safeCaseId = String(caseId).replace(/'/g, "\\'");
  const query = `SELECT ContentDocumentId, ContentDocument.Title, ContentDocument.FileType, ContentDocument.LatestPublishedVersionId, ContentDocument.CreatedDate FROM ContentDocumentLink WHERE LinkedEntityId = '${safeCaseId}'`;

  const result = await sfRequest("/query", { q: query });
  return (result.records || []).map((record) => ({
    contentDocumentId: record.ContentDocumentId,
    title: record.ContentDocument?.Title || null,
    fileType: record.ContentDocument?.FileType || null,
    latestVersionId: record.ContentDocument?.LatestPublishedVersionId || null,
    createdDate: record.ContentDocument?.CreatedDate || null,
  }));
}
