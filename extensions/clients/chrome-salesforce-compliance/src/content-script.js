console.log("CONTENT SCRIPT LOADED:", window.location.href);

let lastSeenUrl = window.location.href;
let lastSentCaseUrl = null;

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
      createInfoRow("Error", analyzeJson?.error || response?.analyzeResult?.status || "Unknown error")
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
    body.appendChild(createListRow("Notes", analysis.notes));
  }
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

function getRecordIdFromUrl() {
  const match = window.location.pathname.match(/\/lightning\/r\/Case\/([^/]+)\/view/);
  return match ? match[1] : null;
}

function trySendCaseContext() {
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

  chrome.runtime.sendMessage({ type: "SF_CASE_CONTEXT", payload }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("sendMessage error:", chrome.runtime.lastError.message);
      return;
    }

    console.log("background response:", response);

    const currentRecordId = getRecordIdFromUrl();

    if (!currentRecordId || payload.recordId !== currentRecordId) {
      console.log("Skipping toast update because payload does not match current active case");
      return;
    }

    if (response?.ok) {
      renderCaseToastAnalysis(payload, response);
    } else {
      const toast = getOrCreateCaseToast();
      const body = toast.querySelector("#sf-compliance-case-toast-body");
      if (body) {
        clearToastBody(body);
        body.appendChild(createInfoRow("Case Number", payload.caseId));
        body.appendChild(createInfoRow("Subject", payload.subject));
        body.appendChild(createInfoRow("Status", "Analysis failed"));
      }
    }
  });
}

function scheduleChecks() {
  setTimeout(trySendCaseContext, 500);
  setTimeout(trySendCaseContext, 1500);
  setTimeout(trySendCaseContext, 3000);
  setTimeout(trySendCaseContext, 5000);
}

function handlePotentialRouteChange() {
  const currentUrl = window.location.href;

  if (currentUrl !== lastSeenUrl) {
    console.log("Route changed:", currentUrl);
    lastSeenUrl = currentUrl;
    lastSentCaseUrl = null;
    scheduleChecks();
  }
}

scheduleChecks();

const observer = new MutationObserver(() => {
  handlePotentialRouteChange();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

window.addEventListener("popstate", handlePotentialRouteChange);
window.addEventListener("hashchange", handlePotentialRouteChange);