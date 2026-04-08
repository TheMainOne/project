console.log("CONTENT SCRIPT LOADED:", window.location.href);

let lastSeenUrl = window.location.href;
let lastSentCaseUrl = null;
let activeCaseToastTab = "overview";
let suppliersSubTab = "library"; // "library" | "analytics"

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

  addStatementForm: {
    supplierCode: "",
    supplierName: "",
    supplierAliases: "",
    isNewSupplier: false,
    selectedSupplierId: null,

    showNewRegulationForm: false,
    newRegCode: "",
    newRegName: "",
    newRegCategory: "general",
    addingRegulation: false,
    addRegulationError: null,

    docTitle: "",
    docFileName: "",
    docUrl: "",
    docType: "certificate",
    docIssueDate: "",
    docValidUntil: "",
    docStatementText: "",

    coverageType: "supplier_all",
    dwkItemNumbers: "",
    supplierPartNumbers: "",

    assertionType: "compliant",
    selectedRegulations: [],

    availableRegulations: [],
    supplierSearchResults: [],
    supplierSearchQuery: "",

    submitting: false,
    submitResult: null,
    submitError: null,
  },
};

let activeCaseRequestToken = 0;
let lastCompletedRecordId = null;
let isCaseToastExpanded = false;

function resetCaseAnalysisState() {
  suppliersSubTab = "library";

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

    addStatementForm: {
      supplierCode: "",
      supplierName: "",
      supplierAliases: "",
      isNewSupplier: false,
      selectedSupplierId: null,

      showNewRegulationForm: false,
    newRegCode: "",
    newRegName: "",
    newRegCategory: "general",
    addingRegulation: false,
    addRegulationError: null,

      docTitle: "",
      docFileName: "",
      docUrl: "",
      docType: "certificate",
      docIssueDate: "",
      docValidUntil: "",
      docStatementText: "",

      coverageType: "supplier_all",
      dwkItemNumbers: "",
      supplierPartNumbers: "",

      assertionType: "compliant",
      selectedRegulations: [],

      availableRegulations: [],
      supplierSearchResults: [],
      supplierSearchQuery: "",

      submitting: false,
      submitResult: null,
      submitError: null,
    },
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

  // Загружаем все активные регуляции автоматически
  let allRegulationCodes = [];

  if (
    Array.isArray(currentCaseAnalysisState.analysis?.requested_regulations) &&
    currentCaseAnalysisState.analysis.requested_regulations.length > 0
  ) {
    allRegulationCodes = [...currentCaseAnalysisState.analysis.requested_regulations];
  }

  // Всегда дополняем полным списком из БД
  const regResponse = await sendMessageAsync({ type: "EXT_FETCH_REGULATIONS" });

  if (regResponse?.ok && Array.isArray(regResponse.regulations)) {
    const dbCodes = regResponse.regulations.map((r) => r.code);
    allRegulationCodes = [...new Set([...allRegulationCodes, ...dbCodes])];
  }

  const response = await sendMessageAsync({
    type: "SF_MATERIALS_LOOKUP",
    payload: {
      caseId:
        currentCaseAnalysisState.payload?.caseId ||
        currentCaseAnalysisState.payload?.recordId ||
        "manual-lookup",
      queries,
      requestedRegulations: allRegulationCodes,
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

  const addTab = document.createElement("button");
addTab.type = "button";
addTab.id = "sf-compliance-tab-add";
addTab.textContent = "New Statement";

 [overviewTab, materialsTab, suppliersTab, lookupTab, addTab].forEach((btn) => {
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
tabs.appendChild(addTab);

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
  const allRows = buildMaterialRegulationRows(supplierLookup);
  const rows = allRows.filter((row) => row.overallStatus !== "missing");

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
    const primaryEvidence =
      row.evidence.find((item) => item.url) || row.evidence[0] || null;

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
  const allRows = buildMaterialRegulationRows(supplierLookup);
  const rows = allRows.filter((row) => row.overallStatus !== "missing");

  if (!rows.length) return null;

  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    marginTop: "10px",
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  });

  rows.forEach((row) => {
    const primaryEvidence =
      row.evidence.find((item) => item.url) || row.evidence[0] || null;

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
} else if (tabName === "add") {
  activeCaseToastTab = "add";
} else {
  activeCaseToastTab = "overview";
}

const overviewBtn = document.getElementById("sf-compliance-tab-overview");
const materialsBtn = document.getElementById("sf-compliance-tab-materials");
const suppliersBtn = document.getElementById("sf-compliance-tab-suppliers");
const lookupBtn = document.getElementById("sf-compliance-tab-lookup");
const addBtn = document.getElementById("sf-compliance-tab-add");

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
applyActive(addBtn, activeCaseToastTab === "add");
}

function wireCaseToastTabs(renderFn) {
const overviewBtn = document.getElementById("sf-compliance-tab-overview");
const materialsBtn = document.getElementById("sf-compliance-tab-materials");
const suppliersBtn = document.getElementById("sf-compliance-tab-suppliers");
const lookupBtn = document.getElementById("sf-compliance-tab-lookup");
const addBtn = document.getElementById("sf-compliance-tab-add");

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

  if (addBtn) {
  addBtn.onclick = () => {
    activeCaseToastTab = "add";
    renderFn();
  };
}

  setCaseToastTab(activeCaseToastTab);
}

async function submitNewRegulation() {
  const form = currentCaseAnalysisState.addStatementForm;

  const code = String(form.newRegCode || "").trim().toUpperCase();
  const name = String(form.newRegName || "").trim();

  if (!code || !name) {
    form.addRegulationError = "Code and name are required";
    rerenderCurrentCaseToast();
    return;
  }

  form.addingRegulation = true;
  form.addRegulationError = null;
  rerenderCurrentCaseToast();

  const response = await sendMessageAsync({
    type: "EXT_ADD_REGULATION",
    payload: {
      code,
      name,
      category: form.newRegCategory || "general",
    },
  });

  form.addingRegulation = false;

  if (response?.ok && response?.result?.ok) {
    // Добавить в список и выбрать
    const newReg = response.result.regulation;

    form.availableRegulations.push({
      _id: newReg.id,
      code: newReg.code,
      name: newReg.name,
    });

    if (!form.selectedRegulations.includes(newReg.code)) {
      form.selectedRegulations.push(newReg.code);
    }

    form.showNewRegulationForm = false;
    form.newRegCode = "";
    form.newRegName = "";
    form.newRegCategory = "general";
    form.addRegulationError = null;
  } else {
    form.addRegulationError =
      response?.result?.error || response?.error || "Failed to add regulation";
  }

  rerenderCurrentCaseToast();
}

async function loadRegulationsIfNeeded() {
  const form = currentCaseAnalysisState.addStatementForm;
  if (form.availableRegulations.length > 0) return;

  const response = await sendMessageAsync({ type: "EXT_FETCH_REGULATIONS" });

  if (response?.ok && Array.isArray(response.regulations)) {
    form.availableRegulations = response.regulations;
    rerenderCurrentCaseToast();
  }
}

async function searchSuppliersForForm(query) {
  const form = currentCaseAnalysisState.addStatementForm;
  form.supplierSearchQuery = query;

  if (!query.trim()) {
    form.supplierSearchResults = [];
    rerenderCurrentCaseToast();
    return;
  }

  const response = await sendMessageAsync({
    type: "EXT_SEARCH_SUPPLIERS",
    payload: { q: query },
  });

  if (response?.ok) {
    form.supplierSearchResults = response.suppliers || [];
    rerenderCurrentCaseToast();
  }
}

async function submitAddStatement() {
  const form = currentCaseAnalysisState.addStatementForm;
  form.submitting = true;
  form.submitResult = null;
  form.submitError = null;
  rerenderCurrentCaseToast();

  const payload = {
    supplier: {
      supplierCode: form.supplierCode.trim().toUpperCase(),
      supplierName: form.supplierName.trim(),
      aliases: form.supplierAliases
        ? form.supplierAliases.split(",").map((a) => a.trim()).filter(Boolean)
        : [],
    },
    document: {
      title: form.docTitle.trim(),
      fileName: form.docFileName.trim(),
      url: form.docUrl.trim(),
      documentType: form.docType,
      issueDate: form.docIssueDate || null,
      validUntil: form.docValidUntil || null,
      statementText: form.docStatementText.trim(),
      status: "active",
    },
    coverage: {
      type: form.coverageType,
      dwkItemNumbers: form.dwkItemNumbers
        ? form.dwkItemNumbers.split(/[\n,;\s]+/).map((n) => n.trim()).filter(Boolean)
        : [],
      supplierPartNumbers: form.supplierPartNumbers
        ? form.supplierPartNumbers.split(/[\n,;\s]+/).map((n) => n.trim()).filter(Boolean)
        : [],
    },
    regulations: form.selectedRegulations,
    assertionType: form.assertionType,
  };

  const response = await sendMessageAsync({
    type: "EXT_ADD_STATEMENT",
    payload,
  });

  form.submitting = false;

  if (response?.ok && response?.result?.ok) {
    form.submitResult = response.result;
    form.submitError = null;
  } else {
    form.submitError = response?.result?.error || response?.error || "Failed to add statement";
  }

  rerenderCurrentCaseToast();
}

function createFormField(label, inputEl) {
  const wrapper = document.createElement("div");
  wrapper.style.marginBottom = "10px";

  const lbl = document.createElement("label");
  lbl.textContent = label;
  Object.assign(lbl.style, {
    display: "block",
    fontWeight: "600",
    fontSize: "13px",
    marginBottom: "4px",
    color: "#374151",
  });

  wrapper.appendChild(lbl);
  wrapper.appendChild(inputEl);
  return wrapper;
}

function createTextInput(value, placeholder, onChange) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.placeholder = placeholder || "";
  Object.assign(input.style, {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    fontSize: "13px",
  });
  input.addEventListener("input", (e) => onChange(e.target.value));
  return input;
}

function createSelectInput(value, options, onChange) {
  const select = document.createElement("select");
  Object.assign(select.style, {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    fontSize: "13px",
    background: "#ffffff",
  });

  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === value) option.selected = true;
    select.appendChild(option);
  });

  select.addEventListener("change", (e) => onChange(e.target.value));
  return select;
}

function createAddStatementTabContent() {
  const form = currentCaseAnalysisState.addStatementForm;
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "8px";

  // --- Success message ---
  if (form.submitResult) {
    const success = document.createElement("div");
    Object.assign(success.style, {
      padding: "14px",
      background: "#dcfce7",
      border: "1px solid #86efac",
      borderRadius: "10px",
      marginBottom: "12px",
    });

    const title = document.createElement("div");
    title.textContent = "Statement added successfully";
    title.style.fontWeight = "700";
    title.style.marginBottom = "6px";
    success.appendChild(title);

    const details = document.createElement("div");
    details.style.fontSize = "13px";
    const r = form.submitResult;
    details.textContent = `Supplier: ${r.supplier?.supplierName} | Document: ${r.document?.title} | Assertions: ${r.assertions?.length || 0}`;
    success.appendChild(details);

    if (r.missingRegulations?.length) {
      const warn = document.createElement("div");
      warn.textContent = `Regulations not found in DB: ${r.missingRegulations.join(", ")}`;
      warn.style.color = "#92400e";
      warn.style.marginTop = "6px";
      success.appendChild(warn);
    }

    const addMoreBtn = document.createElement("button");
    addMoreBtn.type = "button";
    addMoreBtn.textContent = "Add another";
    Object.assign(addMoreBtn.style, {
      marginTop: "10px",
      padding: "8px 14px",
      border: "1px solid #0176d3",
      borderRadius: "8px",
      background: "#0176d3",
      color: "#fff",
      cursor: "pointer",
      fontWeight: "600",
    });
    addMoreBtn.onclick = () => {
      form.submitResult = null;
      form.submitError = null;
      form.docTitle = "";
      form.docFileName = "";
      form.docUrl = "";
      form.docStatementText = "";
      form.docIssueDate = "";
      form.docValidUntil = "";
      form.dwkItemNumbers = "";
      form.supplierPartNumbers = "";
      form.selectedRegulations = [];
      rerenderCurrentCaseToast();
    };
    success.appendChild(addMoreBtn);

    wrapper.appendChild(success);
    return wrapper;
  }

  // --- Error message ---
  if (form.submitError) {
    const error = document.createElement("div");
    Object.assign(error.style, {
      padding: "10px",
      background: "#fee2e2",
      border: "1px solid #fca5a5",
      borderRadius: "8px",
      marginBottom: "10px",
      color: "#991b1b",
      fontSize: "13px",
    });
    error.textContent = form.submitError;
    wrapper.appendChild(error);
  }

  // --- SUPPLIER SECTION ---
  const supplierSection = document.createElement("div");
  Object.assign(supplierSection.style, {
    padding: "12px",
    border: "1px solid #d8dee4",
    borderRadius: "10px",
    marginBottom: "12px",
    background: "#f6f8fa",
  });

  const supplierTitle = document.createElement("div");
  supplierTitle.textContent = "Supplier";
  Object.assign(supplierTitle.style, { fontWeight: "700", fontSize: "15px", marginBottom: "10px" });
  supplierSection.appendChild(supplierTitle);

  // Search existing suppliers
  const searchWrapper = document.createElement("div");
  searchWrapper.style.marginBottom = "8px";

  const searchInput = createTextInput(
    form.supplierSearchQuery,
    "Search existing suppliers...",
    (v) => {
      form.supplierSearchQuery = v;
      clearTimeout(searchInput._debounce);
      searchInput._debounce = setTimeout(() => searchSuppliersForForm(v), 300);
    }
  );
  searchWrapper.appendChild(searchInput);

  if (form.supplierSearchResults.length > 0) {
    const results = document.createElement("div");
    Object.assign(results.style, {
      maxHeight: "150px",
      overflowY: "auto",
      border: "1px solid #d0d7de",
      borderRadius: "8px",
      marginTop: "4px",
      background: "#fff",
    });

    form.supplierSearchResults.forEach((s) => {
      const item = document.createElement("button");
      item.type = "button";
      Object.assign(item.style, {
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        border: "none",
        borderBottom: "1px solid #f0f0f0",
        background: String(s._id) === String(form.selectedSupplierId) ? "#eef6ff" : "#fff",
        cursor: "pointer",
        fontSize: "13px",
      });
      item.textContent = `${s.supplierName} (${s.supplierCode})`;
      item.onclick = () => {
        form.supplierCode = s.supplierCode;
        form.supplierName = s.supplierName;
        form.supplierAliases = (s.aliases || []).join(", ");
        form.selectedSupplierId = s._id;
        form.isNewSupplier = false;
        form.supplierSearchResults = [];
        form.supplierSearchQuery = "";
        rerenderCurrentCaseToast();
      };
      results.appendChild(item);
    });

    searchWrapper.appendChild(results);
  }

  supplierSection.appendChild(searchWrapper);

  // Selected or new supplier fields
  if (form.supplierCode) {
    const selected = document.createElement("div");
    Object.assign(selected.style, {
      padding: "8px 10px",
      background: "#eef6ff",
      border: "1px solid #93c5fd",
      borderRadius: "8px",
      marginBottom: "8px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    });
    selected.innerHTML = `<span><strong>${form.supplierName}</strong> (${form.supplierCode})</span>`;

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "×";
    Object.assign(clearBtn.style, {
      border: "none",
      background: "none",
      fontSize: "16px",
      cursor: "pointer",
      color: "#6b7280",
    });
    clearBtn.onclick = () => {
      form.supplierCode = "";
      form.supplierName = "";
      form.supplierAliases = "";
      form.selectedSupplierId = null;
      form.isNewSupplier = false;
      rerenderCurrentCaseToast();
    };
    selected.appendChild(clearBtn);
    supplierSection.appendChild(selected);
  }

  // "New supplier" toggle
  if (!form.supplierCode) {
    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.textContent = form.isNewSupplier ? "Cancel new supplier" : "+ New supplier";
    Object.assign(newBtn.style, {
      border: "1px solid #d0d7de",
      borderRadius: "8px",
      padding: "6px 10px",
      cursor: "pointer",
      background: "#fff",
      fontSize: "13px",
      marginBottom: "8px",
    });
    newBtn.onclick = () => {
      form.isNewSupplier = !form.isNewSupplier;
      rerenderCurrentCaseToast();
    };
    supplierSection.appendChild(newBtn);

    if (form.isNewSupplier) {
      supplierSection.appendChild(
        createFormField("Supplier Code *", createTextInput(form.supplierCode, "e.g. SILGAN", (v) => { form.supplierCode = v; }))
      );
      supplierSection.appendChild(
        createFormField("Supplier Name *", createTextInput(form.supplierName, "e.g. Silgan Dispensing Systems", (v) => { form.supplierName = v; }))
      );
      supplierSection.appendChild(
        createFormField("Aliases (comma-separated)", createTextInput(form.supplierAliases, "e.g. SILGAN, Silgan DS", (v) => { form.supplierAliases = v; }))
      );
    }
  }

  wrapper.appendChild(supplierSection);

  // --- DOCUMENT SECTION ---
  const docSection = document.createElement("div");
  Object.assign(docSection.style, {
    padding: "12px",
    border: "1px solid #d8dee4",
    borderRadius: "10px",
    marginBottom: "12px",
    background: "#f6f8fa",
  });

  const docTitle = document.createElement("div");
  docTitle.textContent = "Document";
  Object.assign(docTitle.style, { fontWeight: "700", fontSize: "15px", marginBottom: "10px" });
  docSection.appendChild(docTitle);

  docSection.appendChild(createFormField("Title *", createTextInput(form.docTitle, "Statement title", (v) => { form.docTitle = v; })));
  docSection.appendChild(createFormField("File Name", createTextInput(form.docFileName, "filename.pdf", (v) => { form.docFileName = v; })));
  docSection.appendChild(createFormField("SharePoint URL *", createTextInput(form.docUrl, "https://...sharepoint.com/...", (v) => { form.docUrl = v; })));

  docSection.appendChild(createFormField("Document Type", createSelectInput(form.docType, [
    { value: "certificate", label: "Certificate" },
    { value: "comprehensive_statement", label: "Comprehensive Statement" },
    { value: "declaration", label: "Declaration" },
    { value: "sds", label: "SDS" },
    { value: "tds", label: "TDS" },
    { value: "test_report", label: "Test Report" },
    { value: "email_confirmation", label: "Email Confirmation" },
    { value: "other", label: "Other" },
  ], (v) => { form.docType = v; })));

  const dateRow = document.createElement("div");
  dateRow.style.display = "flex";
  dateRow.style.gap = "10px";

  const issueDateInput = createTextInput(form.docIssueDate, "YYYY-MM-DD", (v) => { form.docIssueDate = v; });
  issueDateInput.type = "date";
  dateRow.appendChild(createFormField("Issue Date", issueDateInput));

  const validUntilInput = createTextInput(form.docValidUntil, "YYYY-MM-DD", (v) => { form.docValidUntil = v; });
  validUntilInput.type = "date";
  dateRow.appendChild(createFormField("Valid Until", validUntilInput));

  docSection.appendChild(dateRow);

  const stTextarea = document.createElement("textarea");
  stTextarea.value = form.docStatementText || "";
  stTextarea.placeholder = "Statement text (optional)";
  Object.assign(stTextarea.style, {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    fontSize: "13px",
    minHeight: "60px",
    resize: "vertical",
  });
  stTextarea.oninput = (e) => { form.docStatementText = e.target.value; };
  docSection.appendChild(createFormField("Statement Text", stTextarea));

  wrapper.appendChild(docSection);

  // --- COVERAGE SECTION ---
  const covSection = document.createElement("div");
  Object.assign(covSection.style, {
    padding: "12px",
    border: "1px solid #d8dee4",
    borderRadius: "10px",
    marginBottom: "12px",
    background: "#f6f8fa",
  });

  const covTitle = document.createElement("div");
  covTitle.textContent = "Coverage";
  Object.assign(covTitle.style, { fontWeight: "700", fontSize: "15px", marginBottom: "10px" });
  covSection.appendChild(covTitle);

  covSection.appendChild(createFormField("Coverage Type", createSelectInput(form.coverageType, [
    { value: "supplier_all", label: "All supplier items" },
    { value: "item_single", label: "Single item" },
    { value: "item_list", label: "Item list" },
    { value: "supplier_subset", label: "Supplier subset" },
    { value: "material_family", label: "Material family" },
  ], (v) => { form.coverageType = v; rerenderCurrentCaseToast(); })));

  if (form.coverageType !== "supplier_all") {
    covSection.appendChild(createFormField("DWK Item Numbers (one per line or comma-separated)", (() => {
      const ta = document.createElement("textarea");
      ta.value = form.dwkItemNumbers || "";
      ta.placeholder = "W010946A, W010947B";
      Object.assign(ta.style, {
        width: "100%",
        boxSizing: "border-box",
        padding: "8px 10px",
        border: "1px solid #d0d7de",
        borderRadius: "8px",
        fontSize: "13px",
        minHeight: "50px",
        resize: "vertical",
      });
      ta.oninput = (e) => { form.dwkItemNumbers = e.target.value; };
      return ta;
    })()));

    covSection.appendChild(createFormField("Supplier Part Numbers (optional)", (() => {
      const ta = document.createElement("textarea");
      ta.value = form.supplierPartNumbers || "";
      ta.placeholder = "5186679, 5186680";
      Object.assign(ta.style, {
        width: "100%",
        boxSizing: "border-box",
        padding: "8px 10px",
        border: "1px solid #d0d7de",
        borderRadius: "8px",
        fontSize: "13px",
        minHeight: "50px",
        resize: "vertical",
      });
      ta.oninput = (e) => { form.supplierPartNumbers = e.target.value; };
      return ta;
    })()));
  }

  wrapper.appendChild(covSection);

  // --- ASSERTION SECTION ---
  const assertSection = document.createElement("div");
  Object.assign(assertSection.style, {
    padding: "12px",
    border: "1px solid #d8dee4",
    borderRadius: "10px",
    marginBottom: "12px",
    background: "#f6f8fa",
  });

  const assertTitle = document.createElement("div");
  assertTitle.textContent = "Assertion & Regulations";
  Object.assign(assertTitle.style, { fontWeight: "700", fontSize: "15px", marginBottom: "10px" });
  assertSection.appendChild(assertTitle);

  assertSection.appendChild(createFormField("Assertion Type", createSelectInput(form.assertionType, [
    { value: "compliant", label: "Compliant" },
    { value: "free_from", label: "Free From" },
    { value: "contains", label: "Contains" },
    { value: "non_compliant", label: "Non-Compliant" },
    { value: "partial", label: "Partial" },
    { value: "informational", label: "Informational" },
  ], (v) => { form.assertionType = v; })));

  // Regulations checkboxes
  const regLabel = document.createElement("div");
  regLabel.textContent = "Regulations *";
  Object.assign(regLabel.style, { fontWeight: "600", fontSize: "13px", marginBottom: "6px", color: "#374151" });
  assertSection.appendChild(regLabel);

  if (form.availableRegulations.length === 0) {
    loadRegulationsIfNeeded();
    const loading = document.createElement("div");
    loading.textContent = "Loading regulations...";
    loading.style.color = "#6b7280";
    loading.style.fontSize = "13px";
    assertSection.appendChild(loading);
  } else {
    const regGrid = document.createElement("div");
    Object.assign(regGrid.style, {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "6px",
    });

    form.availableRegulations.forEach((reg) => {
      const isChecked = form.selectedRegulations.includes(reg.code);

      const label = document.createElement("label");
      Object.assign(label.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "12px",
        cursor: "pointer",
        padding: "4px 6px",
        borderRadius: "6px",
        border: isChecked ? "1px solid #0176d3" : "1px solid #e5e7eb",
        background: isChecked ? "#eef6ff" : "#fff",
      });

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = isChecked;
      checkbox.onchange = () => {
        if (checkbox.checked) {
          form.selectedRegulations.push(reg.code);
        } else {
          form.selectedRegulations = form.selectedRegulations.filter((c) => c !== reg.code);
        }
        rerenderCurrentCaseToast();
      };

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(reg.code));
      regGrid.appendChild(label);
    });

    assertSection.appendChild(regGrid);

    // --- Кнопка + New Regulation и форма ---
    const newRegBtn = document.createElement("button");
    newRegBtn.type = "button";
    newRegBtn.textContent = form.showNewRegulationForm
      ? "Cancel"
      : "+ New regulation";
    Object.assign(newRegBtn.style, {
      marginTop: "8px",
      border: "1px solid #d0d7de",
      borderRadius: "8px",
      padding: "6px 10px",
      cursor: "pointer",
      background: "#fff",
      fontSize: "12px",
    });
    newRegBtn.onclick = () => {
      form.showNewRegulationForm = !form.showNewRegulationForm;
      form.addRegulationError = null;
      rerenderCurrentCaseToast();
    };
    assertSection.appendChild(newRegBtn);

    if (form.showNewRegulationForm) {
      const newRegBlock = document.createElement("div");
      Object.assign(newRegBlock.style, {
        marginTop: "8px",
        padding: "10px",
        border: "1px solid #d0d7de",
        borderRadius: "8px",
        background: "#fff",
      });

      if (form.addRegulationError) {
        const errDiv = document.createElement("div");
        errDiv.textContent = form.addRegulationError;
        Object.assign(errDiv.style, {
          color: "#991b1b",
          fontSize: "12px",
          marginBottom: "8px",
        });
        newRegBlock.appendChild(errDiv);
      }

      newRegBlock.appendChild(
        createFormField(
          "Regulation Code *",
          createTextInput(form.newRegCode, "e.g. CONEG", (v) => {
            form.newRegCode = v;
          })
        )
      );

      newRegBlock.appendChild(
        createFormField(
          "Regulation Name *",
          createTextInput(
            form.newRegName,
            "e.g. Coalition of Northeastern Governors",
            (v) => {
              form.newRegName = v;
            }
          )
        )
      );

      newRegBlock.appendChild(
        createFormField(
          "Category",
          createSelectInput(
            form.newRegCategory,
            [
              { value: "general", label: "General" },
              { value: "chemical", label: "Chemical" },
              { value: "environmental", label: "Environmental" },
              { value: "health", label: "Health & Safety" },
              { value: "medical", label: "Medical" },
            ],
            (v) => {
              form.newRegCategory = v;
            }
          )
        )
      );

      const saveRegBtn = document.createElement("button");
      saveRegBtn.type = "button";
      saveRegBtn.textContent = form.addingRegulation ? "Saving..." : "Save Regulation";
      saveRegBtn.disabled = form.addingRegulation;
      Object.assign(saveRegBtn.style, {
        width: "100%",
        padding: "8px",
        border: "none",
        borderRadius: "8px",
        background: form.addingRegulation ? "#93c5fd" : "#0176d3",
        color: "#fff",
        fontWeight: "600",
        fontSize: "13px",
        cursor: form.addingRegulation ? "default" : "pointer",
      });
      saveRegBtn.onclick = () => submitNewRegulation();
      newRegBlock.appendChild(saveRegBtn);

      assertSection.appendChild(newRegBlock);
    }
  }

  wrapper.appendChild(assertSection);

  // --- SUBMIT ---
  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.textContent = form.submitting ? "Saving..." : "Add Statement";
  submitBtn.disabled = form.submitting;
  Object.assign(submitBtn.style, {
    width: "100%",
    padding: "12px",
    border: "none",
    borderRadius: "10px",
    background: form.submitting ? "#93c5fd" : "#0176d3",
    color: "#fff",
    fontWeight: "700",
    fontSize: "14px",
    cursor: form.submitting ? "default" : "pointer",
  });
  submitBtn.onclick = () => {
    if (!form.supplierCode || !form.supplierName) {
      form.submitError = "Select or create a supplier";
      rerenderCurrentCaseToast();
      return;
    }
    if (!form.docTitle || !form.docUrl) {
      form.submitError = "Document title and URL are required";
      rerenderCurrentCaseToast();
      return;
    }
    if (!form.selectedRegulations.length) {
      form.submitError = "Select at least one regulation";
      rerenderCurrentCaseToast();
      return;
    }
    submitAddStatement();
  };
  wrapper.appendChild(submitBtn);

  return wrapper;
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

  // --- Sub-tab bar ---
  const subTabBar = document.createElement("div");
  Object.assign(subTabBar.style, {
    display: "flex",
    gap: "6px",
    marginBottom: "14px",
    borderBottom: "2px solid #e5e7eb",
    paddingBottom: "8px",
  });

  const createSubTabBtn = (label, key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;

    const isActive = suppliersSubTab === key;

    Object.assign(btn.style, {
      border: "none",
      background: "none",
      padding: "8px 16px",
      cursor: "pointer",
      fontWeight: "700",
      fontSize: "13px",
      color: isActive ? "#0176d3" : "#6b7280",
      borderBottom: isActive ? "2px solid #0176d3" : "2px solid transparent",
      marginBottom: "-10px",
      transition: "color 0.15s, border-color 0.15s",
    });

    btn.onmouseenter = () => {
      if (!isActive) btn.style.color = "#374151";
    };
    btn.onmouseleave = () => {
      if (!isActive) btn.style.color = "#6b7280";
    };

    btn.onclick = () => {
      suppliersSubTab = key;
      rerenderCurrentCaseToast();
    };

    return btn;
  };

  subTabBar.appendChild(createSubTabBtn("Library", "library"));
  subTabBar.appendChild(createSubTabBtn("Analytics", "analytics"));

  wrapper.appendChild(subTabBar);

  // --- Analytics sub-tab ---
  if (suppliersSubTab === "analytics") {
    if (
      !currentCaseAnalysisState.suppliersLibrary &&
      !currentCaseAnalysisState.suppliersLibraryLoading &&
      !currentCaseAnalysisState.suppliersLibraryError
    ) {
      loadSuppliersLibrary(currentCaseAnalysisState.suppliersLibrarySearch || "");
    }

    if (currentCaseAnalysisState.suppliersLibraryLoading) {
      const loading = document.createElement("div");
      Object.assign(loading.style, {
        padding: "40px 20px",
        textAlign: "center",
        color: "#6b7280",
        fontSize: "14px",
      });
      loading.textContent = "Loading suppliers data for analytics...";
      wrapper.appendChild(loading);
      return wrapper;
    }

    if (currentCaseAnalysisState.suppliersLibraryError) {
      wrapper.appendChild(
        createInfoRow("Error", currentCaseAnalysisState.suppliersLibraryError)
      );
      return wrapper;
    }

    wrapper.appendChild(
      createAnalyticsDashboard(currentCaseAnalysisState.suppliersLibrary)
    );
    return wrapper;
  }

  // --- Library sub-tab (original content) ---
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

const lookupResponse = currentCaseAnalysisState.manualLookupResults;

if (parsedQueries.length > 0) {
  body.appendChild(createInfoRow("Parsed part numbers", String(parsedQueries.length)));
}

if (currentCaseAnalysisState.manualLookupResults?.error) {
  body.appendChild(
    createInfoRow("Error", currentCaseAnalysisState.manualLookupResults.error)
  );
}

const lookupMap = buildComponentSuppliersMap({
  componentSuppliersResult: lookupResponse,
});

      if (parsedQueries.length > 0 && lookupResponse && !lookupResponse.error) {
        const resultsBlock = document.createElement("div");
        resultsBlock.style.marginTop = "10px";

        const resultsLabel = document.createElement("strong");
        resultsLabel.textContent = "Lookup results:";
        resultsBlock.appendChild(resultsLabel);

parsedQueries.forEach((partNumber) => {
  const supplierLookup =
    lookupMap.get(String(partNumber).trim().toUpperCase()) || null;

  // --- Компактная карточка без дублирования ---
  const card = document.createElement("div");
  Object.assign(card.style, {
    marginTop: "12px",
    padding: "14px 14px 12px 14px",
    border: "1px solid #d9dee7",
    borderRadius: "14px",
    background: "#f8fafc",
  });

  // Заголовок: part number
  const title = document.createElement("div");
  title.textContent = partNumber;
  Object.assign(title.style, {
    fontSize: "18px",
    fontWeight: "800",
    lineHeight: "1.2",
    color: "#111827",
    marginBottom: "6px",
  });
  card.appendChild(title);

  if (!supplierLookup || !supplierLookup.found) {
    const notFound = document.createElement("div");
    notFound.textContent = "No data found in BOM.";
    Object.assign(notFound.style, {
      color: "#6b7280",
      fontSize: "13px",
      marginTop: "4px",
    });
    card.appendChild(notFound);
    resultsBlock.appendChild(card);
    return;
  }

  // Supplier line
  const suppliersLine = createCompactSuppliersLine(supplierLookup);
  if (suppliersLine) {
    suppliersLine.style.marginBottom = "10px";
    card.appendChild(suppliersLine);
  }

  // Только регуляции с подтверждением (не missing) — компактно в строку
const regRows = buildMaterialRegulationRows(supplierLookup);
const coveredRows = regRows.filter(
  (row) => row.overallStatus !== "missing"
);

if (coveredRows.length > 0) {
  const regSection = document.createElement("div");
  Object.assign(regSection.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "8px",
  });

  coveredRows.forEach((row) => {
    const primaryEvidence =
      row.evidence.find((e) => e.url) || row.evidence[0] || null;
    const url = primaryEvidence?.url || "";

    const badge = document.createElement(url ? "a" : "span");

    if (url) {
      badge.href = url;
      badge.target = "_blank";
      badge.rel = "noopener noreferrer";
    }

    const icon = getRegulationStatusIcon(row.overallStatus);
    badge.textContent = `${icon} ${row.code}`;

    const badgeStyle = getCoverageBadgeStyle(row.overallStatus);

    Object.assign(badge.style, {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 10px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: "700",
      background: badgeStyle.background,
      color: badgeStyle.color,
      border: badgeStyle.border,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: url ? "pointer" : "default",
    });

    regSection.appendChild(badge);
  });

  card.appendChild(regSection);
} else {
  const noReg = document.createElement("div");
  noReg.textContent = "No confirmed regulations.";
  Object.assign(noReg.style, {
    color: "#6b7280",
    fontSize: "13px",
    marginTop: "4px",
  });
  card.appendChild(noReg);
}

  resultsBlock.appendChild(card);
});

        body.appendChild(resultsBlock);
      } else if (parsedQueries.length > 0) {
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
      if (activeCaseToastTab === "add") {
      body.appendChild(createAddStatementTabContent());
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

// ============================================================
// SUPPLIERS ANALYTICS DASHBOARD
// Integrated into the Suppliers tab as a sub-tab
// ============================================================

// --- Sub-tab state ---
// Add this to the top of content-script.js near other state variables:
// let suppliersSubTab = "library"; // "library" | "analytics"

// --- Analytics data processor ---

function humanizeScopeSummary(scopeSummary) {
  const value = String(scopeSummary || "").trim();

  if (value === "supplier_all") return "all supplier items";
  if (value === "item_list") return "specific listed items";
  if (value === "item_single") return "single specific item";
  if (value === "supplier_subset") return "supplier subset";
  if (value === "material_family") return "material family";
  if (value === "component_family") return "component family";
  if (value === "country_specific") return "country-specific scope";
  if (value === "plant_specific") return "plant-specific scope";
  if (!value) return "scope not specified";

  return value;
}

function buildAnalyticsData(suppliersLibrary) {
  const suppliers = Array.isArray(suppliersLibrary?.suppliers)
    ? suppliersLibrary.suppliers
    : [];

  if (!suppliers.length) {
    return {
      suppliers: [],
      regulations: [],
      matrix: [],
      stats: {},
      atRisk: [],
      expiringSoon: [],
      regulationBreakdown: [],
    };
  }

  function isAssertionExpired(assertion) {
    const validUntil = assertion?.validUntil || assertion?.document?.validUntil;
    if (!validUntil) return false;

    const time = new Date(validUntil).getTime();
    if (Number.isNaN(time)) return false;

    return time < Date.now();
  }

  function isAssertionActive(assertion) {
    if (!assertion) return false;
    if (String(assertion.status || "").toLowerCase() !== "active") return false;
    if (isAssertionExpired(assertion)) return false;

    const docStatus = String(assertion?.document?.status || "active").toLowerCase();
    if (docStatus && docStatus !== "active") return false;

    return true;
  }

  function normalizeCoverageBucket(assertion) {
    const coverageLevel = String(assertion?.coverageLevel || "").toLowerCase();
    const allSupplierItems = assertion?.scope?.allSupplierItems === true;

    if (allSupplierItems || coverageLevel === "supplier_all") {
      return "supplier_all";
    }

    if (
      coverageLevel === "item_list" ||
      coverageLevel === "item_single" ||
      coverageLevel === "supplier_subset" ||
      coverageLevel === "material_family" ||
      coverageLevel === "component_family" ||
      coverageLevel === "supplier_partial" ||
      coverageLevel === "country_specific" ||
      coverageLevel === "plant_specific"
    ) {
      return "partial_scope";
    }

    return "partial_scope";
  }

  function resolveRegulationStatus(assertionsForReg) {
    const assertions = Array.isArray(assertionsForReg) ? assertionsForReg : [];
    if (!assertions.length) return "missing";

    const activeAssertions = assertions.filter(isAssertionActive);
    const expiredAssertions = assertions.filter((a) => !isAssertionActive(a));

    const activeNonCompliant = activeAssertions.some(
      (a) => String(a?.assertionType || "").toLowerCase() === "non_compliant"
    );
    if (activeNonCompliant) return "non_compliant";

    const activeSupplierAll = activeAssertions.some(
      (a) => normalizeCoverageBucket(a) === "supplier_all"
    );
    if (activeSupplierAll) return "covered";

    const activeInformationalOnly =
      activeAssertions.length > 0 &&
      activeAssertions.every(
        (a) => String(a?.assertionType || "").toLowerCase() === "informational"
      );
    if (activeInformationalOnly) return "informational";

    const activePartial = activeAssertions.some(
      (a) => normalizeCoverageBucket(a) === "partial_scope"
    );
    if (activePartial) return "partial";

    if (expiredAssertions.length > 0) return "expired";

    return "missing";
  }

  // Collect all unique regulation codes from assertions first, fallback to regulationSummary
  const allRegCodes = new Map();

  suppliers.forEach((supplier) => {
    const assertions = Array.isArray(supplier.assertions) ? supplier.assertions : [];
    assertions.forEach((assertion) => {
      const code = assertion?.regulation?.code;
      const name = assertion?.regulation?.name || code;
      if (code && !allRegCodes.has(code)) {
        allRegCodes.set(code, name);
      }
    });

    const regs = Array.isArray(supplier.regulationSummary)
      ? supplier.regulationSummary
      : [];
    regs.forEach((reg) => {
      if (reg?.regulationCode && !allRegCodes.has(reg.regulationCode)) {
        allRegCodes.set(reg.regulationCode, reg.regulationName || reg.regulationCode);
      }
    });
  });

  const regulations = Array.from(allRegCodes.entries())
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // Build matrix: supplier × regulation → status derived from assertions
  const matrix = suppliers.map((supplier) => {
    const assertions = Array.isArray(supplier.assertions) ? supplier.assertions : [];

    const assertionsByReg = new Map();
    assertions.forEach((assertion) => {
      const code = assertion?.regulation?.code;
      if (!code) return;

      if (!assertionsByReg.has(code)) {
        assertionsByReg.set(code, []);
      }

      assertionsByReg.get(code).push(assertion);
    });
function buildScopeSummary(assertionsForReg) {
  const assertions = Array.isArray(assertionsForReg) ? assertionsForReg : [];
  if (!assertions.length) return "No assertions";

  const activeAssertions = assertions.filter(isAssertionActive);
  const sourceAssertions = activeAssertions.length ? activeAssertions : assertions;

  const coverageLevels = Array.from(
    new Set(
      sourceAssertions
        .map((a) => String(a?.coverageLevel || "").trim())
        .filter(Boolean)
    )
  );

  const hasAllSupplierItems = sourceAssertions.some(
    (a) => a?.scope?.allSupplierItems === true
  );

  if (hasAllSupplierItems || coverageLevels.includes("supplier_all")) {
    return "supplier_all";
  }

  if (coverageLevels.length === 1) {
    return coverageLevels[0];
  }

  if (coverageLevels.length > 1) {
    return coverageLevels.join(", ");
  }

  return "Scope not specified";
}

const cells = regulations.map((reg) => {
  const assertionsForReg = assertionsByReg.get(reg.code) || [];
  const status = resolveRegulationStatus(assertionsForReg);
  const scopeSummary = buildScopeSummary(assertionsForReg);

  return {
    regulationCode: reg.code,
    status,
    scopeSummary,
    assertions: assertionsForReg,
  };
});

    const coveredCount = cells.filter((c) => c.status === "covered").length;
    const partialCount = cells.filter((c) => c.status === "partial").length;
    const totalCount = regulations.length;

    return {
      supplierName: supplier.supplierName || "Unknown",
      supplierCode: supplier.supplierCode || "",
      supplierId: supplier.supplierId || "",
      documentsCount: supplier.documentsCount || 0,
      assertionsCount: supplier.assertionsCount || 0,
      cells,
      coveredCount,
      partialCount,
      totalCount,
      coverageRate: totalCount > 0 ? coveredCount / totalCount : 0,
    };
  });

  // Stats
  const totalSuppliers = suppliers.length;

  const fullyCovered = matrix.filter(
    (row) => row.coveredCount === row.totalCount && row.totalCount > 0
  ).length;

  const withGaps = matrix.filter((row) => {
    const hasAnyCoverage = row.cells.some(
      (c) =>
        c.status === "covered" ||
        c.status === "partial" ||
        c.status === "informational" ||
        c.status === "expired"
    );
    const notFullyCovered = row.coveredCount < row.totalCount;
    return hasAnyCoverage && notFullyCovered;
  }).length;

  const noCoverage = matrix.filter((row) =>
    row.cells.every((c) => c.status === "missing")
  ).length;

  let totalCells = 0;
  let coveredCells = 0;
  let partialCells = 0;
  let expiredCells = 0;
  let nonCompliantCells = 0;
  let informationalCells = 0;

  matrix.forEach((row) => {
    row.cells.forEach((cell) => {
      totalCells++;
      if (cell.status === "covered") coveredCells++;
      if (cell.status === "partial") partialCells++;
      if (cell.status === "expired") expiredCells++;
      if (cell.status === "non_compliant") nonCompliantCells++;
      if (cell.status === "informational") informationalCells++;
    });
  });

  const overallCoverageRate = totalCells > 0 ? coveredCells / totalCells : 0;

  // At risk suppliers (sorted by gaps)
  const atRisk = matrix
    .map((row) => ({
      ...row,
      missingCount: row.cells.filter((c) => c.status === "missing").length,
      partialCount: row.cells.filter((c) => c.status === "partial").length,
      expiredCount: row.cells.filter((c) => c.status === "expired").length,
      nonCompliantCount: row.cells.filter((c) => c.status === "non_compliant").length,
      gapScore:
        row.cells.filter((c) => c.status === "missing").length * 3 +
        row.cells.filter((c) => c.status === "partial").length * 2 +
        row.cells.filter((c) => c.status === "expired").length * 2 +
        row.cells.filter((c) => c.status === "non_compliant").length * 5,
    }))
    .filter((row) => row.gapScore > 0)
    .sort((a, b) => b.gapScore - a.gapScore);

  // Regulation breakdown
  const regulationBreakdown = regulations.map((reg) => {
    let covered = 0;
    let partial = 0;
    let missing = 0;
    let expired = 0;
    let nonCompliant = 0;
    let informational = 0;

    matrix.forEach((row) => {
      const cell = row.cells.find((c) => c.regulationCode === reg.code);
      const status = cell?.status || "missing";

      if (status === "covered") covered++;
      else if (status === "partial") partial++;
      else if (status === "expired") expired++;
      else if (status === "non_compliant") nonCompliant++;
      else if (status === "informational") informational++;
      else missing++;
    });

    return {
      code: reg.code,
      name: reg.name,
      covered,
      partial,
      missing,
      expired,
      nonCompliant,
      informational,
      total: totalSuppliers,
      coverageRate: totalSuppliers > 0 ? covered / totalSuppliers : 0,
    };
  });

  // Expiring soon
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const sixtyDays = 60 * 24 * 60 * 60 * 1000;
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;

  const expiringSoon = [];
  suppliers.forEach((supplier) => {
    (supplier.assertions || []).forEach((assertion) => {
      const validUntil = assertion.validUntil || assertion?.document?.validUntil;
      if (!validUntil) return;

      const expDate = new Date(validUntil);
      if (Number.isNaN(expDate.getTime())) return;

      const diff = expDate.getTime() - now;
      if (diff < 0 || diff > ninetyDays) return;

      let urgency = "90d";
      if (diff <= thirtyDays) urgency = "30d";
      else if (diff <= sixtyDays) urgency = "60d";

      expiringSoon.push({
        supplierName: supplier.supplierName,
        supplierCode: supplier.supplierCode,
        regulationCode: assertion?.regulation?.code || "",
        regulationName: assertion?.regulation?.name || "",
        documentTitle: assertion?.document?.title || "",
        validUntil: expDate.toISOString(),
        urgency,
        daysLeft: Math.ceil(diff / (24 * 60 * 60 * 1000)),
      });
    });
  });

  expiringSoon.sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    suppliers,
    regulations,
    matrix,
    stats: {
      totalSuppliers,
      fullyCovered,
      withGaps,
      noCoverage,
      totalRegulations: regulations.length,
      overallCoverageRate,
      totalCells,
      coveredCells,
      partialCells,
      expiredCells,
      nonCompliantCells,
      informationalCells,
    },
    atRisk,
    expiringSoon,
    regulationBreakdown,
  };
}

// --- Render functions ---

function createAnalyticsStatCard(label, value, subtext, accentColor) {
  const card = document.createElement("div");
  Object.assign(card.style, {
    padding: "16px 18px",
    background: "#ffffff",
    border: "1px solid #d9dee7",
    borderRadius: "16px",
    minWidth: "0",
  });

  const labelEl = document.createElement("div");
  labelEl.textContent = label;
  Object.assign(labelEl.style, {
    fontSize: "12px",
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "8px",
  });

  const valueEl = document.createElement("div");
  valueEl.textContent = String(value);
  Object.assign(valueEl.style, {
    fontSize: "32px",
    fontWeight: "800",
    color: accentColor || "#111827",
    lineHeight: "1",
    marginBottom: subtext ? "6px" : "0",
  });

  card.appendChild(labelEl);
  card.appendChild(valueEl);

  if (subtext) {
    const sub = document.createElement("div");
    sub.textContent = subtext;
    Object.assign(sub.style, {
      fontSize: "12px",
      color: "#9ca3af",
    });
    card.appendChild(sub);
  }

  return card;
}

function createAnalyticsStatsBar(stats) {
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "12px",
    marginBottom: "24px",
  });

  wrapper.appendChild(
    createAnalyticsStatCard(
      "Suppliers",
      stats.totalSuppliers,
      `${stats.totalRegulations} regulations tracked`,
      "#111827"
    )
  );

  wrapper.appendChild(
    createAnalyticsStatCard(
      "Fully Covered",
      stats.fullyCovered,
      `${stats.totalSuppliers > 0 ? Math.round((stats.fullyCovered / stats.totalSuppliers) * 100) : 0}% of suppliers`,
      "#16a34a"
    )
  );

  wrapper.appendChild(
    createAnalyticsStatCard(
      "With Gaps",
      stats.withGaps,
      "partial coverage",
      "#ea580c"
    )
  );

  wrapper.appendChild(
    createAnalyticsStatCard(
      "No Coverage",
      stats.noCoverage,
      "no statements",
      "#dc2626"
    )
  );

  wrapper.appendChild(
    createAnalyticsStatCard(
      "Coverage Rate",
      `${Math.round(stats.overallCoverageRate * 100)}%`,
      `${stats.coveredCells} / ${stats.totalCells} cells`,
      stats.overallCoverageRate >= 0.8 ? "#16a34a" : stats.overallCoverageRate >= 0.5 ? "#ea580c" : "#dc2626"
    )
  );

  return wrapper;
}

function getMatrixCellColor(status) {
  switch (status) {
    case "covered":
      return { bg: "#dcfce7", text: "#166534", symbol: "✓" };
    case "partial":
      return { bg: "#fef3c7", text: "#92400e", symbol: "◐" };
    case "expired":
      return { bg: "#f3f4f6", text: "#6b7280", symbol: "⏱" };
    case "non_compliant":
      return { bg: "#fee2e2", text: "#991b1b", symbol: "✗" };
    case "informational":
      return { bg: "#e0f2fe", text: "#075985", symbol: "i" };
    default:
      return { bg: "#f9fafb", text: "#d1d5db", symbol: "—" };
  }
}

function createComplianceMatrix(data) {
  const section = document.createElement("div");
  Object.assign(section.style, {
    marginBottom: "28px",
  });

  const title = document.createElement("div");
  title.textContent = "Compliance Matrix";
  Object.assign(title.style, {
    fontSize: "18px",
    fontWeight: "800",
    color: "#111827",
    marginBottom: "4px",
  });
  section.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.textContent = "Supplier × Regulation coverage heatmap";
  Object.assign(subtitle.style, {
    fontSize: "13px",
    color: "#6b7280",
    marginBottom: "14px",
  });
  section.appendChild(subtitle);

  if (!data.matrix.length || !data.regulations.length) {
    const empty = document.createElement("div");
    empty.textContent = "No data available for matrix view.";
    Object.assign(empty.style, { color: "#6b7280", fontSize: "14px" });
    section.appendChild(empty);
    return section;
  }

  const scrollWrapper = document.createElement("div");
  Object.assign(scrollWrapper.style, {
    overflowX: "auto",
    border: "1px solid #d9dee7",
    borderRadius: "14px",
    background: "#ffffff",
  });

  const table = document.createElement("table");
  Object.assign(table.style, {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "12px",
    minWidth: `${200 + data.regulations.length * 72}px`,
  });

  // Header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const cornerCell = document.createElement("th");
  cornerCell.textContent = "Supplier";
  Object.assign(cornerCell.style, {
    position: "sticky",
    left: "0",
    zIndex: "2",
    background: "#f8fafc",
    padding: "10px 12px",
    textAlign: "left",
    fontWeight: "700",
    borderBottom: "2px solid #d9dee7",
    borderRight: "1px solid #e5e7eb",
    minWidth: "180px",
    fontSize: "12px",
    color: "#374151",
  });
  headerRow.appendChild(cornerCell);

  data.regulations.forEach((reg) => {
    const th = document.createElement("th");
    th.textContent = reg.code;
    th.title = reg.name;
    Object.assign(th.style, {
      padding: "10px 6px",
      textAlign: "center",
      fontWeight: "700",
      borderBottom: "2px solid #d9dee7",
      borderRight: "1px solid #f0f0f0",
      background: "#f8fafc",
      fontSize: "11px",
      color: "#374151",
      minWidth: "64px",
      whiteSpace: "nowrap",
    });
    headerRow.appendChild(th);
  });

  // Coverage rate column
  const rateHeader = document.createElement("th");
  rateHeader.textContent = "Rate";
  Object.assign(rateHeader.style, {
    padding: "10px 10px",
    textAlign: "center",
    fontWeight: "700",
    borderBottom: "2px solid #d9dee7",
    background: "#f8fafc",
    fontSize: "11px",
    color: "#374151",
    minWidth: "60px",
  });
  headerRow.appendChild(rateHeader);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement("tbody");

  // Sort matrix by coverage rate ascending (worst first)
  const sortedMatrix = [...data.matrix].sort((a, b) => a.coverageRate - b.coverageRate);

  sortedMatrix.forEach((row, rowIdx) => {
    const tr = document.createElement("tr");
    Object.assign(tr.style, {
      background: rowIdx % 2 === 0 ? "#ffffff" : "#fafbfc",
    });

    const supplierCell = document.createElement("td");
    Object.assign(supplierCell.style, {
      position: "sticky",
      left: "0",
      zIndex: "1",
      background: rowIdx % 2 === 0 ? "#ffffff" : "#fafbfc",
      padding: "8px 12px",
      borderBottom: "1px solid #f0f0f0",
      borderRight: "1px solid #e5e7eb",
      fontWeight: "600",
      fontSize: "12px",
      color: "#111827",
      maxWidth: "200px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    supplierCell.textContent = row.supplierName;
    supplierCell.title = `${row.supplierName} (${row.supplierCode})`;
    tr.appendChild(supplierCell);

    row.cells.forEach((cell) => {
      const td = document.createElement("td");
      const colorInfo = getMatrixCellColor(cell.status);

      Object.assign(td.style, {
        padding: "6px 4px",
        textAlign: "center",
        borderBottom: "1px solid #f0f0f0",
        borderRight: "1px solid #f0f0f0",
        background: colorInfo.bg,
        color: colorInfo.text,
        fontWeight: "700",
        fontSize: "13px",
        cursor: "default",
      });

td.textContent = colorInfo.symbol;

const humanScope = humanizeScopeSummary(cell.scopeSummary);

const scopeLabel =
  cell.status === "covered"
    ? `Covered: ${humanScope}`
    : cell.status === "partial"
    ? `Partial: ${humanScope}`
    : cell.status === "non_compliant"
    ? `Non-compliant: ${humanScope}`
    : cell.status === "expired"
    ? `Expired: ${humanScope}`
    : cell.status === "informational"
    ? `Informational: ${humanScope}`
    : "Missing: no assertions";

td.title = `${row.supplierName} — ${cell.regulationCode}\n${scopeLabel}`;

tr.appendChild(td);
    });

    // Rate cell
    const rateTd = document.createElement("td");
    const rate = Math.round(row.coverageRate * 100);
    Object.assign(rateTd.style, {
      padding: "6px 8px",
      textAlign: "center",
      borderBottom: "1px solid #f0f0f0",
      fontWeight: "700",
      fontSize: "12px",
      color: rate >= 80 ? "#16a34a" : rate >= 50 ? "#92400e" : "#dc2626",
    });
    rateTd.textContent = `${rate}%`;
    tr.appendChild(rateTd);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  scrollWrapper.appendChild(table);
  section.appendChild(scrollWrapper);

  // Legend
  const legend = document.createElement("div");
  Object.assign(legend.style, {
    display: "flex",
    gap: "16px",
    marginTop: "10px",
    flexWrap: "wrap",
  });

const statuses = [
  { status: "covered", label: "Covered = all supplier items" },
  { status: "partial", label: "Partial = specific items / subset / family" },
  { status: "expired", label: "Expired" },
  { status: "non_compliant", label: "Non-compliant" },
  { status: "informational", label: "Info only" },
  { status: "missing", label: "Missing = no assertions" },
];

  statuses.forEach((item) => {
    const colorInfo = getMatrixCellColor(item.status);
    const legendItem = document.createElement("div");
    Object.assign(legendItem.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "12px",
      color: "#4b5563",
    });

    const dot = document.createElement("span");
    Object.assign(dot.style, {
      width: "16px",
      height: "16px",
      borderRadius: "4px",
      background: colorInfo.bg,
      border: "1px solid #d0d7de",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "10px",
      fontWeight: "700",
      color: colorInfo.text,
    });
    dot.textContent = colorInfo.symbol;

    legendItem.appendChild(dot);
    legendItem.appendChild(document.createTextNode(item.label));
    legend.appendChild(legendItem);
  });

  section.appendChild(legend);

  return section;
}

function createRegulationBreakdownSection(data) {
  const section = document.createElement("div");
  Object.assign(section.style, {
    marginBottom: "28px",
  });

  const title = document.createElement("div");
  title.textContent = "Coverage by Regulation";
  Object.assign(title.style, {
    fontSize: "18px",
    fontWeight: "800",
    color: "#111827",
    marginBottom: "4px",
  });
  section.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.textContent = "How many suppliers are covered per regulation";
  Object.assign(subtitle.style, {
    fontSize: "13px",
    color: "#6b7280",
    marginBottom: "14px",
  });
  section.appendChild(subtitle);

  if (!data.regulationBreakdown.length) {
    const empty = document.createElement("div");
    empty.textContent = "No regulation data available.";
    Object.assign(empty.style, { color: "#6b7280", fontSize: "14px" });
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement("div");
  Object.assign(list.style, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });

  // Sort by coverage rate ascending
  const sorted = [...data.regulationBreakdown].sort(
    (a, b) => a.coverageRate - b.coverageRate
  );

  sorted.forEach((reg) => {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "12px 14px",
      background: "#ffffff",
      border: "1px solid #d9dee7",
      borderRadius: "12px",
    });

    // Label
    const label = document.createElement("div");
    Object.assign(label.style, {
      minWidth: "120px",
      fontWeight: "700",
      fontSize: "13px",
      color: "#111827",
    });
    label.textContent = reg.code;
    label.title = reg.name;
    row.appendChild(label);

    // Stacked bar
    const barContainer = document.createElement("div");
    Object.assign(barContainer.style, {
      flex: "1",
      height: "22px",
      background: "#f3f4f6",
      borderRadius: "6px",
      overflow: "hidden",
      display: "flex",
    });

    const segments = [
      { count: reg.covered, color: "#22c55e" },
      { count: reg.partial, color: "#f59e0b" },
      { count: reg.informational, color: "#38bdf8" },
      { count: reg.expired, color: "#9ca3af" },
      { count: reg.nonCompliant, color: "#ef4444" },
    ];

    segments.forEach((seg) => {
      if (seg.count <= 0) return;
      const pct = (seg.count / reg.total) * 100;
      const bar = document.createElement("div");
      Object.assign(bar.style, {
        width: `${pct}%`,
        height: "100%",
        background: seg.color,
        transition: "width 0.3s ease",
      });
      barContainer.appendChild(bar);
    });

    row.appendChild(barContainer);

    // Numbers
    const numbers = document.createElement("div");
    Object.assign(numbers.style, {
      minWidth: "80px",
      textAlign: "right",
      fontSize: "13px",
      fontWeight: "700",
      color: reg.coverageRate >= 0.8 ? "#16a34a" : reg.coverageRate >= 0.5 ? "#92400e" : "#dc2626",
    });
    numbers.textContent = `${reg.covered}/${reg.total} (${Math.round(reg.coverageRate * 100)}%)`;
    row.appendChild(numbers);

    list.appendChild(row);
  });

  section.appendChild(list);
  return section;
}

function createAtRiskSection(data) {
  const section = document.createElement("div");
  Object.assign(section.style, {
    marginBottom: "28px",
  });

  const title = document.createElement("div");
  title.textContent = "Suppliers at Risk";
  Object.assign(title.style, {
    fontSize: "18px",
    fontWeight: "800",
    color: "#111827",
    marginBottom: "4px",
  });
  section.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.textContent = "Ranked by compliance gaps — worst first";
  Object.assign(subtitle.style, {
    fontSize: "13px",
    color: "#6b7280",
    marginBottom: "14px",
  });
  section.appendChild(subtitle);

  const topRisk = data.atRisk.slice(0, 15);

  if (!topRisk.length) {
    const ok = document.createElement("div");
    Object.assign(ok.style, {
      padding: "16px",
      background: "#dcfce7",
      border: "1px solid #86efac",
      borderRadius: "12px",
      color: "#166534",
      fontWeight: "600",
      fontSize: "14px",
    });
    ok.textContent = "All suppliers have full coverage — no gaps detected.";
    section.appendChild(ok);
    return section;
  }

  const list = document.createElement("div");
  Object.assign(list.style, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });

  topRisk.forEach((row, idx) => {
    const card = document.createElement("div");
    Object.assign(card.style, {
      display: "flex",
      alignItems: "center",
      gap: "14px",
      padding: "12px 14px",
      background: "#ffffff",
      border: "1px solid #d9dee7",
      borderRadius: "12px",
    });

    // Rank
    const rank = document.createElement("div");
    Object.assign(rank.style, {
      width: "28px",
      height: "28px",
      borderRadius: "999px",
      background: idx < 3 ? "#fee2e2" : "#f3f4f6",
      color: idx < 3 ? "#dc2626" : "#6b7280",
      fontWeight: "800",
      fontSize: "12px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
    });
    rank.textContent = String(idx + 1);
    card.appendChild(rank);

    // Name
    const nameBlock = document.createElement("div");
    nameBlock.style.flex = "1";

    const nameEl = document.createElement("div");
    Object.assign(nameEl.style, {
      fontWeight: "700",
      fontSize: "14px",
      color: "#111827",
      marginBottom: "2px",
    });
    nameEl.textContent = row.supplierName;

    const codeEl = document.createElement("div");
    Object.assign(codeEl.style, {
      fontSize: "12px",
      color: "#6b7280",
    });
    codeEl.textContent = row.supplierCode || "";

    nameBlock.appendChild(nameEl);
    nameBlock.appendChild(codeEl);
    card.appendChild(nameBlock);

    // Progress bar
    const progressWrapper = document.createElement("div");
    Object.assign(progressWrapper.style, {
      width: "120px",
      flexShrink: "0",
    });

    const progressBg = document.createElement("div");
    Object.assign(progressBg.style, {
      width: "100%",
      height: "8px",
      background: "#f3f4f6",
      borderRadius: "4px",
      overflow: "hidden",
    });

    const progressFill = document.createElement("div");
    const pct = Math.round(row.coverageRate * 100);
    Object.assign(progressFill.style, {
      width: `${pct}%`,
      height: "100%",
      background: pct >= 80 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444",
      borderRadius: "4px",
    });
    progressBg.appendChild(progressFill);

    const progressLabel = document.createElement("div");
    Object.assign(progressLabel.style, {
      fontSize: "11px",
      color: "#6b7280",
      marginTop: "3px",
      textAlign: "center",
    });
    progressLabel.textContent = `${row.coveredCount}/${row.totalCount}`;

    progressWrapper.appendChild(progressBg);
    progressWrapper.appendChild(progressLabel);
    card.appendChild(progressWrapper);

    // Gap badges
    const badges = document.createElement("div");
    Object.assign(badges.style, {
      display: "flex",
      gap: "6px",
      flexShrink: "0",
    });

    if (row.nonCompliantCount > 0) {
      const badge = document.createElement("span");
      Object.assign(badge.style, {
        padding: "3px 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: "700",
        background: "#fee2e2",
        color: "#991b1b",
        border: "1px solid #fca5a5",
      });
      badge.textContent = `${row.nonCompliantCount} non-compliant`;
      badges.appendChild(badge);
    }

    if (row.missingCount > 0) {
      const badge = document.createElement("span");
      Object.assign(badge.style, {
        padding: "3px 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: "700",
        background: "#f3f4f6",
        color: "#4b5563",
        border: "1px solid #d1d5db",
      });
      badge.textContent = `${row.missingCount} missing`;
      badges.appendChild(badge);
    }

    if (row.expiredCount > 0) {
      const badge = document.createElement("span");
      Object.assign(badge.style, {
        padding: "3px 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: "700",
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fcd34d",
      });
      badge.textContent = `${row.expiredCount} expired`;
      badges.appendChild(badge);
    }

    card.appendChild(badges);
    list.appendChild(card);
  });

  section.appendChild(list);
  return section;
}

function createExpiringSoonSection(data) {
  const section = document.createElement("div");
  Object.assign(section.style, {
    marginBottom: "28px",
  });

  const title = document.createElement("div");
  title.textContent = "Expiring Soon";
  Object.assign(title.style, {
    fontSize: "18px",
    fontWeight: "800",
    color: "#111827",
    marginBottom: "4px",
  });
  section.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.textContent = "Statements expiring within the next 90 days";
  Object.assign(subtitle.style, {
    fontSize: "13px",
    color: "#6b7280",
    marginBottom: "14px",
  });
  section.appendChild(subtitle);

  if (!data.expiringSoon.length) {
    const ok = document.createElement("div");
    Object.assign(ok.style, {
      padding: "16px",
      background: "#dcfce7",
      border: "1px solid #86efac",
      borderRadius: "12px",
      color: "#166534",
      fontWeight: "600",
      fontSize: "14px",
    });
    ok.textContent = "No statements expiring in the next 90 days.";
    section.appendChild(ok);
    return section;
  }

  const grid = document.createElement("div");
  Object.assign(grid.style, {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "10px",
  });

  data.expiringSoon.slice(0, 20).forEach((item) => {
    const card = document.createElement("div");
    Object.assign(card.style, {
      padding: "12px 14px",
      background: "#ffffff",
      border: `1px solid ${item.urgency === "30d" ? "#fca5a5" : item.urgency === "60d" ? "#fcd34d" : "#d9dee7"}`,
      borderRadius: "12px",
      borderLeft: `4px solid ${item.urgency === "30d" ? "#ef4444" : item.urgency === "60d" ? "#f59e0b" : "#9ca3af"}`,
    });

    const topRow = document.createElement("div");
    Object.assign(topRow.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "6px",
    });

    const supplierEl = document.createElement("div");
    Object.assign(supplierEl.style, {
      fontWeight: "700",
      fontSize: "13px",
      color: "#111827",
    });
    supplierEl.textContent = item.supplierName;

    const daysEl = document.createElement("div");
    Object.assign(daysEl.style, {
      fontWeight: "800",
      fontSize: "13px",
      color: item.urgency === "30d" ? "#dc2626" : item.urgency === "60d" ? "#ea580c" : "#6b7280",
    });
    daysEl.textContent = `${item.daysLeft}d left`;

    topRow.appendChild(supplierEl);
    topRow.appendChild(daysEl);
    card.appendChild(topRow);

    const regEl = document.createElement("div");
    Object.assign(regEl.style, {
      fontSize: "12px",
      color: "#4b5563",
      marginBottom: "2px",
    });
    regEl.textContent = `${item.regulationCode}${item.regulationName ? " — " + item.regulationName : ""}`;
    card.appendChild(regEl);

    if (item.documentTitle) {
      const docEl = document.createElement("div");
      Object.assign(docEl.style, {
        fontSize: "12px",
        color: "#6b7280",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      docEl.textContent = item.documentTitle;
      card.appendChild(docEl);
    }

    grid.appendChild(card);
  });

  section.appendChild(grid);
  return section;
}

// ============================================================
// MAIN: Create the full analytics dashboard DOM
// ============================================================

function createAnalyticsDashboard(suppliersLibrary) {
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "8px";

  const data = buildAnalyticsData(suppliersLibrary);

  if (!data.suppliers.length) {
    const empty = document.createElement("div");
    Object.assign(empty.style, {
      padding: "24px",
      textAlign: "center",
      color: "#6b7280",
      fontSize: "14px",
    });
    empty.textContent = "No supplier data loaded. Search for suppliers in the Library tab first.";
    wrapper.appendChild(empty);
    return wrapper;
  }

  wrapper.appendChild(createAnalyticsStatsBar(data.stats));
  wrapper.appendChild(createComplianceMatrix(data));
  wrapper.appendChild(createRegulationBreakdownSection(data));
  wrapper.appendChild(createAtRiskSection(data));
  wrapper.appendChild(createExpiringSoonSection(data));

  return wrapper;
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