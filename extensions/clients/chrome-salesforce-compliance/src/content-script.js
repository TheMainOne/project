console.log("CONTENT SCRIPT LOADED:", window.location.href);

let lastSeenUrl = window.location.href;
let lastSentCaseUrl = null;
let activeCaseToastTab = "overview";
let authState = {
  authenticated: false,
  user: null,
  lastEmail: "",
};
let currentCaseAnalysisState = {
  payload: null,
  analysis: null,
  response: null,
  overriddenMaterials: null,
  lookupResults: null,
  editingMaterialIndex: null,

  manualLookupInput: "",
  manualLookupResults: null,
  manualLookupLoading: false,

  suppliersLibrary: null,
  suppliersLibraryLoading: false,
  suppliersLibraryError: null,
  suppliersLibrarySearch: "",
  selectedSupplierLibraryId: null,
};

let activeCaseRequestToken = 0;
let lastCompletedRecordId = null;
let isCaseToastExpanded = false;

function resetCaseAnalysisState() {
  currentCaseAnalysisState = {
    payload: null,
    analysis: null,
    response: null,
    overriddenMaterials: null,
    lookupResults: null,
    editingMaterialIndex: null,

    manualLookupInput: "",
    manualLookupResults: null,
    manualLookupLoading: false,

    suppliersLibrary: null,
    suppliersLibraryLoading: false,
    suppliersLibraryError: null,
    suppliersLibrarySearch: "",
    selectedSupplierLibraryId: null,
  };
}

function removeCaseToast() {
  const toast = document.getElementById("sf-compliance-case-toast");
  if (toast) toast.remove();
}

function isProbablyStaleDomForNewCase(payload) {
  const previousPayload = currentCaseAnalysisState?.payload;

  if (!previousPayload) return false;
  if (!payload?.recordId || !previousPayload?.recordId) return false;
  if (payload.recordId === previousPayload.recordId) return false;

  const sameCaseNumber =
    String(payload.caseId || "").trim() &&
    String(previousPayload.caseId || "").trim() &&
    String(payload.caseId).trim() === String(previousPayload.caseId).trim();

  const sameSubject =
    String(payload.subject || "").trim() &&
    String(previousPayload.subject || "").trim() &&
    String(payload.subject).trim() === String(previousPayload.subject).trim();

  const sameDescription =
    String(payload.description || "").trim() &&
    String(previousPayload.description || "").trim() &&
    String(payload.description).trim() === String(previousPayload.description).trim();

  return sameCaseNumber || (sameSubject && sameDescription);
}

function normalizeText(value, maxLength = 2000) {
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  return cleaned.slice(0, maxLength);
}

function normalizeRichText(value, maxLength = 4000) {
  if (typeof value !== "string") return null;

  const cleaned = value
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

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

function rerenderCurrentCaseToast() {
  if (!currentCaseAnalysisState.payload || !currentCaseAnalysisState.response) return;
  renderCaseToastAnalysis(
    currentCaseAnalysisState.payload,
    currentCaseAnalysisState.response
  );
}

async function applyManualMaterialUpdate(materialIndex, newValue) {
  const normalized = String(newValue || "").trim().toUpperCase();

  if (!normalized) return;

  const materials = Array.isArray(currentCaseAnalysisState.overriddenMaterials)
    ? [...currentCaseAnalysisState.overriddenMaterials]
    : [];

  if (!materials[materialIndex]) return;

  materials[materialIndex] = {
    ...materials[materialIndex],
    part_number: normalized,
  };

  currentCaseAnalysisState.overriddenMaterials = materials;
  currentCaseAnalysisState.editingMaterialIndex = null;

  const lookupQueries = materials
    .map((item) => String(item?.part_number || "").trim())
    .filter(Boolean);

  const lookupResponse = await sendMessageAsync({
    type: "SF_MATERIALS_LOOKUP",
    payload: {
      caseId: currentCaseAnalysisState.payload?.caseId,
      queries: lookupQueries,
      requestedRegulations: Array.isArray(currentCaseAnalysisState.analysis?.requested_regulations)
        ? currentCaseAnalysisState.analysis.requested_regulations
        : [],
    },
  });

  if (lookupResponse?.ok) {
    currentCaseAnalysisState.lookupResults = lookupResponse.componentSuppliersResult;
  }

  renderCaseToastAnalysis(
    currentCaseAnalysisState.payload,
    currentCaseAnalysisState.response
  );
}

function parseManualLookupInput(rawValue) {
  return Array.from(
    new Set(
      String(rawValue || "")
        .split(/[\n,;\t ]+/)
        .map((item) => String(item || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

async function runManualLookup() {
  const queries = parseManualLookupInput(currentCaseAnalysisState.manualLookupInput);

  if (!queries.length) {
    currentCaseAnalysisState.manualLookupResults = {
      error: "Please enter at least one part number.",
    };

    renderCaseToastAnalysis(
      currentCaseAnalysisState.payload || {
        caseId: "Manual Lookup",
        subject: "Manual supplier lookup",
      },
      currentCaseAnalysisState.response || {}
    );
    return;
  }

  currentCaseAnalysisState.manualLookupLoading = true;
  currentCaseAnalysisState.manualLookupResults = null;

  renderCaseToastAnalysis(
    currentCaseAnalysisState.payload || {
      caseId: "Manual Lookup",
      subject: "Manual supplier lookup",
    },
    currentCaseAnalysisState.response || {}
  );

  const response = await sendMessageAsync({
    type: "SF_MATERIALS_LOOKUP",
    payload: {
      caseId:
        currentCaseAnalysisState.payload?.caseId ||
        currentCaseAnalysisState.payload?.recordId ||
        "manual-lookup",
      queries,
      requestedRegulations: Array.isArray(currentCaseAnalysisState.analysis?.requested_regulations)
        ? currentCaseAnalysisState.analysis.requested_regulations
        : [],
    },
  });

  currentCaseAnalysisState.manualLookupLoading = false;

  if (response?.ok) {
    currentCaseAnalysisState.manualLookupResults = response.componentSuppliersResult;
  } else {
    currentCaseAnalysisState.manualLookupResults = {
      error: response?.error || "Lookup failed",
    };
  }

  renderCaseToastAnalysis(
    currentCaseAnalysisState.payload || {
      caseId: "Manual Lookup",
      subject: "Manual supplier lookup",
    },
    currentCaseAnalysisState.response || {}
  );
}

async function loadSuppliersLibrary(search = "") {
  currentCaseAnalysisState.suppliersLibraryLoading = true;
  currentCaseAnalysisState.suppliersLibraryError = null;
  rerenderCurrentCaseToast();

  const response = await sendMessageAsync({
    type: "SF_SUPPLIERS_LIBRARY",
    payload: { search },
  });

  if (!response?.ok) {
    currentCaseAnalysisState.suppliersLibraryLoading = false;
    currentCaseAnalysisState.suppliersLibraryError =
      response?.error || "Failed to load suppliers library";
    rerenderCurrentCaseToast();
    return;
  }

  const libraryJson =
    response?.suppliersLibraryResult?.json ||
    safeParseJson(response?.suppliersLibraryResult?.body || "") ||
    {};

  const suppliers = Array.isArray(libraryJson?.suppliers) ? libraryJson.suppliers : [];

  currentCaseAnalysisState.suppliersLibrary = {
    ok: true,
    total:
      typeof libraryJson?.total === "number" ? libraryJson.total : suppliers.length,
    suppliers,
  };
  currentCaseAnalysisState.suppliersLibraryLoading = false;
  currentCaseAnalysisState.suppliersLibraryError = null;

  const selectedStillExists = suppliers.some(
    (item) =>
      String(item?.supplierId || "") ===
      String(currentCaseAnalysisState.selectedSupplierLibraryId || "")
  );

  if (!selectedStillExists) {
    currentCaseAnalysisState.selectedSupplierLibraryId =
      suppliers[0]?.supplierId || null;
  }

  rerenderCurrentCaseToast();
}

function createManualLookupCard(partNumber, supplierLookup) {
  return createMaterialSupplierCard(
    {
      part_number: partNumber,
      description: "",
    },
    supplierLookup,
    -1
  );
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
    if (
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      typeof chrome.runtime.sendMessage !== "function"
    ) {
      resolve({
        ok: false,
        error: "Extension runtime is unavailable. Reload the extension and page.",
      });
      return;
    }

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

function applyCaseToastLayout(toast) {
  if (!toast) return;

  if (isCaseToastExpanded) {
    Object.assign(toast.style, {
      top: "12px",
      right: "12px",
      left: "12px",
      width: "auto",
      minWidth: "0",
      maxWidth: "none",
      height: "calc(100vh - 24px)",
      maxHeight: "calc(100vh - 24px)",
      borderRadius: "16px",
    });
  } else {
    toast.style.left = "";
    toast.style.height = "";
    Object.assign(toast.style, {
      top: "16px",
      right: "16px",
      width: "860px",
      minWidth: "420px",
      maxWidth: "calc(100vw - 32px)",
      maxHeight: "82vh",
      borderRadius: "12px",
    });
  }
}

function toggleCaseToastExpanded() {
  const toast = document.getElementById("sf-compliance-case-toast");
  if (!toast) return;

  isCaseToastExpanded = !isCaseToastExpanded;
  applyCaseToastLayout(toast);

  const expandBtn = document.getElementById("sf-compliance-expand-btn");
  if (expandBtn) {
    expandBtn.textContent = isCaseToastExpanded ? "⤢" : "⛶";
    expandBtn.title = isCaseToastExpanded ? "Collapse" : "Expand";
  }

  const body = toast.querySelector("#sf-compliance-case-toast-body");
  if (body) {
    body.scrollTop = 0;
  }
}

function getOrCreateCaseToast() {
  let toast = document.getElementById("sf-compliance-case-toast");

  if (toast) {
    hideLauncher();
    return toast;
  }

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
    minWidth: "420px",
    width: "860px",
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "82vh",
    fontSize: "13px",
    lineHeight: "1.45",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    paddingTop: "8px",
  });

  const header = document.createElement("div");
  header.id = "sf-compliance-case-toast-header";

  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 14px 10px 14px",
    marginBottom: "0",
  });

  const title = document.createElement("div");
  title.textContent = "Compliance Assistant";
  title.style.fontWeight = "700";

  const headerActions = document.createElement("div");
  Object.assign(headerActions.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  });

  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.id = "sf-compliance-expand-btn";
  expandBtn.textContent = isCaseToastExpanded ? "⤢" : "⛶";
  expandBtn.title = isCaseToastExpanded ? "Collapse" : "Expand";

  Object.assign(expandBtn.style, {
    background: "#ffffff",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
    lineHeight: "1",
    width: "32px",
    height: "32px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
  });

  expandBtn.addEventListener("click", () => {
    toggleCaseToastExpanded();
  });

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "×";

  Object.assign(closeBtn.style, {
    background: "#ffffff",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    fontSize: "16px",
    cursor: "pointer",
    lineHeight: "1",
    width: "32px",
    height: "32px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
  });

  closeBtn.addEventListener("click", () => {
    toast.remove();
    if (isCaseRecordPage()) {
      showLauncher();
      updateLauncherState();
    }
  });

  headerActions.appendChild(expandBtn);
  headerActions.appendChild(closeBtn);

  header.appendChild(title);
  header.appendChild(headerActions);

  const tabs = document.createElement("div");
  tabs.id = "sf-compliance-case-toast-tabs";

  Object.assign(tabs.style, {
    display: "flex",
    gap: "8px",
    padding: "0 14px 10px 14px",
    borderBottom: "1px solid #e5e7eb",
  });

  const overviewTab = document.createElement("button");
  overviewTab.type = "button";
  overviewTab.id = "sf-compliance-tab-overview";
  overviewTab.textContent = "Overview";

  const materialsTab = document.createElement("button");
  materialsTab.type = "button";
  materialsTab.id = "sf-compliance-tab-materials";
  materialsTab.textContent = "Materials";

  const suppliersTab = document.createElement("button");
  suppliersTab.type = "button";
  suppliersTab.id = "sf-compliance-tab-suppliers";
  suppliersTab.textContent = "Suppliers";

  const lookupTab = document.createElement("button");
  lookupTab.type = "button";
  lookupTab.id = "sf-compliance-tab-lookup";
  lookupTab.textContent = "Lookup";

  [overviewTab, materialsTab, suppliersTab, lookupTab].forEach((btn) => {
    Object.assign(btn.style, {
      border: "1px solid #d0d7de",
      background: "#ffffff",
      color: "#111111",
      borderRadius: "8px",
      padding: "6px 10px",
      cursor: "pointer",
      fontWeight: "600",
    });
  });

  const body = document.createElement("div");
  body.id = "sf-compliance-case-toast-body";

  Object.assign(body.style, {
    padding: "14px 16px 18px 16px",
    overflowY: "auto",
    flex: "1",
    background: "#ffffff",
  });

  tabs.appendChild(overviewTab);
  tabs.appendChild(materialsTab);
  tabs.appendChild(suppliersTab);
  tabs.appendChild(lookupTab);

  toast.appendChild(header);
  toast.appendChild(tabs);
  toast.appendChild(body);

  hideLauncher();
  document.body.appendChild(toast);
  applyCaseToastLayout(toast);

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

function getCoverageBadgeStyle(status) {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "covered") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
      label: "Covered",
    };
  }

  if (normalized === "partial") {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fcd34d",
      label: "Partial",
    };
  }

  if (normalized === "non_compliant") {
    return {
      background: "#fee2e2",
      color: "#991b1b",
      border: "1px solid #fca5a5",
      label: "Non-compliant",
    };
  }

  if (normalized === "expired") {
    return {
      background: "#f3f4f6",
      color: "#4b5563",
      border: "1px solid #d1d5db",
      label: "Expired",
    };
  }

  if (normalized === "informational") {
    return {
      background: "#e0f2fe",
      color: "#075985",
      border: "1px solid #7dd3fc",
      label: "Informational",
    };
  }

  return {
    background: "#f3f4f6",
    color: "#4b5563",
    border: "1px solid #d1d5db",
    label: "Missing",
  };
}

function createCoverageBadge(status) {
  const badge = document.createElement("span");
  const style = getCoverageBadgeStyle(status);

  badge.textContent = style.label;

  Object.assign(badge.style, {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    background: style.background,
    color: style.color,
    border: style.border,
    whiteSpace: "nowrap",
  });

  return badge;
}

function getStatementUrl(assertion) {
  return (
    assertion?.document?.storage?.url ||
    assertion?.document?.url ||
    ""
  );
}

function createStatementOpenLink(url, label = "Open statement") {
  const link = document.createElement("a");
  link.href = url || "#";
  link.textContent = label;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  Object.assign(link.style, {
    display: "inline-flex",
    alignItems: "center",
    marginTop: "6px",
    fontSize: "13px",
    fontWeight: "600",
    color: url ? "#0176d3" : "#6b7280",
    textDecoration: url ? "none" : "none",
    cursor: url ? "pointer" : "default",
    opacity: url ? "1" : "0.65",
  });

  if (!url) {
    link.removeAttribute("href");
    link.addEventListener("click", (event) => event.preventDefault());
    link.textContent = "Statement link unavailable";
  }

  return link;
}

function getRegulationStatusIcon(status) {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "covered") return "✅";
  if (normalized === "partial") return "⚠";
  if (normalized === "non_compliant") return "❌";
  if (normalized === "expired") return "🕒";
  if (normalized === "informational") return "ℹ";
  return "❓";
}

function buildMaterialRegulationRows(supplierLookup) {
  const regulations = Array.isArray(supplierLookup?.coverage?.regulations)
    ? supplierLookup.coverage.regulations
    : [];

  return regulations.map((regItem) => {
    const supplierResults = Array.isArray(regItem?.supplierResults)
      ? regItem.supplierResults
      : [];

    const evidence = supplierResults
      .map((supplierResult) => {
        const assertion = supplierResult?.bestAssertion || null;
        const url = getStatementUrl(assertion);

        return {
          supplierName: supplierResult?.supplierName || "Unknown supplier",
          coverageStatus: supplierResult?.coverageStatus || regItem?.overallStatus || "missing",
          url,
          documentTitle:
            assertion?.document?.title ||
            assertion?.document?.fileName ||
            "",
          assertion,
        };
      });

    return {
      code: regItem?.regulation?.code || "UNKNOWN",
      name: regItem?.regulation?.name || regItem?.regulation?.code || "Unknown regulation",
      overallStatus: regItem?.overallStatus || "missing",
      evidence,
    };
  });
}

function createCompactRegulationBadge(regulationCode, status, url = "") {
  const badge = document.createElement("div");
  const style = getCoverageBadgeStyle(status);
  const icon = getRegulationStatusIcon(status);

  Object.assign(badge.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    background: style.background,
    color: style.color,
    border: style.border,
    whiteSpace: "nowrap",
  });

  const text = document.createElement("span");
  text.textContent = `${regulationCode} ${icon}`;
  badge.appendChild(text);

  if (url) {
    const link = document.createElement("a");
    link.href = url;
    link.textContent = "Open";
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    Object.assign(link.style, {
      color: style.color,
      textDecoration: "none",
      fontWeight: "700",
      borderLeft: `1px solid ${style.color}`,
      paddingLeft: "6px",
    });

    badge.appendChild(link);
  }

  return badge;
}

function createMaterialRegulationSummary(supplierLookup) {
  const rows = buildMaterialRegulationRows(supplierLookup);

  if (!rows.length) return null;

  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    marginTop: "12px",
    marginBottom: "10px",
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  });

  rows.forEach((row) => {
    const primaryEvidence = row.evidence.find((item) => item.url) || row.evidence[0] || null;
    wrapper.appendChild(
      createCompactRegulationBadge(
        row.code,
        row.overallStatus,
        primaryEvidence?.url || ""
      )
    );
  });

  return wrapper;
}

function createCompactSuppliersLine(supplierLookup) {
  const directSuppliers = Array.isArray(supplierLookup?.suppliers)
    ? supplierLookup.suppliers.filter(Boolean)
    : [];

  const componentSuppliers = Array.isArray(supplierLookup?.components)
    ? supplierLookup.components.flatMap((item) =>
        Array.isArray(item?.suppliers) ? item.suppliers : []
      )
    : [];

  const uniqueSuppliers = Array.from(
    new Set([...directSuppliers, ...componentSuppliers].map((item) => String(item || "").trim()).filter(Boolean))
  );

  if (!uniqueSuppliers.length) return null;

  const line = document.createElement("div");
  line.textContent = `Supplier: ${uniqueSuppliers.join(", ")}`;

  Object.assign(line.style, {
    fontSize: "12px",
    color: "#6b7280",
    lineHeight: "1.35",
    marginTop: "4px",
    marginBottom: "6px",
  });

  return line;
}

function createComponentRegulationSummary(supplierLookup) {
  const rows = buildMaterialRegulationRows(supplierLookup);

  if (!rows.length) return null;

  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    marginTop: "10px",
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  });

  rows.forEach((row) => {
    const primaryEvidence = row.evidence.find((item) => item.url) || row.evidence[0] || null;
    wrapper.appendChild(
      createCompactRegulationBadge(
        row.code,
        row.overallStatus,
        primaryEvidence?.url || ""
      )
    );
  });

  return wrapper;
}


function buildComponentSuppliersMap(response) {
  const results =
    response?.componentSuppliersResult?.json?.results ||
    [];

  const map = new Map();

  results.forEach((item) => {
    const key = String(item?.normalizedQuery || item?.query || "")
      .trim()
      .toUpperCase();

    if (!key) return;
    map.set(key, item);
  });

  return map;
}

function createCoverageSummaryBlock(response) {
  const summary =
    response?.componentSuppliersResult?.json?.coverageSummary || null;

  if (!summary || typeof summary !== "object") {
    return null;
  }

  const entries = Object.entries(summary);
  if (!entries.length) return null;

  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "8px";
  wrapper.style.marginBottom = "10px";
  wrapper.style.padding = "10px";
  wrapper.style.border = "1px solid #d8dee4";
  wrapper.style.borderRadius = "10px";
  wrapper.style.background = "#f6f8fa";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.marginBottom = "8px";
  title.textContent = "Case Regulation Summary";
  wrapper.appendChild(title);

  entries.forEach(([code, status]) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.marginTop = "6px";

    const label = document.createElement("div");
    label.style.fontWeight = "600";
    label.textContent = code;

    row.appendChild(label);
    row.appendChild(createCoverageBadge(status));
    wrapper.appendChild(row);
  });

  return wrapper;
}

function clearToastBody(body) {
  while (body.firstChild) {
    body.removeChild(body.firstChild);
  }
}

function setCaseToastTab(tabName) {
  if (tabName === "materials") {
    activeCaseToastTab = "materials";
  } else if (tabName === "suppliers") {
    activeCaseToastTab = "suppliers";
  } else if (tabName === "lookup") {
    activeCaseToastTab = "lookup";
  } else {
    activeCaseToastTab = "overview";
  }

  const overviewBtn = document.getElementById("sf-compliance-tab-overview");
  const materialsBtn = document.getElementById("sf-compliance-tab-materials");
  const suppliersBtn = document.getElementById("sf-compliance-tab-suppliers");
  const lookupBtn = document.getElementById("sf-compliance-tab-lookup");

  const applyActive = (btn, isActive) => {
    if (!btn) return;
    btn.style.background = isActive ? "#0176d3" : "#ffffff";
    btn.style.color = isActive ? "#ffffff" : "#111111";
    btn.style.borderColor = isActive ? "#0176d3" : "#d0d7de";
  };

  applyActive(overviewBtn, activeCaseToastTab === "overview");
  applyActive(materialsBtn, activeCaseToastTab === "materials");
  applyActive(suppliersBtn, activeCaseToastTab === "suppliers");
  applyActive(lookupBtn, activeCaseToastTab === "lookup");
}

function wireCaseToastTabs(renderFn) {
  const overviewBtn = document.getElementById("sf-compliance-tab-overview");
  const materialsBtn = document.getElementById("sf-compliance-tab-materials");
  const suppliersBtn = document.getElementById("sf-compliance-tab-suppliers");
  const lookupBtn = document.getElementById("sf-compliance-tab-lookup");

  if (overviewBtn) {
    overviewBtn.onclick = () => {
      activeCaseToastTab = "overview";
      renderFn();
    };
  }

  if (materialsBtn) {
    materialsBtn.onclick = () => {
      activeCaseToastTab = "materials";
      renderFn();
    };
  }

  if (suppliersBtn) {
    suppliersBtn.onclick = () => {
      activeCaseToastTab = "suppliers";
      renderFn();
    };
  }

  if (lookupBtn) {
    lookupBtn.onclick = () => {
      activeCaseToastTab = "lookup";
      renderFn();
    };
  }

  setCaseToastTab(activeCaseToastTab);
}

function createMaterialSupplierCard(materialItem, supplierLookup, materialIndex) {
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    marginTop: "12px",
    padding: "14px 14px 12px 14px",
    border: "1px solid #d9dee7",
    borderRadius: "14px",
    background: "#f8fafc",
  });

  const part = materialItem?.part_number || "N/A";
  const desc = materialItem?.description || "";

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "8px",
  });

  const left = document.createElement("div");
  left.style.flex = "1";

  if (currentCaseAnalysisState.editingMaterialIndex === materialIndex) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = part;

    Object.assign(input.style, {
      width: "100%",
      boxSizing: "border-box",
      padding: "8px 10px",
      border: "1px solid #cfd6e4",
      borderRadius: "10px",
      fontSize: "14px",
      fontWeight: "600",
      background: "#ffffff",
    });

    left.appendChild(input);
    header.appendChild(left);

    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "flex",
      gap: "8px",
      flexShrink: "0",
    });

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = "Apply";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";

    [applyBtn, cancelBtn].forEach((btn) => {
      Object.assign(btn.style, {
        border: "1px solid #cfd6e4",
        borderRadius: "10px",
        padding: "8px 12px",
        cursor: "pointer",
        background: "#ffffff",
        fontWeight: "600",
      });
    });

    applyBtn.onclick = () => applyManualMaterialUpdate(materialIndex, input.value);
    cancelBtn.onclick = () => {
      currentCaseAnalysisState.editingMaterialIndex = null;
      renderCaseToastAnalysis(
        currentCaseAnalysisState.payload,
        currentCaseAnalysisState.response
      );
    };

    actions.appendChild(applyBtn);
    actions.appendChild(cancelBtn);
    header.appendChild(actions);
  } else {
    const title = document.createElement("div");
    title.textContent = part;

    Object.assign(title.style, {
      fontSize: "18px",
      fontWeight: "800",
      lineHeight: "1.2",
      color: "#111827",
      marginBottom: desc ? "4px" : "0",
      letterSpacing: "-0.01em",
    });

    left.appendChild(title);

    if (desc) {
      const descLine = document.createElement("div");
      descLine.textContent = desc;
      Object.assign(descLine.style, {
        fontSize: "13px",
        color: "#4b5563",
        lineHeight: "1.4",
      });
      left.appendChild(descLine);
    }

    header.appendChild(left);

    if (materialIndex >= 0) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Edit";

      Object.assign(editBtn.style, {
        border: "1px solid #cfd6e4",
        borderRadius: "10px",
        padding: "8px 12px",
        cursor: "pointer",
        background: "#ffffff",
        fontWeight: "700",
        fontSize: "13px",
        minWidth: "70px",
        flexShrink: "0",
      });

      editBtn.onclick = () => {
        currentCaseAnalysisState.editingMaterialIndex = materialIndex;
        renderCaseToastAnalysis(
          currentCaseAnalysisState.payload,
          currentCaseAnalysisState.response
        );
      };

      header.appendChild(editBtn);
    }
  }

  wrapper.appendChild(header);

  if (!supplierLookup || !supplierLookup.found) {
    const notFound = document.createElement("div");
    notFound.textContent = "No component supplier data found in BOM.";
    Object.assign(notFound.style, {
      color: "#6b7280",
      fontSize: "13px",
      marginTop: "4px",
    });
    wrapper.appendChild(notFound);
    return wrapper;
  }

  const topMeta = document.createElement("div");
  Object.assign(topMeta.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
    marginBottom: "8px",
    fontSize: "12px",
    color: "#4b5563",
  });

  const visibleComponents = Array.isArray(supplierLookup.components)
    ? supplierLookup.components.filter((item) => !item?.isPackaging)
    : [];

  const metaItems = [
    `Matched by: ${supplierLookup.matchType || "N/A"}`,
    `Suppliers: ${supplierLookup.supplierCount || 0}`,
    `Components: ${visibleComponents.length}`,
  ];

  metaItems.forEach((textValue) => {
    const item = document.createElement("div");
    item.textContent = textValue;
    Object.assign(item.style, {
      padding: "4px 8px",
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: "999px",
    });
    topMeta.appendChild(item);
  });

  wrapper.appendChild(topMeta);

  const suppliersLine = createCompactSuppliersLine(supplierLookup);
  if (suppliersLine) {
    suppliersLine.style.marginTop = "2px";
    suppliersLine.style.marginBottom = "8px";
    wrapper.appendChild(suppliersLine);
  }

  const regulationSummary = createMaterialRegulationSummary(supplierLookup);
  if (regulationSummary) {
    wrapper.appendChild(regulationSummary);
  }

  const bomSection = createBomSection(supplierLookup);
  wrapper.appendChild(bomSection);

  return wrapper;
}

function createBomSection(supplierLookup) {
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "12px";

  const title = document.createElement("div");
  title.textContent = "BOM";
  Object.assign(title.style, {
    fontSize: "15px",
    fontWeight: "700",
    color: "#111827",
    marginBottom: "10px",
  });
  wrapper.appendChild(title);

  const allComponents = Array.isArray(supplierLookup?.components)
    ? supplierLookup.components.filter((item) => !item?.isPackaging)
    : [];

  if (allComponents.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No non-packaging components to display.";
    Object.assign(empty.style, {
      color: "#6b7280",
      fontSize: "13px",
    });
    wrapper.appendChild(empty);
    return wrapper;
  }

  allComponents.forEach((componentItem) => {
    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "#ffffff",
      border: "1px solid #d9dee7",
      borderRadius: "12px",
      padding: "12px 12px 10px 12px",
      marginTop: "8px",
    });

    const topRow = document.createElement("div");
    Object.assign(topRow.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "10px",
      marginBottom: "6px",
    });

    const left = document.createElement("div");
    left.style.flex = "1";

    const componentTitle = document.createElement("div");
    componentTitle.textContent = componentItem?.component || "No component number";
    Object.assign(componentTitle.style, {
      fontSize: "14px",
      fontWeight: "700",
      color: "#111827",
      marginBottom: "4px",
    });
    left.appendChild(componentTitle);

    const componentDesc = Array.isArray(componentItem?.descriptions)
      ? componentItem.descriptions.join("; ")
      : "";

    if (componentDesc) {
      const desc = document.createElement("div");
      desc.textContent = componentDesc;
      Object.assign(desc.style, {
        fontSize: "13px",
        color: "#374151",
        lineHeight: "1.4",
      });
      left.appendChild(desc);
    }

    topRow.appendChild(left);
    card.appendChild(topRow);

    const meta = document.createElement("div");
    Object.assign(meta.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      marginTop: "6px",
      marginBottom: "6px",
      fontSize: "12px",
      color: "#4b5563",
    });

    if (Array.isArray(componentItem?.suppliers) && componentItem.suppliers.length > 0) {
      const supplierPill = document.createElement("div");
      supplierPill.textContent = `Supplier: ${componentItem.suppliers.join(", ")}`;
      Object.assign(supplierPill.style, {
        padding: "4px 8px",
        background: "#f8fafc",
        border: "1px solid #e5e7eb",
        borderRadius: "999px",
      });
      meta.appendChild(supplierPill);
    }

    if (
      Array.isArray(componentItem?.vendorMaterialNumbers) &&
      componentItem.vendorMaterialNumbers.length > 0
    ) {
      const vendorPill = document.createElement("div");
      vendorPill.textContent = `Vendor: ${componentItem.vendorMaterialNumbers.join(", ")}`;
      Object.assign(vendorPill.style, {
        padding: "4px 8px",
        background: "#f8fafc",
        border: "1px solid #e5e7eb",
        borderRadius: "999px",
      });
      meta.appendChild(vendorPill);
    }

    if (meta.childNodes.length > 0) {
      card.appendChild(meta);
    }

    const regSummary = createComponentRegulationSummary(supplierLookup);
    if (regSummary) {
      card.appendChild(regSummary);
    }

    wrapper.appendChild(card);
  });

  return wrapper;
}

function normalizeSupplierTabKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMaterialKey(value) {
  return String(value || "").trim().toUpperCase();
}

function formatShortDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString();
}

function summarizeStatusesForSupplier(statuses = []) {
  const normalized = statuses
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  if (!normalized.length) return "missing";
  if (normalized.includes("non_compliant")) return "non_compliant";
  if (normalized.every((status) => status === "covered")) return "covered";
  if (normalized.includes("partial")) return "partial";
  if (normalized.every((status) => status === "expired")) return "expired";
  if (
    normalized.includes("informational") &&
    normalized.every((status) => status === "informational")
  ) {
    return "informational";
  }
  if (normalized.includes("covered") && normalized.includes("missing")) return "partial";
  if (normalized.includes("covered") && normalized.includes("expired")) return "partial";
  if (normalized.includes("expired") && normalized.includes("missing")) return "partial";
  if (normalized.every((status) => status === "missing")) return "missing";
  if (normalized.includes("covered")) return "partial";

  return "partial";
}

function buildSuppliersViewModel(effectiveResponse) {
  const results = Array.isArray(effectiveResponse?.componentSuppliersResult?.json?.results)
    ? effectiveResponse.componentSuppliersResult.json.results
    : [];

  const supplierMap = new Map();

  results.forEach((lookupResult) => {
    const materialNumber = normalizeMaterialKey(
      lookupResult?.material || lookupResult?.normalizedQuery || lookupResult?.query || ""
    );

    const coverageRegs = Array.isArray(lookupResult?.coverage?.regulations)
      ? lookupResult.coverage.regulations
      : [];

    coverageRegs.forEach((regItem) => {
      const supplierResults = Array.isArray(regItem?.supplierResults)
        ? regItem.supplierResults
        : [];

      supplierResults.forEach((supplierResult) => {
        const supplierKey = normalizeSupplierTabKey(
          supplierResult?.supplierId ||
            supplierResult?.supplierCode ||
            supplierResult?.supplierName
        );

        if (!supplierKey) return;

        if (!supplierMap.has(supplierKey)) {
          supplierMap.set(supplierKey, {
            supplierName: supplierResult?.supplierName || "Unknown supplier",
            supplierCode: supplierResult?.supplierCode || "",
            supplierId: supplierResult?.supplierId || null,
            linkedMaterials: new Set(),
            linkedComponents: new Set(),
            statements: new Map(),
            regulationBuckets: new Map(),
          });
        }

        const entry = supplierMap.get(supplierKey);

        if (materialNumber) {
          entry.linkedMaterials.add(materialNumber);
        }

        const sources = Array.isArray(supplierResult?.sources) ? supplierResult.sources : [];
        sources.forEach((sourceItem) => {
          const componentNumber = normalizeMaterialKey(sourceItem?.component || "");
          if (componentNumber) {
            entry.linkedComponents.add(componentNumber);
          }
        });

        const regCode =
          regItem?.regulation?.code || supplierResult?.bestAssertion?.regulation?.code || "UNKNOWN";

        if (!entry.regulationBuckets.has(regCode)) {
          entry.regulationBuckets.set(regCode, {
            regulation: regItem?.regulation || supplierResult?.bestAssertion?.regulation || null,
            statuses: [],
            linkedMaterials: new Set(),
          });
        }

        const regBucket = entry.regulationBuckets.get(regCode);
        regBucket.statuses.push(supplierResult?.coverageStatus || "missing");

        if (materialNumber) {
          regBucket.linkedMaterials.add(materialNumber);
        }

        const bestAssertion = supplierResult?.bestAssertion || null;
        if (bestAssertion) {
          const statementKey = String(
            bestAssertion?._id ||
              bestAssertion?.document?._id ||
              `${regCode}-${bestAssertion?.statementText || ""}`
          );

          if (!entry.statements.has(statementKey)) {
            entry.statements.set(statementKey, {
              assertionId: bestAssertion?._id || null,
              regulation: bestAssertion?.regulation || regItem?.regulation || null,
              assertionType: bestAssertion?.assertionType || "",
              coverageLevel: bestAssertion?.coverageLevel || "",
              statementText: bestAssertion?.statementText || "",
              confidence: bestAssertion?.confidence || "",
              document: bestAssertion?.document || null,
              matchSource: supplierResult?.matchSource || "none",
              matchReason: supplierResult?.matchReason || null,
              llmUsed: !!supplierResult?.llmUsed,
              coverageStatus: supplierResult?.coverageStatus || "missing",
              linkedMaterials: new Set(),
              linkedComponents: new Set(),
            });
          }

          const statementEntry = entry.statements.get(statementKey);

          if (materialNumber) {
            statementEntry.linkedMaterials.add(materialNumber);
          }

          sources.forEach((sourceItem) => {
            const componentNumber = normalizeMaterialKey(sourceItem?.component || "");
            if (componentNumber) {
              statementEntry.linkedComponents.add(componentNumber);
            }
          });
        }
      });
    });
  });

  return Array.from(supplierMap.values())
    .map((entry) => ({
      supplierName: entry.supplierName,
      supplierCode: entry.supplierCode,
      supplierId: entry.supplierId,
      linkedMaterials: Array.from(entry.linkedMaterials),
      linkedComponents: Array.from(entry.linkedComponents),
      statements: Array.from(entry.statements.values()).map((statement) => ({
        ...statement,
        linkedMaterials: Array.from(statement.linkedMaterials),
        linkedComponents: Array.from(statement.linkedComponents),
      })),
      regulations: Array.from(entry.regulationBuckets.values()).map((bucket) => ({
        regulation: bucket.regulation,
        status: summarizeStatusesForSupplier(bucket.statuses),
        linkedMaterials: Array.from(bucket.linkedMaterials),
      })),
    }))
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
}

function createSupplierRegulationSummary(regulations = []) {
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
    marginTop: "14px",
  });

  regulations.forEach((regItem) => {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "10px",
      padding: "10px 12px",
      background: "#ffffff",
      border: "1px solid #d9dee7",
      borderRadius: "12px",
    });

    const label = document.createElement("div");
    label.textContent = regItem?.regulation?.code || regItem?.regulation?.name || "Unknown";
    Object.assign(label.style, {
      fontSize: "14px",
      fontWeight: "700",
      color: "#111827",
    });

    row.appendChild(label);
    row.appendChild(createCoverageBadge(regItem?.status || "missing"));
    wrapper.appendChild(row);
  });

  return wrapper;
}

function createSupplierStatementsSection(statements = []) {
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "18px";

  const title = document.createElement("div");
  title.textContent = "Statements";
  Object.assign(title.style, {
    fontSize: "18px",
    fontWeight: "700",
    color: "#111827",
    marginBottom: "10px",
  });
  wrapper.appendChild(title);

  if (!statements.length) {
    const empty = document.createElement("div");
    empty.textContent = "No matched statements found.";
    Object.assign(empty.style, {
      color: "#6b7280",
      fontSize: "14px",
    });
    wrapper.appendChild(empty);
    return wrapper;
  }

  statements.forEach((statement) => {
    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "#ffffff",
      border: "1px solid #d9dee7",
      borderRadius: "16px",
      padding: "16px 18px",
      marginTop: "10px",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "12px",
      marginBottom: "10px",
    });

    const left = document.createElement("div");

    const regTitle = document.createElement("div");
    regTitle.textContent =
      statement?.regulation?.name || statement?.regulation?.code || "Unknown regulation";
    Object.assign(regTitle.style, {
      fontSize: "16px",
      fontWeight: "700",
      color: "#111827",
      marginBottom: "4px",
    });

    const meta = document.createElement("div");
    meta.textContent = `${statement?.assertionType || "assertion"} • ${
      statement?.coverageLevel || "scope"
    }`;
    Object.assign(meta.style, {
      fontSize: "13px",
      color: "#6b7280",
    });

    left.appendChild(regTitle);
    left.appendChild(meta);
    header.appendChild(left);
    header.appendChild(createCoverageBadge(statement?.coverageStatus || "missing"));
    card.appendChild(header);

    const docTitle = statement?.document?.title || statement?.document?.fileName || "";
    if (docTitle) {
      const docLine = document.createElement("div");
      docLine.textContent = `Document: ${docTitle}`;
      Object.assign(docLine.style, {
        fontSize: "14px",
        color: "#111827",
        lineHeight: "1.45",
        marginBottom: "6px",
      });
      card.appendChild(docLine);
    }

    if (statement?.statementText) {
      const textLine = document.createElement("div");
      textLine.textContent = statement.statementText;
      Object.assign(textLine.style, {
        fontSize: "14px",
        color: "#374151",
        lineHeight: "1.5",
        marginBottom: "10px",
      });
      card.appendChild(textLine);
    }

    const details = document.createElement("div");
    Object.assign(details.style, {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "6px 12px",
      fontSize: "13px",
      color: "#4b5563",
    });

    const rows = [
      ["Issue Date", formatShortDate(statement?.document?.issueDate)],
      ["Valid Until", formatShortDate(statement?.document?.validUntil)],
      ["Match Source", statement?.matchSource || "none"],
      ["LLM Used", statement?.llmUsed ? "Yes" : "No"],
      [
        "Linked Materials",
        statement?.linkedMaterials?.length ? statement.linkedMaterials.join(", ") : "—",
      ],
      [
        "Linked Components",
        statement?.linkedComponents?.length ? statement.linkedComponents.join(", ") : "—",
      ],
    ];

    rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.innerHTML = `<strong>${label}:</strong> ${value || "—"}`;
      details.appendChild(row);
    });

    card.appendChild(details);

    // ПОСЛЕ card.appendChild(details); ДОБАВИТЬ:

    const scope = statement?.scope || {};
    const scopeLines = [];

    if (scope.allSupplierItems) {
      scopeLines.push("Covers: All supplier items");
    } else {
      if (Array.isArray(scope.dwkItemNumbers) && scope.dwkItemNumbers.length > 0) {
        scopeLines.push(`DWK Items: ${scope.dwkItemNumbers.join(", ")}`);
      }
      if (Array.isArray(scope.supplierPartNumbers) && scope.supplierPartNumbers.length > 0) {
        scopeLines.push(`Supplier Parts: ${scope.supplierPartNumbers.join(", ")}`);
      }
      if (Array.isArray(scope.families) && scope.families.length > 0) {
        scopeLines.push(`Families: ${scope.families.join(", ")}`);
      }
      if (scopeLines.length === 0) {
        scopeLines.push("Covers: Specific items (see scope details)");
      }
    }

    if (scopeLines.length > 0) {
      const scopeBlock = document.createElement("div");
      Object.assign(scopeBlock.style, {
        marginTop: "10px",
        padding: "8px 10px",
        background: "#f0f4f8",
        border: "1px solid #d9dee7",
        borderRadius: "8px",
        fontSize: "13px",
        color: "#374151",
        lineHeight: "1.5",
      });

      scopeLines.forEach((line) => {
        const div = document.createElement("div");
        div.textContent = line;
        scopeBlock.appendChild(div);
      });

      card.appendChild(scopeBlock);
    }

    if (statement?.matchReason) {
      const reason = document.createElement("div");
      reason.textContent = `Reason: ${statement.matchReason}`;
      Object.assign(reason.style, {
        fontSize: "13px",
        color: "#6b7280",
        lineHeight: "1.45",
        marginTop: "10px",
      });
      card.appendChild(reason);
    }
        const statementUrl =
      statement?.document?.storage?.url ||
      statement?.document?.url ||
      "";

    card.appendChild(createStatementOpenLink(statementUrl, "Open statement"));

    wrapper.appendChild(card);
  });

  return wrapper;
}

function createSupplierCard(supplierEntry) {
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    marginTop: "16px",
    padding: "22px",
    border: "1px solid #d9dee7",
    borderRadius: "24px",
    background: "#f7f8fb",
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    marginBottom: "10px",
  });

  const left = document.createElement("div");
  left.style.flex = "1";

  const title = document.createElement("div");
  title.textContent = supplierEntry?.supplierName || "Unknown supplier";
  Object.assign(title.style, {
    fontSize: "28px",
    fontWeight: "800",
    lineHeight: "1.15",
    color: "#111827",
    letterSpacing: "-0.02em",
    marginBottom: supplierEntry?.supplierCode ? "6px" : "0",
  });

  left.appendChild(title);

  if (supplierEntry?.supplierCode) {
    const codeLine = document.createElement("div");
    codeLine.textContent = `Code: ${supplierEntry.supplierCode}`;
    Object.assign(codeLine.style, {
      fontSize: "14px",
      color: "#6b7280",
      lineHeight: "1.45",
    });
    left.appendChild(codeLine);
  }

  header.appendChild(left);
  wrapper.appendChild(header);

  const stats = document.createElement("div");
  Object.assign(stats.style, {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    borderBottom: "1px solid #dde3ee",
    marginBottom: "18px",
  });

  const createStat = (label, value, withBorderRight = false) => {
    const stat = document.createElement("div");
    Object.assign(stat.style, {
      padding: "12px 4px 14px 0",
      borderRight: withBorderRight ? "1px solid #dde3ee" : "none",
    });

    const statLabel = document.createElement("div");
    statLabel.textContent = label;
    Object.assign(statLabel.style, {
      fontSize: "14px",
      color: "#4b5563",
      marginBottom: "6px",
    });

    const statValue = document.createElement("div");
    statValue.textContent = String(value);
    Object.assign(statValue.style, {
      fontSize: "20px",
      fontWeight: "800",
      color: "#111827",
      lineHeight: "1.1",
    });

    stat.appendChild(statLabel);
    stat.appendChild(statValue);
    return stat;
  };

  stats.appendChild(
    createStat("Materials", supplierEntry?.linkedMaterials?.length || 0, true)
  );
  stats.appendChild(
    createStat("Components", supplierEntry?.linkedComponents?.length || 0, true)
  );
  stats.appendChild(
    createStat("Statements", supplierEntry?.statements?.length || 0, false)
  );

  wrapper.appendChild(stats);

  const regTitle = document.createElement("div");
  regTitle.textContent = "Regulations";
  Object.assign(regTitle.style, {
    fontSize: "18px",
    fontWeight: "700",
    color: "#111827",
    marginBottom: "8px",
  });
  wrapper.appendChild(regTitle);

  wrapper.appendChild(createSupplierRegulationSummary(supplierEntry?.regulations || []));
  wrapper.appendChild(createSupplierStatementsSection(supplierEntry?.statements || []));

  return wrapper;
}

function createSuppliersLibrarySearchBar() {
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    marginTop: "10px",
    marginBottom: "12px",
    display: "flex",
    gap: "8px",
  });

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentCaseAnalysisState.suppliersLibrarySearch || "";
  input.placeholder = "Search suppliers by name, code, or alias";

  Object.assign(input.style, {
    flex: "1",
    padding: "10px 12px",
    border: "1px solid #d0d7de",
    borderRadius: "10px",
    fontSize: "14px",
  });

  input.addEventListener("input", (event) => {
    currentCaseAnalysisState.suppliersLibrarySearch = event.target.value || "";
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadSuppliersLibrary(currentCaseAnalysisState.suppliersLibrarySearch || "");
    }
  });

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = currentCaseAnalysisState.suppliersLibraryLoading
    ? "Loading..."
    : "Search";

  Object.assign(button.style, {
    padding: "10px 14px",
    border: "1px solid #0176d3",
    borderRadius: "10px",
    background: "#0176d3",
    color: "#fff",
    cursor: currentCaseAnalysisState.suppliersLibraryLoading ? "default" : "pointer",
    fontWeight: "600",
    opacity: currentCaseAnalysisState.suppliersLibraryLoading ? "0.7" : "1",
  });

  button.disabled = currentCaseAnalysisState.suppliersLibraryLoading;

  button.addEventListener("click", () => {
    loadSuppliersLibrary(currentCaseAnalysisState.suppliersLibrarySearch || "");
  });

  wrapper.appendChild(input);
  wrapper.appendChild(button);

  return wrapper;
}

function createSupplierLibraryListItem(supplier) {
  const isActive =
    String(currentCaseAnalysisState.selectedSupplierLibraryId || "") ===
    String(supplier?.supplierId || "");

  const item = document.createElement("button");
  item.type = "button";

  Object.assign(item.style, {
    width: "100%",
    textAlign: "left",
    padding: "12px",
    borderRadius: "12px",
    border: isActive ? "1px solid #0176d3" : "1px solid #d8dee4",
    background: isActive ? "#eef6ff" : "#ffffff",
    cursor: "pointer",
    marginBottom: "8px",
  });

  item.addEventListener("click", () => {
    currentCaseAnalysisState.selectedSupplierLibraryId = supplier?.supplierId || null;
    rerenderCurrentCaseToast();
  });

  const name = document.createElement("div");
  name.textContent = supplier?.supplierName || "Unknown supplier";
  Object.assign(name.style, {
    fontWeight: "700",
    fontSize: "14px",
    color: "#111827",
    marginBottom: "4px",
  });

  const code = document.createElement("div");
  code.textContent = supplier?.supplierCode || "—";
  Object.assign(code.style, {
    fontSize: "12px",
    color: "#6b7280",
    marginBottom: "6px",
  });

  const meta = document.createElement("div");
  meta.textContent = `Documents: ${supplier?.documentsCount || 0} • Statements: ${
    supplier?.assertionsCount || 0
  }`;
  Object.assign(meta.style, {
    fontSize: "12px",
    color: "#374151",
  });

  item.appendChild(name);
  item.appendChild(code);
  item.appendChild(meta);

  return item;
}

function createOpenFileButton(url) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Open file";

  Object.assign(button.style, {
    marginTop: "10px",
    padding: "8px 12px",
    borderRadius: "10px",
    border: "1px solid #0176d3",
    background: "#ffffff",
    color: "#0176d3",
    cursor: url ? "pointer" : "default",
    fontWeight: "600",
    opacity: url ? "1" : "0.6",
  });

  button.disabled = !url;

  button.addEventListener("click", () => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  });

  return button;
}

function createSupplierLibraryRegulationSummary(regulations = []) {
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "14px";

  const title = document.createElement("div");
  title.textContent = "Regulations";
  Object.assign(title.style, {
    fontSize: "18px",
    fontWeight: "700",
    color: "#111827",
    marginBottom: "10px",
  });
  wrapper.appendChild(title);

  if (!regulations.length) {
    const empty = document.createElement("div");
    empty.textContent = "No regulation summary available.";
    Object.assign(empty.style, {
      color: "#6b7280",
      fontSize: "14px",
    });
    wrapper.appendChild(empty);
    return wrapper;
  }

  const grid = document.createElement("div");
  Object.assign(grid.style, {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
  });

  regulations.forEach((regItem) => {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "10px",
      padding: "10px 12px",
      background: "#ffffff",
      border: "1px solid #d9dee7",
      borderRadius: "12px",
    });

    const left = document.createElement("div");

    const code = document.createElement("div");
    code.textContent =
      regItem?.regulationCode || regItem?.regulationName || "Unknown";
    Object.assign(code.style, {
      fontSize: "14px",
      fontWeight: "700",
      color: "#111827",
      marginBottom: "2px",
    });

    const count = document.createElement("div");
    count.textContent = `Statements: ${regItem?.statementsCount || 0}`;
    Object.assign(count.style, {
      fontSize: "12px",
      color: "#6b7280",
    });

    left.appendChild(code);
    left.appendChild(count);

    row.appendChild(left);
    row.appendChild(createCoverageBadge(regItem?.status || "missing"));
    grid.appendChild(row);
  });

  wrapper.appendChild(grid);
  return wrapper;
}

function createSupplierLibraryStatementsSection(assertions = []) {
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "18px";

  const title = document.createElement("div");
  title.textContent = "Statements";
  Object.assign(title.style, {
    fontSize: "18px",
    fontWeight: "700",
    color: "#111827",
    marginBottom: "10px",
  });
  wrapper.appendChild(title);

  if (!assertions.length) {
    const empty = document.createElement("div");
    empty.textContent = "No statements found for this supplier.";
    Object.assign(empty.style, {
      color: "#6b7280",
      fontSize: "14px",
    });
    wrapper.appendChild(empty);
    return wrapper;
  }

  assertions.forEach((statement) => {
    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "#ffffff",
      border: "1px solid #d9dee7",
      borderRadius: "16px",
      padding: "16px 18px",
      marginTop: "10px",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "12px",
      marginBottom: "10px",
    });

    const left = document.createElement("div");

    const regTitle = document.createElement("div");
    regTitle.textContent =
      statement?.regulation?.name || statement?.regulation?.code || "Unknown regulation";
    Object.assign(regTitle.style, {
      fontSize: "16px",
      fontWeight: "700",
      color: "#111827",
      marginBottom: "4px",
    });

    const meta = document.createElement("div");
    meta.textContent = `${statement?.assertionType || "assertion"} • ${
      statement?.coverageLevel || "scope"
    }`;
    Object.assign(meta.style, {
      fontSize: "13px",
      color: "#6b7280",
    });

    left.appendChild(regTitle);
    left.appendChild(meta);

    const statusBadge = createCoverageBadge(
      statement?.status === "active" ? "covered" : statement?.status || "missing"
    );

    header.appendChild(left);
    header.appendChild(statusBadge);
    card.appendChild(header);

    const docTitle =
      statement?.document?.title || statement?.document?.fileName || "";
    if (docTitle) {
      const docLine = document.createElement("div");
      docLine.textContent = `Document: ${docTitle}`;
      Object.assign(docLine.style, {
        fontSize: "14px",
        color: "#111827",
        lineHeight: "1.45",
        marginBottom: "6px",
      });
      card.appendChild(docLine);
    }

    if (statement?.statementText) {
      const textLine = document.createElement("div");
      textLine.textContent = statement.statementText;
      Object.assign(textLine.style, {
        fontSize: "14px",
        color: "#374151",
        lineHeight: "1.5",
        marginBottom: "10px",
      });
      card.appendChild(textLine);
    }

    const details = document.createElement("div");
    Object.assign(details.style, {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "6px 12px",
      fontSize: "13px",
      color: "#4b5563",
    });

    const rows = [
      ["Issue Date", formatShortDate(statement?.document?.issueDate || statement?.issueDate)],
      ["Valid Until", formatShortDate(statement?.document?.validUntil || statement?.validUntil)],
      ["Confidence", statement?.confidence || "—"],
      ["Status", statement?.status || "—"],
      ["Document Type", statement?.document?.documentType || statement?.document?.title ? statement?.document?.documentType || "—" : "—"],
      ["Provider", statement?.document?.provider || "—"],
    ];

    rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.innerHTML = `<strong>${label}:</strong> ${value || "—"}`;
      details.appendChild(row);
    });

    card.appendChild(details);

    const scope = statement?.scope || {};
    const scopeLines = [];

    if (scope.allSupplierItems) {
      scopeLines.push("Covers: All supplier items");
    } else {
      if (Array.isArray(scope.dwkItemNumbers) && scope.dwkItemNumbers.length > 0) {
        scopeLines.push(`DWK Items: ${scope.dwkItemNumbers.join(", ")}`);
      }
      if (Array.isArray(scope.supplierPartNumbers) && scope.supplierPartNumbers.length > 0) {
        scopeLines.push(`Supplier Parts: ${scope.supplierPartNumbers.join(", ")}`);
      }
      if (Array.isArray(scope.families) && scope.families.length > 0) {
        scopeLines.push(`Families: ${scope.families.join(", ")}`);
      }
      if (scopeLines.length === 0) {
        scopeLines.push("Covers: Specific items (see scope details)");
      }
    }

    if (scopeLines.length > 0) {
      const scopeBlock = document.createElement("div");
      Object.assign(scopeBlock.style, {
        marginTop: "10px",
        padding: "8px 10px",
        background: "#f0f4f8",
        border: "1px solid #d9dee7",
        borderRadius: "8px",
        fontSize: "13px",
        color: "#374151",
        lineHeight: "1.5",
      });

      scopeLines.forEach((line) => {
        const div = document.createElement("div");
        div.textContent = line;
        scopeBlock.appendChild(div);
      });

      card.appendChild(scopeBlock);
    }

    const fileUrl =
      statement?.document?.url ||
      statement?.document?.storage?.url ||
      "";

    card.appendChild(createOpenFileButton(fileUrl));
    wrapper.appendChild(card);
  });

  return wrapper;
}

function createSupplierLibraryDetail(supplier) {
  const wrapper = document.createElement("div");

  if (!supplier) {
    wrapper.appendChild(createInfoRow("Supplier", "Select a supplier"));
    return wrapper;
  }

  const title = document.createElement("div");
  title.textContent = supplier?.supplierName || "Unknown supplier";
  Object.assign(title.style, {
    fontSize: "24px",
    fontWeight: "800",
    color: "#111827",
    marginBottom: "4px",
  });
  wrapper.appendChild(title);

  const code = document.createElement("div");
  code.textContent = `Code: ${supplier?.supplierCode || "—"}`;
  Object.assign(code.style, {
    fontSize: "14px",
    color: "#6b7280",
    marginBottom: "10px",
  });
  wrapper.appendChild(code);

  if (Array.isArray(supplier?.aliases) && supplier.aliases.length) {
    const aliases = document.createElement("div");
    aliases.innerHTML = `<strong>Aliases:</strong> ${supplier.aliases.join(", ")}`;
    Object.assign(aliases.style, {
      fontSize: "14px",
      color: "#374151",
      lineHeight: "1.5",
      marginBottom: "12px",
    });
    wrapper.appendChild(aliases);
  }

  const stats = document.createElement("div");
  Object.assign(stats.style, {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "10px",
    marginBottom: "18px",
  });

  const addStatCard = (label, value) => {
    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "#f8fafc",
      border: "1px solid #d9dee7",
      borderRadius: "14px",
      padding: "12px 14px",
    });

    const statLabel = document.createElement("div");
    statLabel.textContent = label;
    Object.assign(statLabel.style, {
      fontSize: "13px",
      color: "#6b7280",
      marginBottom: "6px",
    });

    const statValue = document.createElement("div");
    statValue.textContent = String(value);
    Object.assign(statValue.style, {
      fontSize: "22px",
      fontWeight: "800",
      color: "#111827",
      lineHeight: "1.1",
    });

    card.appendChild(statLabel);
    card.appendChild(statValue);
    stats.appendChild(card);
  };

  addStatCard("Documents", supplier?.documentsCount || 0);
  addStatCard("Statements", supplier?.assertionsCount || 0);
  addStatCard("Regulations", Array.isArray(supplier?.regulationSummary) ? supplier.regulationSummary.length : 0);

  wrapper.appendChild(stats);
  wrapper.appendChild(
    createSupplierLibraryRegulationSummary(
      Array.isArray(supplier?.regulationSummary) ? supplier.regulationSummary : []
    )
  );
  wrapper.appendChild(
    createSupplierLibraryStatementsSection(
      Array.isArray(supplier?.assertions) ? supplier.assertions : []
    )
  );

  return wrapper;
}

function createSuppliersTabContent() {
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "8px";

  wrapper.appendChild(createSuppliersLibrarySearchBar());

  if (currentCaseAnalysisState.suppliersLibraryLoading) {
    wrapper.appendChild(createInfoRow("Status", "Loading suppliers library..."));
    return wrapper;
  }

  if (currentCaseAnalysisState.suppliersLibraryError) {
    wrapper.appendChild(
      createInfoRow("Error", currentCaseAnalysisState.suppliersLibraryError)
    );
    return wrapper;
  }

  const suppliers = Array.isArray(currentCaseAnalysisState.suppliersLibrary?.suppliers)
    ? currentCaseAnalysisState.suppliersLibrary.suppliers
    : [];

  const summary = document.createElement("div");
  summary.textContent = `Suppliers found: ${
    typeof currentCaseAnalysisState.suppliersLibrary?.total === "number"
      ? currentCaseAnalysisState.suppliersLibrary.total
      : suppliers.length
  }`;
  Object.assign(summary.style, {
    fontSize: "13px",
    color: "#4b5563",
    marginBottom: "12px",
  });
  wrapper.appendChild(summary);

  if (!suppliers.length) {
    wrapper.appendChild(createInfoRow("Suppliers", "No suppliers found."));
    return wrapper;
  }

  const layout = document.createElement("div");
  Object.assign(layout.style, {
    display: "grid",
    gridTemplateColumns: isCaseToastExpanded
      ? "340px minmax(0, 1fr)"
      : "280px minmax(0, 1fr)",
    gap: "14px",
    alignItems: "start",
  });

  const leftPane = document.createElement("div");
  Object.assign(leftPane.style, {
    maxHeight: "calc(78vh - 260px)",
    overflowY: "auto",
    paddingRight: "4px",
  });

  suppliers.forEach((supplier) => {
    leftPane.appendChild(createSupplierLibraryListItem(supplier));
  });

  const rightPane = document.createElement("div");
  Object.assign(rightPane.style, {
    minHeight: "200px",
    padding: "16px",
    border: "1px solid #d9dee7",
    borderRadius: "18px",
    background: "#f7f8fb",
  });

  const selectedSupplier = suppliers.find(
    (item) =>
      String(item?.supplierId || "") ===
      String(currentCaseAnalysisState.selectedSupplierLibraryId || "")
  ) || suppliers[0];

  if (
    selectedSupplier &&
    String(currentCaseAnalysisState.selectedSupplierLibraryId || "") !==
      String(selectedSupplier?.supplierId || "")
  ) {
    currentCaseAnalysisState.selectedSupplierLibraryId =
      selectedSupplier?.supplierId || null;
  }

  rightPane.appendChild(createSupplierLibraryDetail(selectedSupplier));

  layout.appendChild(leftPane);
  layout.appendChild(rightPane);
  wrapper.appendChild(layout);

  return wrapper;
}

function createMaterialOverviewCard(materialItem, supplierLookup, materialIndex) {
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "8px";
  wrapper.style.padding = "10px 12px";
  wrapper.style.border = "1px solid #d8dee4";
  wrapper.style.borderRadius = "10px";
  wrapper.style.background = "#f6f8fa";

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "10px",
    marginBottom: "4px",
  });

  const left = document.createElement("div");
  left.style.flex = "1";

  const part = materialItem?.part_number || "N/A";

  if (currentCaseAnalysisState.editingMaterialIndex === materialIndex) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = part;

    Object.assign(input.style, {
      width: "100%",
      boxSizing: "border-box",
      padding: "8px 10px",
      border: "1px solid #cfd6e4",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "700",
      background: "#ffffff",
    });

    left.appendChild(input);
    header.appendChild(left);

    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "flex",
      gap: "6px",
      flexShrink: "0",
    });

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = "Apply";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";

    [applyBtn, cancelBtn].forEach((btn) => {
      Object.assign(btn.style, {
        border: "1px solid #cfd6e4",
        borderRadius: "8px",
        padding: "7px 10px",
        cursor: "pointer",
        background: "#ffffff",
        fontWeight: "600",
        fontSize: "12px",
      });
    });

    applyBtn.onclick = () => applyManualMaterialUpdate(materialIndex, input.value);
    cancelBtn.onclick = () => {
      currentCaseAnalysisState.editingMaterialIndex = null;
      renderCaseToastAnalysis(
        currentCaseAnalysisState.payload,
        currentCaseAnalysisState.response
      );
    };

    actions.appendChild(applyBtn);
    actions.appendChild(cancelBtn);
    header.appendChild(actions);
  } else {
    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.style.fontSize = "14px";
    title.style.lineHeight = "1.3";
    title.textContent = part;
    left.appendChild(title);
    header.appendChild(left);

    if (materialIndex >= 0) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Edit";

      Object.assign(editBtn.style, {
        border: "1px solid #cfd6e4",
        borderRadius: "8px",
        padding: "7px 10px",
        cursor: "pointer",
        background: "#ffffff",
        fontWeight: "600",
        fontSize: "12px",
        flexShrink: "0",
      });

      editBtn.onclick = () => {
        currentCaseAnalysisState.editingMaterialIndex = materialIndex;
        renderCaseToastAnalysis(
          currentCaseAnalysisState.payload,
          currentCaseAnalysisState.response
        );
      };

      header.appendChild(editBtn);
    }
  }

  wrapper.appendChild(header);

  const desc = materialItem?.description || "";
  if (desc) {
    const descLine = document.createElement("div");
    descLine.style.color = "#555";
    descLine.style.marginBottom = "6px";
    descLine.style.fontSize = "13px";
    descLine.textContent = desc;
    wrapper.appendChild(descLine);
  }

  if (!supplierLookup || !supplierLookup.found) {
    const line = document.createElement("div");
    line.style.color = "#666";
    line.style.fontSize = "12px";
    line.textContent = "No supplier data found.";
    wrapper.appendChild(line);
    return wrapper;
  }

  const visibleComponents = Array.isArray(supplierLookup?.components)
    ? supplierLookup.components.filter((item) => !item?.isPackaging)
    : [];

  const meta = document.createElement("div");
  meta.textContent =
    `Suppliers: ${supplierLookup.supplierCount || 0} | Components: ${visibleComponents.length}`;
  Object.assign(meta.style, {
    fontSize: "12px",
    color: "#4b5563",
    marginBottom: "2px",
  });
  wrapper.appendChild(meta);

  const suppliersLine = createCompactSuppliersLine(supplierLookup);
  if (suppliersLine) {
    wrapper.appendChild(suppliersLine);
  }

  const regSummary = createMaterialRegulationSummary(supplierLookup);
  if (regSummary) {
    wrapper.appendChild(regSummary);
  }

  return wrapper;
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

  const rerender = () => {
    clearToastBody(body);
    setCaseToastTab(activeCaseToastTab);

    const analyzeJson =
      response?.analyzeResult?.json ||
      safeParseJson(response?.analyzeResult?.body || "");

    const analysis =
      currentCaseAnalysisState.analysis ||
      analyzeJson?.result?.analysis ||
      null;

    const hasAnalyzeResult = !!response?.analyzeResult;
    const isLookupTab = activeCaseToastTab === "lookup";

    if (!isLookupTab && hasAnalyzeResult && !response?.analyzeResult?.ok) {
      body.appendChild(createInfoRow("Case Number", payload.caseId));
      body.appendChild(createInfoRow("Subject", payload.subject));
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

    if (!isLookupTab && !analysis) {
      body.appendChild(createInfoRow("Case Number", payload.caseId));
      body.appendChild(createInfoRow("Subject", payload.subject));
      body.appendChild(createInfoRow("Status", "Analysis unavailable"));
      return;
    }

    currentCaseAnalysisState.payload = payload;
    currentCaseAnalysisState.response = response;

    if (analysis) {
      currentCaseAnalysisState.analysis = analysis;
    }

    if (!currentCaseAnalysisState.overriddenMaterials) {
      currentCaseAnalysisState.overriddenMaterials = Array.isArray(analysis?.materials)
        ? analysis.materials.map((item) => ({
            part_number: item?.part_number || "",
            description: item?.description || "",
          }))
        : [];
    }

    const requesterValue =
      analysis?.requester?.name ||
      analysis?.requester?.company ||
      analysis?.requester?.email ||
      "N/A";

    const materials = Array.isArray(currentCaseAnalysisState.overriddenMaterials)
      ? currentCaseAnalysisState.overriddenMaterials
      : [];

    const effectiveResponse = currentCaseAnalysisState.lookupResults
      ? {
          ...response,
          componentSuppliersResult: currentCaseAnalysisState.lookupResults,
        }
      : response;

    const componentSuppliersMap = buildComponentSuppliersMap(effectiveResponse);
    const coverageSummaryBlock = createCoverageSummaryBlock(effectiveResponse);

    if (
      activeCaseToastTab === "suppliers" &&
      !currentCaseAnalysisState.suppliersLibrary &&
      !currentCaseAnalysisState.suppliersLibraryLoading &&
      !currentCaseAnalysisState.suppliersLibraryError
    ) {
      loadSuppliersLibrary(currentCaseAnalysisState.suppliersLibrarySearch || "");
    }

    if (activeCaseToastTab === "overview") {
      body.appendChild(createInfoRow("Case Number", payload.caseId));
      body.appendChild(createInfoRow("Subject", payload.subject));
      body.appendChild(createInfoRow("Status", "Analysis complete"));
      body.appendChild(createInfoRow("Requester", requesterValue));
      body.appendChild(createListRow("Request Types", analysis?.request_types || []));

      if (coverageSummaryBlock) {
        body.appendChild(coverageSummaryBlock);
      }

          if (materials.length > 0) {
        const materialsBlock = document.createElement("div");
        materialsBlock.style.marginBottom = "8px";

        const materialsLabel = document.createElement("strong");
        materialsLabel.textContent = "Materials:";
        materialsBlock.appendChild(materialsLabel);

        materials.forEach((materialItem, materialIndex) => {
          const normalizedPart = String(materialItem?.part_number || "")
            .trim()
            .toUpperCase();

          const supplierLookup = componentSuppliersMap.get(normalizedPart) || null;

          materialsBlock.appendChild(
            createMaterialOverviewCard(materialItem, supplierLookup, materialIndex)
          );
        });

        body.appendChild(materialsBlock);
      } else {
        body.appendChild(createInfoRow("Materials", "N/A"));
      }

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
          line.style.marginTop = "6px";
          line.style.whiteSpace = "normal";
          notesBlock.appendChild(line);
        });

        body.appendChild(notesBlock);
      }
    }

    if (activeCaseToastTab === "materials") {
      body.appendChild(createInfoRow("Case Number", payload.caseId));
      body.appendChild(createInfoRow("Subject", payload.subject));

      if (coverageSummaryBlock) {
        body.appendChild(coverageSummaryBlock);
      }

      if (materials.length > 0) {
        const materialsBlock = document.createElement("div");
        materialsBlock.style.marginBottom = "8px";

        const materialsLabel = document.createElement("div");
        materialsLabel.textContent = "Materials";
        Object.assign(materialsLabel.style, {
          fontSize: "16px",
          fontWeight: "700",
          color: "#111827",
          marginBottom: "8px",
        });
        materialsBlock.appendChild(materialsLabel);

        materials.forEach((materialItem, materialIndex) => {
          const normalizedPart = String(materialItem?.part_number || "")
            .trim()
            .toUpperCase();

          const supplierLookup = componentSuppliersMap.get(normalizedPart) || null;

          materialsBlock.appendChild(
            createMaterialSupplierCard(materialItem, supplierLookup, materialIndex)
          );
        });

        body.appendChild(materialsBlock);
      } else {
        body.appendChild(createInfoRow("Materials", "N/A"));
      }
    }

    if (activeCaseToastTab === "suppliers") {
      body.appendChild(createInfoRow("Case Number", payload.caseId));
      body.appendChild(createInfoRow("Subject", payload.subject));
      body.appendChild(createSuppliersTabContent());
    }

    if (activeCaseToastTab === "lookup") {
      body.appendChild(createInfoRow("Case Number", payload?.caseId || "Manual Lookup"));
      body.appendChild(
        createInfoRow("Subject", payload?.subject || "Manual supplier lookup")
      );

      const wrapper = document.createElement("div");
      wrapper.style.marginTop = "10px";

      const label = document.createElement("strong");
      label.textContent = "Paste part numbers:";
      wrapper.appendChild(label);

      const textarea = document.createElement("textarea");
      textarea.value = currentCaseAnalysisState.manualLookupInput || "";
      textarea.placeholder = "Example:\n242615\nW010342J\n123456";
      textarea.style.width = "100%";
      textarea.style.minHeight = "120px";
      textarea.style.boxSizing = "border-box";
      textarea.style.marginTop = "8px";
      textarea.style.padding = "8px 10px";
      textarea.style.border = "1px solid #c9d1d9";
      textarea.style.borderRadius = "8px";
      textarea.style.resize = "vertical";

      textarea.oninput = (event) => {
        currentCaseAnalysisState.manualLookupInput = event.target.value;
      };

      wrapper.appendChild(textarea);

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";
      actions.style.marginTop = "8px";

      const lookupBtn = document.createElement("button");
      lookupBtn.type = "button";
      lookupBtn.textContent = currentCaseAnalysisState.manualLookupLoading
        ? "Looking up..."
        : "Lookup";
      lookupBtn.disabled = currentCaseAnalysisState.manualLookupLoading;
      lookupBtn.style.border = "1px solid #d0d7de";
      lookupBtn.style.borderRadius = "8px";
      lookupBtn.style.padding = "8px 12px";
      lookupBtn.style.cursor = "pointer";
      lookupBtn.style.background = "#fff";

      lookupBtn.onclick = () => {
        runManualLookup();
      };

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.textContent = "Clear";
      clearBtn.style.border = "1px solid #d0d7de";
      clearBtn.style.borderRadius = "8px";
      clearBtn.style.padding = "8px 12px";
      clearBtn.style.cursor = "pointer";
      clearBtn.style.background = "#fff";

      clearBtn.onclick = () => {
        currentCaseAnalysisState.manualLookupInput = "";
        currentCaseAnalysisState.manualLookupResults = null;
        currentCaseAnalysisState.manualLookupLoading = false;

        renderCaseToastAnalysis(
          currentCaseAnalysisState.payload || payload,
          currentCaseAnalysisState.response || response
        );
      };

      actions.appendChild(lookupBtn);
      actions.appendChild(clearBtn);
      wrapper.appendChild(actions);

      body.appendChild(wrapper);

      const parsedQueries = parseManualLookupInput(
        currentCaseAnalysisState.manualLookupInput
      );

      if (parsedQueries.length > 0) {
        body.appendChild(createInfoRow("Parsed part numbers", String(parsedQueries.length)));
      }

      if (currentCaseAnalysisState.manualLookupResults?.error) {
        body.appendChild(
          createInfoRow("Error", currentCaseAnalysisState.manualLookupResults.error)
        );
      }

      const lookupResponse = currentCaseAnalysisState.manualLookupResults;
      const lookupMap = buildComponentSuppliersMap({
        componentSuppliersResult: lookupResponse,
      });

      if (parsedQueries.length > 0) {
        const resultsBlock = document.createElement("div");
        resultsBlock.style.marginTop = "10px";

        const resultsLabel = document.createElement("strong");
        resultsLabel.textContent = "Lookup results:";
        resultsBlock.appendChild(resultsLabel);

        parsedQueries.forEach((partNumber) => {
          const supplierLookup =
            lookupMap.get(String(partNumber).trim().toUpperCase()) || null;

          resultsBlock.appendChild(createManualLookupCard(partNumber, supplierLookup));
        });

        body.appendChild(resultsBlock);
      }
    }
  };

  wireCaseToastTabs(rerender);
  rerender();
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

function showLauncher() {
  const launcher = document.getElementById("sf-compliance-auth-launcher");
  if (launcher) {
    launcher.style.display = "block";
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
    description: normalizeRichText(descriptionNode?.textContent, 4000),
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

  if (lastCompletedRecordId === recordId) {
    return;
  }

  const payload = readSalesforceCaseFromDom();
  payload.recordId = recordId;

  if (!payload.caseId && !payload.subject && !payload.description) {
    console.log("Case detected but DOM not ready yet:", window.location.href);
    return;
  }

  if (isProbablyStaleDomForNewCase(payload)) {
    console.log("Detected stale DOM from previous case, waiting for Salesforce to update DOM...");
    return;
  }

  const requestToken = ++activeCaseRequestToken;

  console.log("SF payload:", payload);

  renderCaseToastInitial(payload);

  const response = await sendMessageAsync({
    type: "SF_CASE_CONTEXT",
    payload,
  });

  console.log("background response:", response);

  const currentRecordId = getRecordIdFromUrl();

  if (requestToken !== activeCaseRequestToken) {
    console.log("Skipping toast update because a newer case request is already active");
    return;
  }

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
    lastCompletedRecordId = null;
    renderCaseToastAuthRequired(payload, response?.error || "Session expired");
    showAuthCard("Session expired. Sign in again.");
    setAuthStatus("Session expired.", "#b42318");
    return;
  }

  if (response?.ok) {
    currentCaseAnalysisState.payload = payload;
    renderCaseToastAnalysis(payload, response);
    lastSentCaseUrl = window.location.href;
    lastCompletedRecordId = recordId;
    return;
  }

  lastSentCaseUrl = null;
  lastCompletedRecordId = null;

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

  [500, 1500, 3000, 5000, 8000].forEach((delay) => {
    setTimeout(() => {
      trySendCaseContext();
    }, delay);
  });
}

function handlePotentialRouteChange() {
  const currentUrl = window.location.href;

  if (currentUrl !== lastSeenUrl) {
    console.log("Route changed:", currentUrl);
    lastSeenUrl = currentUrl;
    lastSentCaseUrl = null;
    lastCompletedRecordId = null;
    activeCaseRequestToken += 1;

    resetCaseAnalysisState();
    removeCaseToast();

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