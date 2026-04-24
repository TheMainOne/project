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
  suppliersLibraryRegFilter: "",
  suppliersLibraryStatusFilter: "all",
  suppliersLibraryDocSearch: "",
  selectedSupplierLibraryId: null,
  supplierContactForm: null,   // null | { mode: "add"|"edit", contactId?, name, email, phone, role, notes, saving, error }
  supplierContactDeleting: null, // contactId being deleted

  analyticsMatrixFilter: "all",
  analyticsMatrixSearch: "",
  analyticsMatrixSort: { by: "coverageRate", dir: "asc" },
  analyticsMatrixView: "table",
  analyticsMatrixMode: "status",
  analyticsRegSort: "coverage_asc",
  analyticsComparisonSelected: [],

  freshnessSort: { by: "oldestDoc", dir: "desc" },
  freshnessExpanded: [],
  atRiskExpanded: [],
  stmtBrowserSupplier: "",
  stmtBrowserReg: "",
  stmtBrowserAge: "all",

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

    defaultAssertionType: "compliant",
    selectedRegulations: [],
    regulationAssertionTypes: {},

    availableRegulations: [],
    supplierSearchResults: [],
    supplierSearchQuery: "",

    submitting: false,
    submitResult: null,
    submitError: null,
  },

  outreachList: null,
  outreachLoading: false,
  outreachError: null,
  outreachFilter: "all",
  outreachShowForm: false,
  outreachReminders: {},
  outreachReminderPickerFor: null,
  outreachReminderDate: "",
  outreachForm: {
    supplierId: "",
    supplierName: "",
    supplierSearchQuery: "",
    supplierSearchResults: [],
    contactEmail: "",
    subject: "",
    method: "email",
    sentAt: "",
    followUpDays: "7",
    notes: "",
    regulationTags: [],
    submitting: false,
    submitError: null,
  },

  complianceSnapshots: [],

  analyticsExpandedSections: {
    nonCompliant: true,
    complianceMatrix: false,
    supplierFreshness: false,
    statementBrowser: false,
    regulationBreakdown: false,
    atRisk: true,
    expiringSoon: true,
  },

  cachedAt: null,
  suppliersLibraryCachedAt: null,
  globalSearchQuery: "",
};

let activeCaseRequestToken = 0;
let lastCompletedRecordId = null;
let isCaseToastExpanded = false;
let wasPanelOpen = true; // auto-open panel by default; set to false when user explicitly closes
let isCaseToastMinimized = false;
let panelPosition = { x: null, y: null };
let panelSize = { width: 860, height: null };
let _isDragging = false;
let _dragOffsetX = 0;
let _dragOffsetY = 0;
let _isResizing = false;
let _resizeStartX = 0;
let _resizeStartY = 0;
let _resizeStartWidth = 0;
let _resizeStartHeight = 0;
let _panelInteractionListenersAttached = false;

chrome.storage.local.get(["panelLayout"], (result) => {
  if (result.panelLayout) {
    if (result.panelLayout.position && result.panelLayout.position.x !== null) {
      panelPosition = result.panelLayout.position;
    }
    if (result.panelLayout.size) {
      panelSize = result.panelLayout.size;
    }
  }
});

function resetCaseAnalysisState() {
  activeCaseToastTab = "overview";
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
    suppliersLibraryRegFilter: "",
    suppliersLibraryStatusFilter: "all",
    suppliersLibraryDocSearch: "",
    selectedSupplierLibraryId: null,
    supplierContactForm: null,
    supplierContactDeleting: null,

    analyticsMatrixFilter: "all",
    analyticsMatrixSearch: "",
    analyticsMatrixSort: { by: "coverageRate", dir: "asc" },
    analyticsMatrixView: "table",
    analyticsMatrixMode: "status",
    analyticsRegSort: "coverage_asc",
    analyticsComparisonSelected: [],

    freshnessSort: { by: "oldestDoc", dir: "desc" },
    freshnessExpanded: [],
    atRiskExpanded: [],
    stmtBrowserSupplier: "",
    stmtBrowserReg: "",
    stmtBrowserAge: "all",

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

      defaultAssertionType: "compliant",
      selectedRegulations: [],
      regulationAssertionTypes: {},

      availableRegulations: [],
      supplierSearchResults: [],
      supplierSearchQuery: "",

      submitting: false,
      submitResult: null,
      submitError: null,
    },

    outreachList: null,
    outreachLoading: false,
    outreachError: null,
    outreachFilter: "all",
    outreachShowForm: false,
    outreachReminders: {},
    outreachReminderPickerFor: null,
    outreachReminderDate: "",
    outreachForm: {
      supplierId: "",
      supplierName: "",
      supplierSearchQuery: "",
      supplierSearchResults: [],
      contactEmail: "",
      subject: "",
      method: "email",
      sentAt: "",
      followUpDays: "7",
      notes: "",
      regulationTags: [],
      submitting: false,
      submitError: null,
    },

    complianceSnapshots: [],

    analyticsExpandedSections: {
      nonCompliant: true,
      complianceMatrix: false,
      supplierFreshness: false,
      statementBrowser: false,
      regulationBreakdown: false,
      atRisk: true,
      expiringSoon: true,
    },

    cachedAt: null,
    suppliersLibraryCachedAt: null,
    globalSearchQuery: "",
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

function captureFocusState(root) {
  if (!root) return null;
  const el = document.activeElement;
  if (!el || !root.contains(el)) return null;
  const focusId = el.getAttribute && el.getAttribute("data-focus-id");
  if (!focusId) return null;
  const state = { focusId };
  if (typeof el.selectionStart === "number") {
    state.selectionStart = el.selectionStart;
    state.selectionEnd = el.selectionEnd;
    state.selectionDirection = el.selectionDirection || "none";
  }
  return state;
}
 
function restoreFocusState(root, state) {
  if (!root || !state) return;
  const el = root.querySelector(`[data-focus-id="${state.focusId}"]`);
  if (!el) return;
  el.focus();
  if (
    typeof state.selectionStart === "number" &&
    typeof el.setSelectionRange === "function"
  ) {
    try {
      el.setSelectionRange(
        state.selectionStart,
        state.selectionEnd,
        state.selectionDirection
      );
    } catch (_) {
      /* setSelectionRange not supported on this input type */
    }
  }
}


function rerenderCurrentCaseToast() {
  if (!currentCaseAnalysisState.payload || !currentCaseAnalysisState.response) return;
  const toast = document.querySelector("#sf-compliance-case-toast");
  const body = toast ? toast.querySelector("#sf-compliance-case-toast-body") : null;
  const focusState = captureFocusState(body);
  renderCaseToastAnalysis(
    currentCaseAnalysisState.payload,
    currentCaseAnalysisState.response
  );
  restoreFocusState(body, focusState);
  applyMinimizeState();
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

async function loadSuppliersLibrary(search = "", forceRefresh = false) {
  currentCaseAnalysisState.suppliersLibraryLoading = true;
  currentCaseAnalysisState.suppliersLibraryError = null;
  rerenderCurrentCaseToast();

  const response = await sendMessageAsync({
    type: "SF_SUPPLIERS_LIBRARY",
    payload: { search, forceRefresh },
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
  currentCaseAnalysisState.suppliersLibraryCachedAt = response.fromCache ? (response.cachedAt || null) : null;

  const selectedStillExists = suppliers.some(
    (item) =>
      String(item?.supplierId || "") ===
      String(currentCaseAnalysisState.selectedSupplierLibraryId || "")
  );

  if (!selectedStillExists) {
    currentCaseAnalysisState.selectedSupplierLibraryId =
      suppliers[0]?.supplierId || null;
  }

  // Load existing snapshots for trend display, then save a new snapshot
  const snapshotsResponse = await sendMessageAsync({ type: "EXT_GET_COMPLIANCE_SNAPSHOTS" });
  currentCaseAnalysisState.complianceSnapshots = snapshotsResponse?.snapshots || [];

  const analyticsData = buildAnalyticsData(currentCaseAnalysisState.suppliersLibrary);
  if (analyticsData.stats.totalSuppliers > 0) {
    const compliancePercent = Math.round(
      (analyticsData.stats.fullyCovered / analyticsData.stats.totalSuppliers) * 100
    );
    const coveragePercent = Math.round((analyticsData.stats.overallCoverageRate || 0) * 100);
    sendMessageAsync({
      type: "EXT_SAVE_COMPLIANCE_SNAPSHOT",
      payload: {
        compliancePercent,
        coveragePercent,
        totalSuppliers: analyticsData.stats.totalSuppliers,
      },
    });
  }

  rerenderCurrentCaseToast();
}

async function loadOutreachList() {
  currentCaseAnalysisState.outreachLoading = true;
  currentCaseAnalysisState.outreachError = null;
  rerenderCurrentCaseToast();

  const response = await sendMessageAsync({ type: "EXT_GET_OUTREACH", payload: {} });

  if (!response?.ok) {
    currentCaseAnalysisState.outreachLoading = false;
    currentCaseAnalysisState.outreachError = response?.error || "Failed to load outreach records";
    rerenderCurrentCaseToast();
    return;
  }

  currentCaseAnalysisState.outreachList = response.records || [];
  currentCaseAnalysisState.outreachLoading = false;
  currentCaseAnalysisState.outreachError = null;

  // Load reminders in parallel
  sendMessageAsync({ type: "EXT_GET_REMINDERS" }).then((r) => {
    currentCaseAnalysisState.outreachReminders = r?.reminders || {};
    rerenderCurrentCaseToast();
  });

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

function formatCacheAge(ts) {
  if (!ts) return "unknown";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "just now";
  if (hours < 1) return `${mins}m ago`;
  if (days < 1) return `${hours}h ago`;
  return `${days}d ago`;
}

function createOfflineBanner(cachedAt) {
  const banner = document.createElement("div");
  Object.assign(banner.style, {
    background: "#fef3c7",
    color: "#92400e",
    fontSize: "11px",
    padding: "5px 10px",
    borderRadius: "6px",
    marginBottom: "10px",
    border: "1px solid #fde68a",
    display: "flex",
    alignItems: "center",
    gap: "5px",
  });
  banner.textContent = `⚠ Offline — cached data from ${formatCacheAge(cachedAt)}`;
  return banner;
}

function initSkeletonStyles() {
  if (document.getElementById("sf-skeleton-styles")) return;
  const style = document.createElement("style");
  style.id = "sf-skeleton-styles";
  style.textContent = `
    @keyframes sf-shimmer {
      0% { background-position: -400px 0 }
      100% { background-position: 400px 0 }
    }
    .sf-skeleton-line {
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 800px 100%;
      animation: sf-shimmer 1.4s infinite;
      border-radius: 4px;
      height: 14px;
      margin-bottom: 8px;
    }
    .sf-skeleton-circle {
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 800px 100%;
      animation: sf-shimmer 1.4s infinite;
      border-radius: 50%;
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(style);
}

function createSkeletonBlock(lineWidths) {
  const wrapper = document.createElement("div");
  wrapper.style.padding = "4px 0";
  lineWidths.forEach((width) => {
    const line = document.createElement("div");
    line.className = "sf-skeleton-line";
    line.style.width = width;
    wrapper.appendChild(line);
  });
  return wrapper;
}

function createSuppliersSkeletonLoader() {
  initSkeletonStyles();
  const wrapper = document.createElement("div");
  wrapper.style.padding = "8px 0";
  for (let i = 0; i < 5; i++) {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "10px 12px",
      marginBottom: "6px",
      border: "1px solid #e5e7eb",
      borderRadius: "8px",
    });
    const circle = document.createElement("div");
    circle.className = "sf-skeleton-circle";
    Object.assign(circle.style, { width: "36px", height: "36px" });
    const lines = document.createElement("div");
    lines.style.flex = "1";
    lines.appendChild(createSkeletonBlock(["40%", "70%", "50%"]));
    row.appendChild(circle);
    row.appendChild(lines);
    wrapper.appendChild(row);
  }
  return wrapper;
}

function createOutreachSkeletonLoader() {
  initSkeletonStyles();
  const wrapper = document.createElement("div");
  wrapper.style.padding = "8px 0";
  for (let i = 0; i < 3; i++) {
    const card = document.createElement("div");
    Object.assign(card.style, {
      padding: "12px 14px",
      marginBottom: "8px",
      border: "1px solid #e5e7eb",
      borderRadius: "8px",
    });
    card.appendChild(createSkeletonBlock(["50%", "85%", "30%"]));
    wrapper.appendChild(card);
  }
  return wrapper;
}

function createRegulationsSkeletonLoader() {
  initSkeletonStyles();
  const wrapper = document.createElement("div");
  wrapper.style.padding = "4px 0";
  wrapper.appendChild(createSkeletonBlock(["35%", "55%", "45%"]));
  return wrapper;
}

function initPanelInteractionListeners() {
  if (_panelInteractionListenersAttached) return;
  _panelInteractionListenersAttached = true;

  document.addEventListener("mousemove", (e) => {
    const toast = document.getElementById("sf-compliance-case-toast");
    if (!toast) return;

    if (_isDragging) {
      const newX = e.clientX - _dragOffsetX;
      const newY = e.clientY - _dragOffsetY;
      panelPosition.x = Math.max(0, Math.min(newX, window.innerWidth - toast.offsetWidth));
      panelPosition.y = Math.max(0, Math.min(newY, window.innerHeight - 50));
      toast.style.right = "";
      toast.style.left = panelPosition.x + "px";
      toast.style.top = panelPosition.y + "px";
    }

    if (_isResizing) {
      const deltaX = e.clientX - _resizeStartX;
      const deltaY = e.clientY - _resizeStartY;
      panelSize.width = Math.max(420, _resizeStartWidth + deltaX);
      panelSize.height = Math.max(260, _resizeStartHeight + deltaY);
      toast.style.width = panelSize.width + "px";
      toast.style.height = panelSize.height + "px";
      toast.style.maxHeight = "none";
    }
  });

  document.addEventListener("mouseup", () => {
    if (!_isDragging && !_isResizing) return;
    _isDragging = false;
    _isResizing = false;
    document.body.style.userSelect = "";
    const header = document.querySelector("#sf-compliance-case-toast-header");
    if (header) header.style.cursor = "grab";
    chrome.storage.local.set({ panelLayout: { position: panelPosition, size: panelSize } });
  });
}

function applyMinimizeState() {
  const toast = document.querySelector("#sf-compliance-case-toast");
  const tabs = document.querySelector("#sf-compliance-case-toast-tabs");
  const body = document.querySelector("#sf-compliance-case-toast-body");
  const resizeHandle = document.querySelector("#sf-compliance-resize-handle");
  const minimizeBtn = document.querySelector("#sf-compliance-minimize-btn");
  if (!tabs || !body) return;

  tabs.style.display = isCaseToastMinimized ? "none" : "";
  body.style.display = isCaseToastMinimized ? "none" : "";
  if (resizeHandle) resizeHandle.style.display = isCaseToastMinimized ? "none" : "";
  if (minimizeBtn) minimizeBtn.textContent = isCaseToastMinimized ? "□" : "−";

  if (toast) {
    if (isCaseToastMinimized) {
      toast.style.height = "auto";
      toast.style.maxHeight = "none";
    } else if (!isCaseToastExpanded) {
      toast.style.height = panelSize.height ? panelSize.height + "px" : "";
      toast.style.maxHeight = panelSize.height ? "none" : "82vh";
    }
  }
}

function toggleCaseToastMinimized() {
  isCaseToastMinimized = !isCaseToastMinimized;
  applyMinimizeState();
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
    if (panelPosition.x !== null && panelPosition.y !== null) {
      toast.style.right = "";
      toast.style.left = panelPosition.x + "px";
      toast.style.top = panelPosition.y + "px";
    } else {
      toast.style.left = "";
      toast.style.top = "16px";
      toast.style.right = "16px";
    }
    toast.style.width = panelSize.width + "px";
    toast.style.height = panelSize.height ? panelSize.height + "px" : "";
    Object.assign(toast.style, {
      minWidth: "420px",
      maxWidth: "calc(100vw - 32px)",
      maxHeight: panelSize.height ? "none" : "82vh",
      borderRadius: "12px",
    });
    const resizeHandle = toast.querySelector("#sf-compliance-resize-handle");
    if (resizeHandle) resizeHandle.style.display = "";
  }
}

function toggleCaseToastExpanded() {
  const toast = document.getElementById("sf-compliance-case-toast");
  if (!toast) return;

  if (isCaseToastMinimized) {
    isCaseToastMinimized = false;
    applyMinimizeState();
  }

  isCaseToastExpanded = !isCaseToastExpanded;
  applyCaseToastLayout(toast);

  const resizeHandle = toast.querySelector("#sf-compliance-resize-handle");
  if (resizeHandle) resizeHandle.style.display = isCaseToastExpanded ? "none" : "";

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
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    fontSize: "13px",
    border: "1px solid #d0d7de",
    borderRadius: "12px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
    minWidth: "420px",
    width: "860px",
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "82vh",
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
    cursor: "grab",
    userSelect: "none",
  });

  header.addEventListener("mousedown", (e) => {
    if (e.target.closest("button") || isCaseToastExpanded) return;
    _isDragging = true;
    const rect = toast.getBoundingClientRect();
    _dragOffsetX = e.clientX - rect.left;
    _dragOffsetY = e.clientY - rect.top;
    header.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    e.preventDefault();
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
    wasPanelOpen = false;
    toast.remove();
    if (isCaseRecordPage()) {
      showLauncher();
      updateLauncherState();
    }
  });

  const minimizeBtn = document.createElement("button");
  minimizeBtn.type = "button";
  minimizeBtn.id = "sf-compliance-minimize-btn";
  minimizeBtn.textContent = isCaseToastMinimized ? "□" : "−";
  minimizeBtn.title = "Minimize";

  Object.assign(minimizeBtn.style, {
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

  minimizeBtn.addEventListener("click", () => {
    toggleCaseToastMinimized();
  });

  headerActions.appendChild(expandBtn);
  headerActions.appendChild(minimizeBtn);
  headerActions.appendChild(closeBtn);

  const searchWrapper = document.createElement("div");
  Object.assign(searchWrapper.style, { flex: "1", margin: "0 10px" });

  const searchInput = document.createElement("input");
  searchInput.id = "sf-compliance-global-search";
  searchInput.type = "text";
  searchInput.placeholder = "Search suppliers, materials, outreach...";
  searchInput.value = currentCaseAnalysisState.globalSearchQuery || "";
  Object.assign(searchInput.style, {
    width: "100%",
    padding: "5px 10px",
    fontSize: "12px",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    outline: "none",
    background: "#f9fafb",
    color: "#111111",
    boxSizing: "border-box",
  });

  let _searchDebounceTimer = null;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => {
      currentCaseAnalysisState.globalSearchQuery = e.target.value.trim();
      rerenderCurrentCaseToast();
    }, 300);
  });

  // Prevent header drag when interacting with input
  searchInput.addEventListener("mousedown", (e) => e.stopPropagation());

  searchWrapper.appendChild(searchInput);

  header.appendChild(title);
  header.appendChild(searchWrapper);
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

  const resizeHandle = document.createElement("div");
  resizeHandle.id = "sf-compliance-resize-handle";
  Object.assign(resizeHandle.style, {
    position: "absolute",
    bottom: "0",
    right: "0",
    width: "18px",
    height: "18px",
    cursor: "nw-resize",
    zIndex: "1",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    padding: "3px",
    boxSizing: "border-box",
  });
  resizeHandle.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" style="opacity:0.35"><circle cx="8.5" cy="8.5" r="1.2" fill="#666"/><circle cx="5" cy="8.5" r="1.2" fill="#666"/><circle cx="8.5" cy="5" r="1.2" fill="#666"/></svg>`;

  resizeHandle.addEventListener("mousedown", (e) => {
    if (isCaseToastExpanded) return;
    _isResizing = true;
    _resizeStartX = e.clientX;
    _resizeStartY = e.clientY;
    const rect = toast.getBoundingClientRect();
    _resizeStartWidth = rect.width;
    _resizeStartHeight = rect.height;
    document.body.style.userSelect = "none";
    e.preventDefault();
    e.stopPropagation();
  });

  toast.appendChild(header);
  toast.appendChild(tabs);
  toast.appendChild(body);
  toast.appendChild(resizeHandle);

  hideLauncher();
  document.body.appendChild(toast);
  applyCaseToastLayout(toast);
  initPanelInteractionListeners();

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

function createCompactRegulationBadge(regulationCode, status, url = "", tooltip = "") {
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
    cursor: tooltip ? "help" : "default",
  });

  if (tooltip) {
    badge.title = tooltip;
  }

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
        primaryEvidence?.url || "",
        row.name && row.name !== row.code ? row.name : ""
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
        primaryEvidence?.url || "",
        row.name && row.name !== row.code ? row.name : ""
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
    regulations: form.selectedRegulations.map((code) => ({
      code,
      assertionType: form.regulationAssertionTypes[code] || form.defaultAssertionType,
    })),
    assertionType: form.defaultAssertionType,
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

function createTextInput(value, placeholder, onChange, focusId) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.placeholder = placeholder || "";
  if (focusId) input.setAttribute("data-focus-id", focusId);
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
      form.regulationAssertionTypes = {};
      rerenderCurrentCaseToast();
    };
    success.appendChild(addMoreBtn);

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.textContent = "Reset form";
    Object.assign(resetBtn.style, {
      marginTop: "10px",
      marginLeft: "8px",
      padding: "8px 14px",
      border: "1px solid #d0d7de",
      borderRadius: "8px",
      background: "#ffffff",
      color: "#374151",
      cursor: "pointer",
      fontWeight: "600",
    });
    resetBtn.onclick = () => {
      form.submitResult = null;
      form.submitError = null;
      form.supplierCode = "";
      form.supplierName = "";
      form.supplierAliases = "";
      form.isNewSupplier = false;
      form.selectedSupplierId = null;
      form.supplierSearchQuery = "";
      form.supplierSearchResults = [];
      form.docTitle = "";
      form.docFileName = "";
      form.docUrl = "";
      form.docStatementText = "";
      form.docIssueDate = "";
      form.docValidUntil = "";
      form.docType = "certificate";
      form.coverageType = "supplier_all";
      form.dwkItemNumbers = "";
      form.supplierPartNumbers = "";
      form.defaultAssertionType = "compliant";
      form.selectedRegulations = [];
      form.regulationAssertionTypes = {};
      rerenderCurrentCaseToast();
    };
    success.appendChild(resetBtn);

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
 clearTimeout(form._supplierSearchDebounce);
      form._supplierSearchDebounce = setTimeout(
        () => searchSuppliersForForm(v),
        300
      );
    },
    "supplier-search-input"
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
    const _selSpan = document.createElement("span");
    const _selStrong = document.createElement("strong");
    _selStrong.textContent = form.supplierName;
    _selSpan.appendChild(_selStrong);
    _selSpan.appendChild(document.createTextNode(` (${form.supplierCode})`));
    selected.appendChild(_selSpan);

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

  const assertionTypeOptions = [
    { value: "compliant", label: "Compliant" },
    { value: "free_from", label: "Free From" },
    { value: "contains", label: "Contains" },
    { value: "non_compliant", label: "Non-Compliant" },
    { value: "partial", label: "Partial" },
    { value: "informational", label: "Informational" },
];
 
  // Default assertion type + bulk Apply-to-all control
  const defaultRow = document.createElement("div");
  Object.assign(defaultRow.style, {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
    marginBottom: "10px",
  });
 
  const defaultField = createFormField(
    "Default Assertion Type (applied to newly selected regulations)",
    createSelectInput(form.defaultAssertionType, assertionTypeOptions, (v) => {
      form.defaultAssertionType = v;
    })
  );
  defaultField.style.flex = "1";
  defaultField.style.marginBottom = "0";
  defaultRow.appendChild(defaultField);
 
  const applyAllBtn = document.createElement("button");
  applyAllBtn.type = "button";
  applyAllBtn.textContent = "Apply to all selected";
  applyAllBtn.disabled = form.selectedRegulations.length === 0;
  Object.assign(applyAllBtn.style, {
    padding: "8px 12px",
    border: "1px solid #0176d3",
    borderRadius: "8px",
    background: applyAllBtn.disabled ? "#cbd5e1" : "#0176d3",
    color: "#fff",
    cursor: applyAllBtn.disabled ? "default" : "pointer",
    fontSize: "12px",
    fontWeight: "600",
    whiteSpace: "nowrap",
    height: "34px",
  });
  applyAllBtn.onclick = () => {
    form.selectedRegulations.forEach((code) => {
      form.regulationAssertionTypes[code] = form.defaultAssertionType;
    });
    rerenderCurrentCaseToast();
  };
  defaultRow.appendChild(applyAllBtn);
 
  assertSection.appendChild(defaultRow);

  // Regulations checkboxes
  const regLabel = document.createElement("div");
  regLabel.textContent = "Regulations *";
  Object.assign(regLabel.style, { fontWeight: "600", fontSize: "13px", marginBottom: "6px", color: "#374151" });
  assertSection.appendChild(regLabel);

  if (form.availableRegulations.length === 0) {
    loadRegulationsIfNeeded();
    assertSection.appendChild(createRegulationsSkeletonLoader());
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
          form.regulationAssertionTypes[reg.code] = form.defaultAssertionType;
        } else {
          form.selectedRegulations = form.selectedRegulations.filter((c) => c !== reg.code);
           delete form.regulationAssertionTypes[reg.code];
        }
        rerenderCurrentCaseToast();
      };

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(reg.code));
      regGrid.appendChild(label);
    });

    assertSection.appendChild(regGrid);

     // Per-regulation assertion types for selected regulations
    if (form.selectedRegulations.length > 0) {
      const perRegSection = document.createElement("div");
      Object.assign(perRegSection.style, {
        marginTop: "12px",
        padding: "10px",
        border: "1px solid #d0d7de",
        borderRadius: "8px",
        background: "#ffffff",
      });
 
      const perRegHeader = document.createElement("div");
      Object.assign(perRegHeader.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px",
      });
 
      const perRegTitle = document.createElement("div");
      perRegTitle.textContent = `Assertion type per selected regulation (${form.selectedRegulations.length})`;
      Object.assign(perRegTitle.style, {
        fontWeight: "600",
        fontSize: "12px",
        color: "#374151",
      });
      perRegHeader.appendChild(perRegTitle);
 
      const hint = document.createElement("div");
      hint.textContent = "Set a type for each regulation";
      Object.assign(hint.style, {
        fontSize: "11px",
        color: "#6b7280",
      });
      perRegHeader.appendChild(hint);
 
      perRegSection.appendChild(perRegHeader);
 
      const perRegGrid = document.createElement("div");
      Object.assign(perRegGrid.style, {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "6px",
      });
 
      form.selectedRegulations.forEach((code) => {
        const row = document.createElement("div");
        Object.assign(row.style, {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 6px",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          background: "#f9fafb",
        });
 
        const codeSpan = document.createElement("span");
        codeSpan.textContent = code;
        Object.assign(codeSpan.style, {
          fontSize: "12px",
          fontWeight: "600",
          minWidth: "70px",
          color: "#111827",
        });
        row.appendChild(codeSpan);
 
        const currentType = form.regulationAssertionTypes[code] || form.defaultAssertionType;
        const perSelect = createSelectInput(currentType, assertionTypeOptions, (v) => {
          form.regulationAssertionTypes[code] = v;
          rerenderCurrentCaseToast();
        });
        Object.assign(perSelect.style, {
          flex: "1",
          padding: "4px 6px",
          fontSize: "12px",
        });
        row.appendChild(perSelect);
 
        perRegGrid.appendChild(row);
      });
 
      perRegSection.appendChild(perRegGrid);
      assertSection.appendChild(perRegSection);
    }

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
      const strong = document.createElement("strong");
      strong.textContent = `${label}:`;
      row.appendChild(strong);
      row.appendChild(document.createTextNode(` ${value || "—"}`));
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


// ─── Fuzzy search helpers ────────────────────────────────────────────────────

function _charSequenceMatch(text, query) {
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) qi++;
  }
  return qi === query.length;
}

function fuzzyScoreSupplier(supplier, query) {
  if (!query) return { score: 100, matchField: null, matchValue: null };
  const q = query.toLowerCase().trim();
  if (!q) return { score: 100, matchField: null, matchValue: null };

  const targets = [
    { field: "name",       value: String(supplier.supplierName || "").toLowerCase(),  weight: 1.0,  display: supplier.supplierName },
    { field: "code",       value: String(supplier.supplierCode || "").toLowerCase(),  weight: 0.95, display: supplier.supplierCode },
    ...(Array.isArray(supplier.aliases) ? supplier.aliases.map(a => ({
      field: "alias", value: String(a || "").toLowerCase(), weight: 0.85, display: a,
    })) : []),
    ...(Array.isArray(supplier.regulationSummary) ? supplier.regulationSummary.map(r => ({
      field: "regulation",
      value: `${(r.regulationCode || "").toLowerCase()} ${(r.regulationName || "").toLowerCase()}`.trim(),
      weight: 0.75,
      display: r.regulationCode ? `${r.regulationCode}${r.regulationName ? " — " + r.regulationName : ""}` : r.regulationName,
    })) : []),
    ...(Array.isArray(supplier.assertions) ? supplier.assertions.slice(0, 10).map(a => ({
      field: "document",
      value: String(a?.document?.title || "").toLowerCase(),
      weight: 0.6,
      display: a?.document?.title,
    })) : []),
    ...(Array.isArray(supplier.contacts) ? supplier.contacts.map(c => ({
      field: "contact",
      value: `${(c.name || "").toLowerCase()} ${(c.email || "").toLowerCase()}`.trim(),
      weight: 0.55,
      display: c.name || c.email,
    })) : []),
  ];

  let bestScore = 0, bestField = null, bestDisplay = null;

  for (const { field, value, weight, display } of targets) {
    if (!value) continue;
    let raw = 0;
    if (value === q) raw = 100;
    else if (value.startsWith(q)) raw = 90;
    else if (value.includes(q)) raw = 75;
    else {
      const words = value.split(/[\s\-_/]+/);
      if (words.some(w => w.startsWith(q))) raw = 65;
      else if (q.length >= 3 && _charSequenceMatch(value, q)) raw = 40;
    }
    const weighted = raw * weight;
    if (weighted > bestScore) {
      bestScore = weighted;
      bestField = field;
      bestDisplay = display;
    }
  }

  return { score: bestScore, matchField: bestField, matchValue: bestDisplay };
}

function _highlightText(text, query) {
  const wrapper = document.createElement("span");
  if (!query || !text) { wrapper.textContent = text || ""; return wrapper; }
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) { wrapper.textContent = text; return wrapper; }
  if (idx > 0) wrapper.appendChild(document.createTextNode(text.slice(0, idx)));
  const mark = document.createElement("mark");
  mark.textContent = text.slice(idx, idx + q.length);
  Object.assign(mark.style, { background: "#fef3c7", color: "#111", borderRadius: "2px", padding: "0 1px" });
  wrapper.appendChild(mark);
  if (idx + q.length < text.length) wrapper.appendChild(document.createTextNode(text.slice(idx + q.length)));
  return wrapper;
}

// ─────────────────────────────────────────────────────────────────────────────

function getFilteredLibrarySuppliers(suppliers) {
  const regFilter = currentCaseAnalysisState.suppliersLibraryRegFilter || "";
  const statusFilter = currentCaseAnalysisState.suppliersLibraryStatusFilter || "all";
  const query = (currentCaseAnalysisState.suppliersLibrarySearch || "").trim();

  let result = suppliers.filter((s) => {
    const regs = Array.isArray(s.regulationSummary) ? s.regulationSummary : [];
    if (regFilter) {
      const hasReg = regs.some(
        (r) =>
          (r.regulationCode || "").toLowerCase().includes(regFilter.toLowerCase()) ||
          (r.regulationName || "").toLowerCase().includes(regFilter.toLowerCase())
      );
      if (!hasReg) return false;
    }
    if (statusFilter !== "all") {
      const hasStatus = regs.some((r) => r.status === statusFilter);
      if (!hasStatus) return false;
    }
    if (query) {
      const { score } = fuzzyScoreSupplier(s, query);
      if (score < 28) return false;
    }
    return true;
  });

  if (query) {
    result = result
      .map(s => ({ s, score: fuzzyScoreSupplier(s, query).score }))
      .sort((a, b) => b.score - a.score)
      .map(({ s }) => s);
  }

  return result;
}

function createSuppliersLibraryFilterBar(allSuppliers) {
  const regCodes = new Set();
  allSuppliers.forEach((s) => {
    (Array.isArray(s.regulationSummary) ? s.regulationSummary : []).forEach((r) => {
      if (r.regulationCode) regCodes.add(r.regulationCode);
    });
  });

  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    marginBottom: "10px",
    display: "flex",
    gap: "8px",
    alignItems: "center",
  });

  const selectStyle = {
    padding: "6px 10px",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    fontSize: "13px",
    color: "#374151",
    background: "#ffffff",
    cursor: "pointer",
    outline: "none",
  };

  // Status dropdown
  const statusSelect = document.createElement("select");
  Object.assign(statusSelect.style, { ...selectStyle, minWidth: "130px" });
  [
    { value: "all", label: "All statuses" },
    { value: "covered", label: "✓ Covered" },
    { value: "partial", label: "~ Partial" },
    { value: "missing", label: "✗ Missing" },
    { value: "expired", label: "⚠ Expired" },
  ].forEach(({ value, label }) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value === (currentCaseAnalysisState.suppliersLibraryStatusFilter || "all")) {
      opt.selected = true;
    }
    statusSelect.appendChild(opt);
  });
  statusSelect.addEventListener("change", () => {
    currentCaseAnalysisState.suppliersLibraryStatusFilter = statusSelect.value;
    rerenderCurrentCaseToast();
  });

  // Regulation dropdown
  const regSelect = document.createElement("select");
  Object.assign(regSelect.style, { ...selectStyle, minWidth: "160px" });
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All regulations";
  if (!currentCaseAnalysisState.suppliersLibraryRegFilter) allOpt.selected = true;
  regSelect.appendChild(allOpt);
  [...regCodes].sort().forEach((code) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = code;
    if (code === currentCaseAnalysisState.suppliersLibraryRegFilter) opt.selected = true;
    regSelect.appendChild(opt);
  });
  regSelect.addEventListener("change", () => {
    currentCaseAnalysisState.suppliersLibraryRegFilter = regSelect.value;
    rerenderCurrentCaseToast();
  });

  wrapper.appendChild(statusSelect);
  if (regCodes.size > 0) wrapper.appendChild(regSelect);

  // Active filter indicator + clear
  const hasFilter =
    !!currentCaseAnalysisState.suppliersLibraryRegFilter ||
    (currentCaseAnalysisState.suppliersLibraryStatusFilter || "all") !== "all";
  if (hasFilter) {
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "✕ Clear";
    Object.assign(clearBtn.style, {
      padding: "6px 10px",
      border: "none",
      borderRadius: "8px",
      background: "transparent",
      color: "#6b7280",
      fontSize: "12px",
      cursor: "pointer",
    });
    clearBtn.addEventListener("click", () => {
      currentCaseAnalysisState.suppliersLibraryRegFilter = "";
      currentCaseAnalysisState.suppliersLibraryStatusFilter = "all";
      rerenderCurrentCaseToast();
    });
    wrapper.appendChild(clearBtn);
  }

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
  input.id = "sf-compliance-lib-search";
  input.value = currentCaseAnalysisState.suppliersLibrarySearch || "";
  input.placeholder = "Search by name, code, alias, regulation, document…";

  Object.assign(input.style, {
    flex: "1",
    padding: "10px 12px",
    border: "1px solid #d0d7de",
    borderRadius: "10px",
    fontSize: "14px",
  });

  input.addEventListener("input", (event) => {
    const val = event.target.value || "";
    const cursorPos = event.target.selectionStart;
    currentCaseAnalysisState.suppliersLibrarySearch = val;
    rerenderCurrentCaseToast();
    // Restore focus and cursor position after DOM rebuild
    const rebuilt = document.getElementById("sf-compliance-lib-search");
    if (rebuilt) {
      rebuilt.focus();
      rebuilt.setSelectionRange(cursorPos, cursorPos);
    }
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

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.textContent = "↺";
  refreshButton.title = "Force refresh (bypass 15-min cache)";
  Object.assign(refreshButton.style, {
    padding: "10px 12px",
    border: "1px solid #d0d7de",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#374151",
    cursor: currentCaseAnalysisState.suppliersLibraryLoading ? "default" : "pointer",
    fontWeight: "600",
    fontSize: "16px",
    lineHeight: "1",
    opacity: currentCaseAnalysisState.suppliersLibraryLoading ? "0.5" : "1",
    flexShrink: "0",
  });
  refreshButton.disabled = currentCaseAnalysisState.suppliersLibraryLoading;
  refreshButton.addEventListener("click", () => {
    loadSuppliersLibrary(currentCaseAnalysisState.suppliersLibrarySearch || "", true);
  });

  wrapper.appendChild(input);
  wrapper.appendChild(button);
  wrapper.appendChild(refreshButton);

  return wrapper;
}

function createSupplierLibraryListItem(supplier) {
  const isActive =
    String(currentCaseAnalysisState.selectedSupplierLibraryId || "") ===
    String(supplier?.supplierId || "");

  const query = (currentCaseAnalysisState.suppliersLibrarySearch || "").trim();
  const matchInfo = query ? fuzzyScoreSupplier(supplier, query) : null;

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
    currentCaseAnalysisState.suppliersLibraryDocSearch = "";
    currentCaseAnalysisState.supplierContactForm = null;
    currentCaseAnalysisState.supplierContactDeleting = null;
    rerenderCurrentCaseToast();
  });

  const name = document.createElement("div");
  Object.assign(name.style, { fontWeight: "700", fontSize: "14px", color: "#111827", marginBottom: "4px" });
  if (query && matchInfo?.matchField === "name") {
    name.appendChild(_highlightText(supplier?.supplierName || "Unknown supplier", query));
  } else {
    name.textContent = supplier?.supplierName || "Unknown supplier";
  }

  const code = document.createElement("div");
  Object.assign(code.style, { fontSize: "12px", color: "#6b7280", marginBottom: "4px" });
  if (query && matchInfo?.matchField === "code") {
    code.appendChild(_highlightText(supplier?.supplierCode || "—", query));
  } else {
    code.textContent = supplier?.supplierCode || "—";
  }

  const meta = document.createElement("div");
  meta.textContent = `Documents: ${supplier?.documentsCount || 0} • Statements: ${supplier?.assertionsCount || 0}`;
  Object.assign(meta.style, { fontSize: "12px", color: "#374151" });

  item.appendChild(name);
  item.appendChild(code);
  item.appendChild(meta);

  // Show match hint for non-obvious fields (alias, regulation, document, contact)
  if (matchInfo?.matchField && !["name", "code"].includes(matchInfo.matchField) && matchInfo.matchValue) {
    const FIELD_LABEL = { alias: "Alias", regulation: "Regulation", document: "Document", contact: "Contact" };
    const hint = document.createElement("div");
    Object.assign(hint.style, {
      marginTop: "5px",
      fontSize: "11px",
      color: "#0176d3",
      background: "#eff6ff",
      borderRadius: "5px",
      padding: "2px 6px",
      display: "inline-block",
    });
    const label = document.createTextNode(`${FIELD_LABEL[matchInfo.matchField] || matchInfo.matchField}: `);
    hint.appendChild(label);
    hint.appendChild(_highlightText(String(matchInfo.matchValue).slice(0, 60), query));
    item.appendChild(hint);
  }

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

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "10px",
  });

  const title = document.createElement("div");
  title.textContent = "Statements";
  Object.assign(title.style, {
    fontSize: "18px",
    fontWeight: "700",
    color: "#111827",
  });
  header.appendChild(title);

  const docSearchInput = document.createElement("input");
  docSearchInput.type = "text";
  docSearchInput.placeholder = "Search by regulation, document…";
  docSearchInput.value = currentCaseAnalysisState.suppliersLibraryDocSearch || "";
  Object.assign(docSearchInput.style, {
    padding: "6px 10px",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    fontSize: "13px",
    width: "200px",
    outline: "none",
  });
  docSearchInput.addEventListener("input", (e) => {
    currentCaseAnalysisState.suppliersLibraryDocSearch = e.target.value || "";
    rerenderCurrentCaseToast();
  });
  header.appendChild(docSearchInput);

  wrapper.appendChild(header);

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

  const docSearch = (currentCaseAnalysisState.suppliersLibraryDocSearch || "").toLowerCase().trim();
  const filteredAssertions = docSearch
    ? assertions.filter((s) => {
        const regName = (s?.regulation?.name || s?.regulation?.code || "").toLowerCase();
        const docTitle = (s?.document?.title || s?.document?.fileName || "").toLowerCase();
        const status = (s?.status || "").toLowerCase();
        const assertionType = (s?.assertionType || "").toLowerCase();
        return (
          regName.includes(docSearch) ||
          docTitle.includes(docSearch) ||
          status.includes(docSearch) ||
          assertionType.includes(docSearch)
        );
      })
    : assertions;

  if (!filteredAssertions.length) {
    const empty = document.createElement("div");
    empty.textContent = `No statements match "${currentCaseAnalysisState.suppliersLibraryDocSearch}".`;
    Object.assign(empty.style, {
      color: "#6b7280",
      fontSize: "14px",
      fontStyle: "italic",
    });
    wrapper.appendChild(empty);
    return wrapper;
  }

  if (docSearch && filteredAssertions.length < assertions.length) {
    const matchNote = document.createElement("div");
    matchNote.textContent = `Showing ${filteredAssertions.length} of ${assertions.length} statements`;
    Object.assign(matchNote.style, {
      fontSize: "12px",
      color: "#0176d3",
      fontWeight: "600",
      marginBottom: "8px",
    });
    wrapper.appendChild(matchNote);
  }

  filteredAssertions.forEach((statement) => {
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
      const strong = document.createElement("strong");
      strong.textContent = `${label}:`;
      row.appendChild(strong);
      row.appendChild(document.createTextNode(` ${value || "—"}`));
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

function createSupplierContactsSection(supplier) {
  const contacts = Array.isArray(supplier?.contacts) ? supplier.contacts : [];
  const supplierId = supplier?.supplierId || "";
  const form = currentCaseAnalysisState.supplierContactForm;
  const deleting = currentCaseAnalysisState.supplierContactDeleting;

  const section = document.createElement("div");
  section.style.marginTop = "20px";

  // Header
  const header = document.createElement("div");
  Object.assign(header.style, { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" });

  const title = document.createElement("div");
  title.textContent = "Contacts";
  Object.assign(title.style, { fontSize: "18px", fontWeight: "700", color: "#111827", flex: "1" });
  header.appendChild(title);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = form?.mode === "add" ? "✕ Cancel" : "+ Add contact";
  Object.assign(addBtn.style, {
    padding: "5px 12px", border: "1px solid #0176d3", borderRadius: "8px",
    background: form?.mode === "add" ? "#f9fafb" : "#eff6ff", color: "#0176d3",
    fontSize: "12px", fontWeight: "600", cursor: "pointer",
  });
  addBtn.onclick = () => {
    currentCaseAnalysisState.supplierContactForm = form?.mode === "add" ? null
      : { mode: "add", name: "", email: "", phone: "", role: "", notes: "", saving: false, error: null };
    rerenderCurrentCaseToast();
  };
  header.appendChild(addBtn);
  section.appendChild(header);

  // Inline add/edit form
  if (form) {
    const formEl = document.createElement("div");
    Object.assign(formEl.style, {
      border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 14px",
      marginBottom: "12px", background: "#f9fafb",
    });

    const inputStyle = { width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box", marginBottom: "8px" };
    const labelStyle = { display: "block", fontSize: "11px", fontWeight: "700", color: "#374151", marginBottom: "3px" };

    const makeField = (label, key, placeholder = "", type = "text") => {
      const wrap = document.createElement("div");
      const lb = document.createElement("label");
      lb.textContent = label;
      Object.assign(lb.style, labelStyle);
      const inp = document.createElement("input");
      inp.type = type;
      inp.value = form[key] || "";
      inp.placeholder = placeholder;
      Object.assign(inp.style, inputStyle);
      inp.oninput = (e) => { currentCaseAnalysisState.supplierContactForm[key] = e.target.value; };
      wrap.appendChild(lb);
      wrap.appendChild(inp);
      return wrap;
    };

    formEl.appendChild(makeField("Name *", "name", "Jane Smith"));
    formEl.appendChild(makeField("Email", "email", "jane@supplier.com", "email"));
    formEl.appendChild(makeField("Phone", "phone", "+1 555 000 0000", "tel"));
    formEl.appendChild(makeField("Role / Title", "role", "Compliance Manager"));
    formEl.appendChild(makeField("Notes", "notes", "Preferred contact for REACH requests"));

    if (form.error) {
      const errEl = document.createElement("div");
      errEl.textContent = form.error;
      Object.assign(errEl.style, { fontSize: "12px", color: "#dc2626", marginBottom: "8px" });
      formEl.appendChild(errEl);
    }

    const btnRow = document.createElement("div");
    Object.assign(btnRow.style, { display: "flex", gap: "8px" });

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = form.saving ? "Saving…" : (form.mode === "add" ? "Save contact" : "Update");
    saveBtn.disabled = form.saving;
    Object.assign(saveBtn.style, {
      flex: "1", padding: "7px 12px", border: "none", borderRadius: "8px",
      background: "#0176d3", color: "#fff", fontSize: "13px", fontWeight: "600",
      cursor: form.saving ? "default" : "pointer", opacity: form.saving ? "0.7" : "1",
    });
    saveBtn.onclick = async () => {
      if (!currentCaseAnalysisState.supplierContactForm.name?.trim()) {
        currentCaseAnalysisState.supplierContactForm.error = "Name is required";
        rerenderCurrentCaseToast();
        return;
      }
      currentCaseAnalysisState.supplierContactForm.saving = true;
      currentCaseAnalysisState.supplierContactForm.error = null;
      rerenderCurrentCaseToast();

      const f = currentCaseAnalysisState.supplierContactForm;
      const payload = { supplierId, name: f.name.trim(), email: f.email || "", phone: f.phone || "", role: f.role || "", notes: f.notes || "" };

      let resp;
      if (f.mode === "add") {
        resp = await sendMessageAsync({ type: "EXT_ADD_SUPPLIER_CONTACT", payload });
      } else {
        resp = await sendMessageAsync({ type: "EXT_UPDATE_SUPPLIER_CONTACT", payload: { ...payload, contactId: f.contactId } });
      }

      if (!resp?.ok) {
        currentCaseAnalysisState.supplierContactForm.saving = false;
        currentCaseAnalysisState.supplierContactForm.error = resp?.error || resp?.json?.error || "Failed to save contact";
        rerenderCurrentCaseToast();
        return;
      }

      const savedContact = resp.json?.contact;
      if (!savedContact) {
        currentCaseAnalysisState.supplierContactForm.saving = false;
        currentCaseAnalysisState.supplierContactForm.error = "Server returned no contact data";
        rerenderCurrentCaseToast();
        return;
      }

      // Update local contacts list in the loaded library
      const lib = currentCaseAnalysisState.suppliersLibrary;
      if (lib?.suppliers) {
        const s = lib.suppliers.find((x) => x.supplierId === supplierId);
        if (s) {
          if (f.mode === "add") {
            s.contacts = [...(s.contacts || []), savedContact];
          } else {
            s.contacts = (s.contacts || []).map((c) => c.contactId === f.contactId ? savedContact : c);
          }
        }
      }

      currentCaseAnalysisState.supplierContactForm = null;
      rerenderCurrentCaseToast();
    };

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    Object.assign(cancelBtn.style, {
      padding: "7px 12px", border: "1px solid #e5e7eb", borderRadius: "8px",
      background: "#fff", color: "#374151", fontSize: "13px", cursor: "pointer",
    });
    cancelBtn.onclick = () => { currentCaseAnalysisState.supplierContactForm = null; rerenderCurrentCaseToast(); };

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    formEl.appendChild(btnRow);
    section.appendChild(formEl);
  }

  // Contacts list
  if (!contacts.length && !form) {
    const empty = document.createElement("div");
    empty.textContent = "No contacts yet. Add one to speed up outreach.";
    Object.assign(empty.style, { fontSize: "13px", color: "#9ca3af", fontStyle: "italic" });
    section.appendChild(empty);
    return section;
  }

  contacts.forEach((contact) => {
    const isEditing = form?.mode === "edit" && form?.contactId === contact.contactId;
    if (isEditing) return; // form is shown at top

    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "10px",
      padding: "10px 12px", marginBottom: "8px",
    });

    const row1 = document.createElement("div");
    Object.assign(row1.style, { display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "4px" });

    const nameEl = document.createElement("div");
    nameEl.textContent = contact.name;
    Object.assign(nameEl.style, { fontWeight: "700", fontSize: "14px", color: "#111827", flex: "1" });
    row1.appendChild(nameEl);

    if (contact.role) {
      const roleEl = document.createElement("div");
      roleEl.textContent = contact.role;
      Object.assign(roleEl.style, { fontSize: "12px", color: "#6b7280", background: "#f3f4f6", padding: "2px 8px", borderRadius: "6px" });
      row1.appendChild(roleEl);
    }
    card.appendChild(row1);

    const row2 = document.createElement("div");
    Object.assign(row2.style, { display: "flex", gap: "14px", fontSize: "13px", color: "#374151", flexWrap: "wrap", marginBottom: "8px" });
    if (contact.email) {
      const emailLink = document.createElement("a");
      emailLink.href = `mailto:${contact.email}`;
      emailLink.textContent = `✉ ${contact.email}`;
      Object.assign(emailLink.style, { color: "#0176d3", textDecoration: "none" });
      row2.appendChild(emailLink);
    }
    if (contact.phone) {
      const phoneEl = document.createElement("span");
      phoneEl.textContent = `📞 ${contact.phone}`;
      row2.appendChild(phoneEl);
    }
    if (row2.childNodes.length) card.appendChild(row2);

    if (contact.notes) {
      const notesEl = document.createElement("div");
      notesEl.textContent = contact.notes;
      Object.assign(notesEl.style, { fontSize: "12px", color: "#6b7280", fontStyle: "italic", marginBottom: "8px" });
      card.appendChild(notesEl);
    }

    // Action row
    const actions = document.createElement("div");
    Object.assign(actions.style, { display: "flex", gap: "6px" });

    // Use in outreach
    if (contact.email) {
      const useBtn = document.createElement("button");
      useBtn.type = "button";
      useBtn.textContent = "Use in Outreach";
      Object.assign(useBtn.style, {
        padding: "3px 10px", border: "1px solid #0176d3", borderRadius: "6px",
        background: "#eff6ff", color: "#0176d3", fontSize: "11px", fontWeight: "600", cursor: "pointer",
      });
      useBtn.onclick = () => {
        // Pre-fill outreach form and switch to outreach tab
        currentCaseAnalysisState.outreachShowForm = true;
        const caseId = currentCaseAnalysisState.payload?.caseId || "";
        currentCaseAnalysisState.outreachForm = {
          supplierId: supplier.supplierId || "",
          supplierName: supplier.supplierName || "",
          supplierSearchQuery: supplier.supplierName || "",
          supplierSearchResults: [],
          contactEmail: contact.email,
          subject: "",
          method: "email",
          sentAt: new Date().toISOString().slice(0, 10),
          followUpDays: "7",
          notes: "",
          regulationTags: [],
          caseId,
          submitting: false,
          submitError: null,
        };
        activeCaseToastTab = "suppliers";
        suppliersSubTab = "outreach";
        rerenderCurrentCaseToast();
      };
      actions.appendChild(useBtn);
    }

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    Object.assign(editBtn.style, {
      padding: "3px 10px", border: "1px solid #d1d5db", borderRadius: "6px",
      background: "#fff", color: "#374151", fontSize: "11px", cursor: "pointer",
    });
    editBtn.onclick = () => {
      currentCaseAnalysisState.supplierContactForm = {
        mode: "edit", contactId: contact.contactId,
        name: contact.name, email: contact.email, phone: contact.phone,
        role: contact.role, notes: contact.notes,
        saving: false, error: null,
      };
      rerenderCurrentCaseToast();
    };
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = deleting === contact.contactId ? "Deleting…" : "✕";
    deleteBtn.disabled = deleting === contact.contactId;
    Object.assign(deleteBtn.style, {
      padding: "3px 8px", border: "1px solid #fca5a5", borderRadius: "6px",
      background: "#fff", color: "#dc2626", fontSize: "11px", cursor: "pointer",
    });
    deleteBtn.onclick = async () => {
      if (!confirm(`Delete contact ${contact.name}?`)) return;
      currentCaseAnalysisState.supplierContactDeleting = contact.contactId;
      rerenderCurrentCaseToast();

      const resp = await sendMessageAsync({ type: "EXT_DELETE_SUPPLIER_CONTACT", payload: { supplierId, contactId: contact.contactId } });

      currentCaseAnalysisState.supplierContactDeleting = null;
      if (resp?.ok) {
        const lib = currentCaseAnalysisState.suppliersLibrary;
        if (lib?.suppliers) {
          const s = lib.suppliers.find((x) => x.supplierId === supplierId);
          if (s) s.contacts = (s.contacts || []).filter((c) => c.contactId !== contact.contactId);
        }
      }
      rerenderCurrentCaseToast();
    };
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    section.appendChild(card);
  });

  return section;
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
    const _aliasStrong = document.createElement("strong");
    _aliasStrong.textContent = "Aliases:";
    aliases.appendChild(_aliasStrong);
    aliases.appendChild(document.createTextNode(` ${supplier.aliases.join(", ")}`));
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
  wrapper.appendChild(createSupplierContactsSection(supplier));
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

// ─────────────────────────────────────────────────────────────────────────────
// Outreach Tracker UI
// ─────────────────────────────────────────────────────────────────────────────

function getEffectiveOutreachStatus(record) {
  if (record.status === "responded" || record.status === "closed") return record.status;
  if (record.nextFollowUpAt && new Date(record.nextFollowUpAt) < new Date()) return "overdue";
  if (record.nextFollowUpAt) return "awaiting";
  return record.status || "sent";
}

function formatOutreachDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDaysAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

function createOutreachStatusBadge(status) {
  const badge = document.createElement("span");
  const config = {
    sent:      { label: "Sent",      bg: "#f3f4f6", color: "#374151" },
    awaiting:  { label: "Awaiting",  bg: "#fef3c7", color: "#92400e" },
    overdue:   { label: "Overdue",   bg: "#fee2e2", color: "#991b1b" },
    responded: { label: "Responded", bg: "#d1fae5", color: "#065f46" },
    closed:    { label: "Closed",    bg: "#f3f4f6", color: "#6b7280" },
  };
  const c = config[status] || config.sent;
  badge.textContent = c.label;
  Object.assign(badge.style, {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "9999px",
    fontSize: "11px",
    fontWeight: "700",
    background: c.bg,
    color: c.color,
    whiteSpace: "nowrap",
  });
  return badge;
}

function createOutreachStatsBar(records) {
  if (!records.length) return null;

  const responded = records.filter(
    (r) => r.status === "responded" || r.status === "closed"
  );
  const responseRate = Math.round((responded.length / records.length) * 100);

  const replyTimes = responded
    .filter((r) => r.sentAt && r.respondedAt)
    .map((r) => (new Date(r.respondedAt) - new Date(r.sentAt)) / 86400000);
  const avgReply =
    replyTimes.length > 0
      ? Math.round(replyTimes.reduce((a, b) => a + b, 0) / replyTimes.length)
      : null;

  const overdue = records.filter((r) => getEffectiveOutreachStatus(r) === "overdue").length;

  const bar = document.createElement("div");
  Object.assign(bar.style, {
    display: "flex",
    gap: "16px",
    padding: "10px 14px",
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    marginBottom: "12px",
    flexWrap: "wrap",
    alignItems: "center",
  });

  const addStat = (label, value, color) => {
    const item = document.createElement("div");
    Object.assign(item.style, { display: "flex", flexDirection: "column", alignItems: "center", minWidth: "64px" });

    const valEl = document.createElement("div");
    valEl.textContent = value;
    Object.assign(valEl.style, { fontSize: "18px", fontWeight: "800", color: color || "#111827", lineHeight: "1.1" });

    const lbEl = document.createElement("div");
    lbEl.textContent = label;
    Object.assign(lbEl.style, { fontSize: "11px", color: "#6b7280", marginTop: "2px", whiteSpace: "nowrap" });

    item.appendChild(valEl);
    item.appendChild(lbEl);
    bar.appendChild(item);
  };

  const divider = () => {
    const d = document.createElement("div");
    Object.assign(d.style, { width: "1px", height: "32px", background: "#e5e7eb", flexShrink: "0" });
    bar.appendChild(d);
  };

  addStat("Total", records.length);
  divider();
  addStat("Response rate", `${responseRate}%`, responseRate >= 70 ? "#16a34a" : responseRate >= 40 ? "#d97706" : "#dc2626");
  divider();
  addStat("Responded", responded.length, "#16a34a");
  if (avgReply !== null) {
    divider();
    addStat("Avg. reply", `${avgReply}d`, avgReply <= 5 ? "#16a34a" : avgReply <= 14 ? "#d97706" : "#dc2626");
  }
  if (overdue > 0) {
    divider();
    addStat("Overdue", overdue, "#dc2626");
  }

  return bar;
}

function createOutreachTabContent(records) {
  const wrapper = document.createElement("div");

  // ── Stats bar ───────────────────────────────────────────────────────────────
  const statsBar = createOutreachStatsBar(records);
  if (statsBar) wrapper.appendChild(statsBar);

  // ── Filter bar ──────────────────────────────────────────────────────────────
  const filterBar = document.createElement("div");
  Object.assign(filterBar.style, {
    display: "flex",
    gap: "6px",
    marginBottom: "12px",
    flexWrap: "wrap",
    alignItems: "center",
  });

  const currentFilter = currentCaseAnalysisState.outreachFilter;

  const filterDefs = [
    { key: "all",       label: "All" },
    { key: "awaiting",  label: "Awaiting" },
    { key: "overdue",   label: "Overdue" },
    { key: "responded", label: "Responded" },
  ];

  filterDefs.forEach(({ key, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    const isActive = currentFilter === key;
    Object.assign(btn.style, {
      border: isActive ? "2px solid #0176d3" : "2px solid #e5e7eb",
      borderRadius: "9999px",
      background: isActive ? "#eff6ff" : "#fff",
      color: isActive ? "#0176d3" : "#374151",
      padding: "4px 12px",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer",
    });
    btn.onclick = () => {
      currentCaseAnalysisState.outreachFilter = key;
      rerenderCurrentCaseToast();
    };
    filterBar.appendChild(btn);
  });

  // Refresh button
  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.textContent = "↻";
  Object.assign(refreshBtn.style, {
    marginLeft: "auto",
    border: "1px solid #e5e7eb",
    borderRadius: "6px",
    background: "#fff",
    color: "#6b7280",
    padding: "4px 10px",
    fontSize: "14px",
    cursor: "pointer",
    title: "Refresh",
  });
  refreshBtn.title = "Refresh list";
  refreshBtn.onclick = () => {
    currentCaseAnalysisState.outreachList = null;
    loadOutreachList();
  };
  filterBar.appendChild(refreshBtn);

  wrapper.appendChild(filterBar);

  // ── Log Outreach button ─────────────────────────────────────────────────────
  const logBtn = document.createElement("button");
  logBtn.type = "button";
  logBtn.textContent = currentCaseAnalysisState.outreachShowForm ? "✕ Cancel" : "+ Log Outreach";
  Object.assign(logBtn.style, {
    display: "block",
    width: "100%",
    marginBottom: "12px",
    padding: "8px",
    border: "2px dashed #0176d3",
    borderRadius: "8px",
    background: currentCaseAnalysisState.outreachShowForm ? "#f9fafb" : "#eff6ff",
    color: "#0176d3",
    fontWeight: "700",
    fontSize: "13px",
    cursor: "pointer",
  });
  logBtn.onclick = () => {
    currentCaseAnalysisState.outreachShowForm = !currentCaseAnalysisState.outreachShowForm;
    // Reset form when opening
    if (currentCaseAnalysisState.outreachShowForm) {
      const caseId = currentCaseAnalysisState.payload?.caseId || "";
      currentCaseAnalysisState.outreachForm = {
        supplierId: "",
        supplierName: "",
        supplierSearchQuery: "",
        supplierSearchResults: [],
        contactEmail: "",
        subject: "",
        method: "email",
        sentAt: new Date().toISOString().slice(0, 10),
        followUpDays: "7",
        notes: "",
        regulationTags: [],
        caseId,
        submitting: false,
        submitError: null,
      };
    }
    rerenderCurrentCaseToast();
  };
  wrapper.appendChild(logBtn);

  // ── Inline form ─────────────────────────────────────────────────────────────
  if (currentCaseAnalysisState.outreachShowForm) {
    wrapper.appendChild(createOutreachForm());
  }

  // ── Records list ────────────────────────────────────────────────────────────
  const filteredRecords = records.filter((r) => {
    if (currentFilter === "all") return true;
    return getEffectiveOutreachStatus(r) === currentFilter;
  });

  if (filteredRecords.length === 0) {
    const empty = document.createElement("div");
    Object.assign(empty.style, {
      padding: "32px 20px",
      textAlign: "center",
      color: "#9ca3af",
      fontSize: "13px",
    });
    if (records.length === 0) {
      empty.appendChild(document.createTextNode("No outreach logged yet."));
      empty.appendChild(document.createElement("br"));
      empty.appendChild(document.createTextNode("Use "));
      const _em = document.createElement("strong");
      _em.textContent = "+ Log Outreach";
      empty.appendChild(_em);
      empty.appendChild(document.createTextNode(" to track emails and requests to suppliers."));
    } else {
      empty.textContent = "No records match the selected filter.";
    }
    wrapper.appendChild(empty);
    return wrapper;
  }

  filteredRecords.forEach((record) => {
    wrapper.appendChild(createOutreachCard(record));
  });

  return wrapper;
}

function createOutreachForm() {
  const form = currentCaseAnalysisState.outreachForm;
  const container = document.createElement("div");
  Object.assign(container.style, {
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "14px",
    marginBottom: "14px",
    background: "#f9fafb",
  });

  const labelStyle = { display: "block", fontSize: "11px", fontWeight: "700", color: "#374151", marginBottom: "3px", marginTop: "10px" };
  const inputStyle = { width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "12px", boxSizing: "border-box" };

  function makeLabel(text) {
    const el = document.createElement("label");
    el.textContent = text;
    Object.assign(el.style, labelStyle);
    return el;
  }

  function makeInput(type, value, onchange, placeholder = "") {
    const el = document.createElement("input");
    el.type = type;
    el.value = value || "";
    el.placeholder = placeholder;
    Object.assign(el.style, inputStyle);
    el.oninput = (e) => onchange(e.target.value);
    return el;
  }

  // Supplier search
  container.appendChild(makeLabel("Supplier *"));
  const supplierSearchInput = makeInput("text", form.supplierName || form.supplierSearchQuery, (v) => {
    currentCaseAnalysisState.outreachForm.supplierSearchQuery = v;
    if (!v) {
      currentCaseAnalysisState.outreachForm.supplierId = "";
      currentCaseAnalysisState.outreachForm.supplierName = "";
      currentCaseAnalysisState.outreachForm.supplierSearchResults = [];
      rerenderCurrentCaseToast();
      return;
    }
    // Debounce: search after typing
    clearTimeout(supplierSearchInput._timer);
    supplierSearchInput._timer = setTimeout(async () => {
      const resp = await sendMessageAsync({ type: "EXT_SEARCH_SUPPLIERS", payload: { q: v } });
      currentCaseAnalysisState.outreachForm.supplierSearchResults = resp?.suppliers || [];
      rerenderCurrentCaseToast();
    }, 250);
  }, "Search supplier...");
  container.appendChild(supplierSearchInput);

  if (form.supplierSearchResults?.length > 0 && !form.supplierId) {
    const dropdown = document.createElement("div");
    Object.assign(dropdown.style, {
      border: "1px solid #d1d5db",
      borderRadius: "6px",
      background: "#fff",
      maxHeight: "140px",
      overflowY: "auto",
      marginTop: "2px",
      zIndex: "1000",
    });
    form.supplierSearchResults.slice(0, 10).forEach((s) => {
      const opt = document.createElement("div");
      opt.textContent = `${s.supplierName} (${s.supplierCode})`;
      Object.assign(opt.style, {
        padding: "6px 10px",
        fontSize: "12px",
        cursor: "pointer",
        borderBottom: "1px solid #f3f4f6",
      });
      opt.onmouseenter = () => { opt.style.background = "#eff6ff"; };
      opt.onmouseleave = () => { opt.style.background = ""; };
      opt.onclick = () => {
        currentCaseAnalysisState.outreachForm.supplierId = s._id || s.supplierId || "";
        currentCaseAnalysisState.outreachForm.supplierName = s.supplierName;
        currentCaseAnalysisState.outreachForm.supplierSearchQuery = s.supplierName;
        currentCaseAnalysisState.outreachForm.supplierSearchResults = [];
        rerenderCurrentCaseToast();
      };
      dropdown.appendChild(opt);
    });
    container.appendChild(dropdown);
  }

  // Subject
  container.appendChild(makeLabel("Subject / Email identifier *"));
  container.appendChild(makeInput("text", form.subject, (v) => { currentCaseAnalysisState.outreachForm.subject = v; }, "e.g. Request for REACH Statement Q2 2025"));

  // Contact email
  container.appendChild(makeLabel("Contact email"));
  container.appendChild(makeInput("email", form.contactEmail, (v) => { currentCaseAnalysisState.outreachForm.contactEmail = v; }, "supplier@example.com"));

  // Method
  container.appendChild(makeLabel("Method"));
  const methodSel = document.createElement("select");
  Object.assign(methodSel.style, inputStyle);
  [["email", "Email"], ["phone", "Phone"], ["portal", "Supplier portal"], ["meeting", "Meeting"], ["other", "Other"]].forEach(([val, label]) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    opt.selected = form.method === val;
    methodSel.appendChild(opt);
  });
  methodSel.onchange = (e) => { currentCaseAnalysisState.outreachForm.method = e.target.value; };
  container.appendChild(methodSel);

  // Sent date
  container.appendChild(makeLabel("Date sent"));
  container.appendChild(makeInput("date", form.sentAt, (v) => { currentCaseAnalysisState.outreachForm.sentAt = v; }));

  // Follow-up in
  container.appendChild(makeLabel("Follow up in"));
  const fuSel = document.createElement("select");
  Object.assign(fuSel.style, inputStyle);
  [["3", "3 days"], ["7", "7 days"], ["14", "14 days"], ["30", "30 days"], ["0", "No follow-up"]].forEach(([val, label]) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    opt.selected = form.followUpDays === val;
    fuSel.appendChild(opt);
  });
  fuSel.onchange = (e) => { currentCaseAnalysisState.outreachForm.followUpDays = e.target.value; };
  container.appendChild(fuSel);

  // Case ID
  container.appendChild(makeLabel("Case ID (optional)"));
  container.appendChild(makeInput("text", form.caseId || "", (v) => { currentCaseAnalysisState.outreachForm.caseId = v; }, "Salesforce case number"));

  // Regulation tags
  container.appendChild(makeLabel("Regulations (optional)"));
  const tagsRow = document.createElement("div");
  Object.assign(tagsRow.style, { display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" });
  ["REACH", "RoHS", "Conflict Minerals", "PFAS", "TSCA", "Prop 65"].forEach((tag) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = tag;
    const isSelected = (form.regulationTags || []).includes(tag);
    Object.assign(btn.style, {
      border: isSelected ? "2px solid #0176d3" : "1px solid #d1d5db",
      borderRadius: "9999px",
      background: isSelected ? "#eff6ff" : "#fff",
      color: isSelected ? "#0176d3" : "#374151",
      padding: "3px 10px",
      fontSize: "11px",
      fontWeight: "600",
      cursor: "pointer",
    });
    btn.onclick = () => {
      const tags = currentCaseAnalysisState.outreachForm.regulationTags || [];
      currentCaseAnalysisState.outreachForm.regulationTags = isSelected
        ? tags.filter((t) => t !== tag)
        : [...tags, tag];
      rerenderCurrentCaseToast();
    };
    tagsRow.appendChild(btn);
  });
  container.appendChild(tagsRow);

  // Notes
  container.appendChild(makeLabel("Notes"));
  const notes = document.createElement("textarea");
  notes.value = form.notes || "";
  notes.placeholder = "Any additional context...";
  notes.rows = 2;
  Object.assign(notes.style, { ...inputStyle, resize: "vertical" });
  notes.oninput = (e) => { currentCaseAnalysisState.outreachForm.notes = e.target.value; };
  container.appendChild(notes);

  // Error
  if (form.submitError) {
    const errEl = document.createElement("div");
    errEl.textContent = form.submitError;
    Object.assign(errEl.style, { color: "#dc2626", fontSize: "12px", marginTop: "8px" });
    container.appendChild(errEl);
  }

  // Submit
  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.textContent = form.submitting ? "Logging..." : "Log Outreach";
  submitBtn.disabled = form.submitting;
  Object.assign(submitBtn.style, {
    marginTop: "12px",
    width: "100%",
    padding: "8px",
    background: form.submitting ? "#9ca3af" : "#0176d3",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontWeight: "700",
    fontSize: "13px",
    cursor: form.submitting ? "default" : "pointer",
  });
  submitBtn.onclick = async () => {
    const f = currentCaseAnalysisState.outreachForm;

    if (!f.supplierId || !f.supplierName) {
      currentCaseAnalysisState.outreachForm.submitError = "Please select a supplier from the dropdown.";
      rerenderCurrentCaseToast();
      return;
    }
    if (!f.subject?.trim()) {
      currentCaseAnalysisState.outreachForm.submitError = "Subject / identifier is required.";
      rerenderCurrentCaseToast();
      return;
    }

    currentCaseAnalysisState.outreachForm.submitting = true;
    currentCaseAnalysisState.outreachForm.submitError = null;
    rerenderCurrentCaseToast();

    const sentAt = f.sentAt || new Date().toISOString().slice(0, 10);
    let nextFollowUpAt = null;
    if (f.followUpDays && f.followUpDays !== "0") {
      const d = new Date(sentAt);
      d.setDate(d.getDate() + parseInt(f.followUpDays, 10));
      nextFollowUpAt = d.toISOString();
    }

    const resp = await sendMessageAsync({
      type: "EXT_CREATE_OUTREACH",
      payload: {
        supplierId: f.supplierId,
        supplierName: f.supplierName,
        caseId: f.caseId || null,
        contactEmail: f.contactEmail || "",
        subject: f.subject.trim(),
        method: f.method || "email",
        sentAt,
        nextFollowUpAt,
        notes: f.notes || "",
        regulationTags: f.regulationTags || [],
      },
    });

    currentCaseAnalysisState.outreachForm.submitting = false;

    if (!resp?.ok) {
      currentCaseAnalysisState.outreachForm.submitError = resp?.error || "Failed to log outreach.";
      rerenderCurrentCaseToast();
      return;
    }

    // Success: close form and reload list
    currentCaseAnalysisState.outreachShowForm = false;
    currentCaseAnalysisState.outreachList = null;
    loadOutreachList();
  };
  container.appendChild(submitBtn);

  return container;
}

function createOutreachTimeline(record, effectiveStatus) {
  function fmtDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  const steps = [];

  steps.push({
    label: "Sent",
    date: fmtDate(record.sentAt),
    done: true,
    color: "#6b7280",
  });

  if (record.nextFollowUpAt) {
    const isOverdue = effectiveStatus === "overdue";
    const isPast = new Date(record.nextFollowUpAt) < new Date();
    steps.push({
      label: isOverdue ? "Overdue" : "Follow-up",
      date: fmtDate(record.nextFollowUpAt),
      done: isPast,
      color: isOverdue ? "#dc2626" : isPast ? "#6b7280" : "#0176d3",
    });
  }

  steps.push({
    label: "Responded",
    date: fmtDate(record.respondedAt),
    done: !!record.respondedAt,
    color: record.respondedAt ? "#059669" : "#d1d5db",
  });

  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    display: "flex",
    alignItems: "flex-start",
    marginTop: "8px",
    marginBottom: "8px",
  });

  steps.forEach((step, i) => {
    const node = document.createElement("div");
    Object.assign(node.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "3px",
      minWidth: "60px",
    });

    const dot = document.createElement("div");
    Object.assign(dot.style, {
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      background: step.done ? step.color : "#fff",
      border: `2px solid ${step.done ? step.color : "#d1d5db"}`,
      flexShrink: "0",
    });

    const labelEl = document.createElement("div");
    labelEl.textContent = step.label;
    Object.assign(labelEl.style, {
      fontSize: "10px",
      fontWeight: "700",
      color: step.done ? step.color : "#9ca3af",
      textAlign: "center",
      lineHeight: "1.2",
    });

    const dateEl = document.createElement("div");
    dateEl.textContent = step.date || "—";
    Object.assign(dateEl.style, {
      fontSize: "10px",
      color: "#9ca3af",
      textAlign: "center",
    });

    node.appendChild(dot);
    node.appendChild(labelEl);
    node.appendChild(dateEl);
    wrapper.appendChild(node);

    if (i < steps.length - 1) {
      const line = document.createElement("div");
      Object.assign(line.style, {
        flex: "1",
        height: "2px",
        background: "#e5e7eb",
        marginTop: "4px",
        minWidth: "12px",
      });
      wrapper.appendChild(line);
    }
  });

  return wrapper;
}

function createOutreachCard(record) {
  const effectiveStatus = getEffectiveOutreachStatus(record);

  const card = document.createElement("div");
  Object.assign(card.style, {
    border: "1px solid",
    borderColor: effectiveStatus === "overdue" ? "#fca5a5" : "#e5e7eb",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "8px",
    background: effectiveStatus === "overdue" ? "#fff7f7" : "#fff",
  });

  // Header row
  const headerRow = document.createElement("div");
  Object.assign(headerRow.style, { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" });

  const supplierName = document.createElement("span");
  supplierName.textContent = record.supplierName;
  Object.assign(supplierName.style, { fontWeight: "700", fontSize: "13px", color: "#111827", flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });

  headerRow.appendChild(supplierName);
  headerRow.appendChild(createOutreachStatusBadge(effectiveStatus));
  card.appendChild(headerRow);

  // Subject
  const subjectEl = document.createElement("div");
  subjectEl.textContent = record.subject;
  Object.assign(subjectEl.style, { fontSize: "12px", color: "#374151", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
  card.appendChild(subjectEl);

  // Meta row
  const metaRow = document.createElement("div");
  Object.assign(metaRow.style, { display: "flex", gap: "12px", fontSize: "11px", color: "#6b7280", flexWrap: "wrap", marginBottom: "6px" });

  const sentLabel = document.createElement("span");
  sentLabel.textContent = `Sent: ${formatOutreachDate(record.sentAt)} (${formatDaysAgo(record.sentAt)})`;
  metaRow.appendChild(sentLabel);

  if (record.nextFollowUpAt && effectiveStatus !== "responded") {
    const fuLabel = document.createElement("span");
    fuLabel.textContent = `Follow up: ${formatOutreachDate(record.nextFollowUpAt)}`;
    fuLabel.style.color = effectiveStatus === "overdue" ? "#dc2626" : "#6b7280";
    fuLabel.style.fontWeight = effectiveStatus === "overdue" ? "700" : "400";
    metaRow.appendChild(fuLabel);
  }

  if (record.regulationTags?.length > 0) {
    const tagsLabel = document.createElement("span");
    tagsLabel.textContent = record.regulationTags.join(", ");
    metaRow.appendChild(tagsLabel);
  }

  if (record.contactEmail) {
    const emailLabel = document.createElement("span");
    emailLabel.textContent = `✉ ${record.contactEmail}`;
    metaRow.appendChild(emailLabel);
  }

  card.appendChild(metaRow);
  card.appendChild(createOutreachTimeline(record, effectiveStatus));

  if (record.notes) {
    const notesEl = document.createElement("div");
    notesEl.textContent = record.notes;
    Object.assign(notesEl.style, { fontSize: "11px", color: "#6b7280", fontStyle: "italic", marginBottom: "6px", borderLeft: "2px solid #e5e7eb", paddingLeft: "8px" });
    card.appendChild(notesEl);
  }

  // Action buttons row
  const actionsRow = document.createElement("div");
  Object.assign(actionsRow.style, { display: "flex", gap: "6px", flexWrap: "wrap" });

  function makeActionBtn(label, color, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    Object.assign(btn.style, {
      border: `1px solid ${color}`,
      borderRadius: "6px",
      background: "#fff",
      color,
      padding: "3px 10px",
      fontSize: "11px",
      fontWeight: "600",
      cursor: "pointer",
    });
    btn.onclick = onClick;
    return btn;
  }

  // Mark Responded
  if (effectiveStatus !== "responded" && effectiveStatus !== "closed") {
    actionsRow.appendChild(makeActionBtn("✓ Responded", "#059669", async () => {
      const resp = await sendMessageAsync({
        type: "EXT_UPDATE_OUTREACH",
        payload: { id: record._id, status: "responded", respondedAt: new Date().toISOString() },
      });
      if (resp?.ok) {
        currentCaseAnalysisState.outreachList = null;
        loadOutreachList();
      }
    }));
  }

  // Follow Up Again
  if (effectiveStatus !== "responded" && effectiveStatus !== "closed") {
    actionsRow.appendChild(makeActionBtn("↻ Follow Up Again", "#0176d3", async () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      const resp = await sendMessageAsync({
        type: "EXT_UPDATE_OUTREACH",
        payload: { id: record._id, status: "awaiting", nextFollowUpAt: d.toISOString() },
      });
      if (resp?.ok) {
        currentCaseAnalysisState.outreachList = null;
        loadOutreachList();
      }
    }));
  }

  // Copy template
  actionsRow.appendChild(makeActionBtn("Copy Template", "#6b7280", () => {
    const template = `Subject: Follow-up: ${record.subject}\n\nDear ${record.supplierName} team,\n\nWe are following up on our previous request regarding compliance documentation${record.regulationTags?.length ? ` (${record.regulationTags.join(", ")})` : ""}.\n\nCould you please provide an update on the status of this request? We need the updated documents for our compliance records.\n\nThank you for your cooperation.\n\nBest regards`;
    navigator.clipboard.writeText(template).catch(() => {});
  }));

  // Delete
  actionsRow.appendChild(makeActionBtn("✕ Delete", "#dc2626", async () => {
    if (!confirm(`Delete outreach record for ${record.supplierName}?`)) return;
    const resp = await sendMessageAsync({
      type: "EXT_DELETE_OUTREACH",
      payload: { id: record._id },
    });
    if (resp?.ok) {
      currentCaseAnalysisState.outreachList = null;
      loadOutreachList();
    }
  }));

  card.appendChild(actionsRow);

  // ── Reminder section ────────────────────────────────────────────────────────
  const existingReminder = currentCaseAnalysisState.outreachReminders?.[record._id];
  const isPickerOpen = currentCaseAnalysisState.outreachReminderPickerFor === record._id;

  const reminderSection = document.createElement("div");
  Object.assign(reminderSection.style, { marginTop: "8px" });

  if (existingReminder && !isPickerOpen) {
    // Show active reminder with cancel option
    const reminderRow = document.createElement("div");
    Object.assign(reminderRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 10px",
      background: "#fffbeb",
      border: "1px solid #fde68a",
      borderRadius: "8px",
      fontSize: "12px",
      color: "#92400e",
    });
    reminderRow.appendChild(document.createTextNode("🔔 Reminder: "));
    const _reminderStrong = document.createElement("strong");
    _reminderStrong.textContent = formatOutreachDate(existingReminder.remindAt);
    reminderRow.appendChild(_reminderStrong);

    const cancelReminderBtn = document.createElement("button");
    cancelReminderBtn.type = "button";
    cancelReminderBtn.textContent = "✕";
    Object.assign(cancelReminderBtn.style, {
      marginLeft: "auto",
      border: "none",
      background: "transparent",
      color: "#92400e",
      cursor: "pointer",
      fontSize: "12px",
      padding: "0 2px",
    });
    cancelReminderBtn.title = "Cancel reminder";
    cancelReminderBtn.onclick = async () => {
      await sendMessageAsync({ type: "EXT_CANCEL_REMINDER", payload: { recordId: record._id } });
      const r = await sendMessageAsync({ type: "EXT_GET_REMINDERS" });
      currentCaseAnalysisState.outreachReminders = r?.reminders || {};
      rerenderCurrentCaseToast();
    };
    reminderRow.appendChild(cancelReminderBtn);
    reminderSection.appendChild(reminderRow);
  } else if (isPickerOpen) {
    // Show date picker
    const pickerRow = document.createElement("div");
    Object.assign(pickerRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 0",
    });

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = currentCaseAnalysisState.outreachReminderDate ||
      new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    Object.assign(dateInput.style, {
      padding: "5px 8px",
      border: "1px solid #d1d5db",
      borderRadius: "6px",
      fontSize: "12px",
      flex: "1",
    });
    dateInput.min = new Date(Date.now() + 60000).toISOString().slice(0, 10);
    dateInput.oninput = (e) => { currentCaseAnalysisState.outreachReminderDate = e.target.value; };

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.textContent = "Set";
    Object.assign(confirmBtn.style, {
      padding: "5px 12px",
      border: "1px solid #0176d3",
      borderRadius: "6px",
      background: "#0176d3",
      color: "#fff",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer",
    });
    confirmBtn.onclick = async () => {
      const dateStr = dateInput.value;
      if (!dateStr) return;
      // Set to noon on the chosen day to avoid timezone issues
      const remindAt = new Date(dateStr + "T12:00:00").toISOString();
      const resp = await sendMessageAsync({
        type: "EXT_SET_REMINDER",
        payload: { recordId: record._id, remindAt, supplierName: record.supplierName, subject: record.subject },
      });
      if (resp?.ok) {
        currentCaseAnalysisState.outreachReminderPickerFor = null;
        currentCaseAnalysisState.outreachReminderDate = "";
        const r = await sendMessageAsync({ type: "EXT_GET_REMINDERS" });
        currentCaseAnalysisState.outreachReminders = r?.reminders || {};
        rerenderCurrentCaseToast();
      }
    };

    const cancelPickerBtn = document.createElement("button");
    cancelPickerBtn.type = "button";
    cancelPickerBtn.textContent = "Cancel";
    Object.assign(cancelPickerBtn.style, {
      padding: "5px 10px",
      border: "1px solid #e5e7eb",
      borderRadius: "6px",
      background: "#fff",
      color: "#6b7280",
      fontSize: "12px",
      cursor: "pointer",
    });
    cancelPickerBtn.onclick = () => {
      currentCaseAnalysisState.outreachReminderPickerFor = null;
      currentCaseAnalysisState.outreachReminderDate = "";
      rerenderCurrentCaseToast();
    };

    pickerRow.appendChild(dateInput);
    pickerRow.appendChild(confirmBtn);
    pickerRow.appendChild(cancelPickerBtn);
    reminderSection.appendChild(pickerRow);
  } else {
    // Show "Set reminder" link
    const setBtn = document.createElement("button");
    setBtn.type = "button";
    setBtn.textContent = "🔔 Set reminder";
    Object.assign(setBtn.style, {
      border: "none",
      background: "transparent",
      color: "#6b7280",
      fontSize: "11px",
      cursor: "pointer",
      padding: "2px 0",
      textDecoration: "underline",
    });
    setBtn.onclick = () => {
      currentCaseAnalysisState.outreachReminderPickerFor = record._id;
      currentCaseAnalysisState.outreachReminderDate = "";
      rerenderCurrentCaseToast();
    };
    reminderSection.appendChild(setBtn);
  }

  card.appendChild(reminderSection);
  return card;
}

function createSuppliersTabContent() {
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "8px";

  if (currentCaseAnalysisState.suppliersLibraryCachedAt) {
    wrapper.appendChild(createOfflineBanner(currentCaseAnalysisState.suppliersLibraryCachedAt));
  }

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
  subTabBar.appendChild(createSubTabBtn("New Statement", "new_statement"));
  subTabBar.appendChild(createSubTabBtn("Outreach", "outreach"));

  wrapper.appendChild(subTabBar);

  // --- New Statement sub-tab ---
  if (suppliersSubTab === "new_statement") {
    wrapper.appendChild(createAddStatementTabContent());
    return wrapper;
  }

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
      wrapper.appendChild(createSuppliersSkeletonLoader());
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

  // --- Outreach sub-tab ---
  if (suppliersSubTab === "outreach") {
    if (
      !currentCaseAnalysisState.outreachList &&
      !currentCaseAnalysisState.outreachLoading &&
      !currentCaseAnalysisState.outreachError
    ) {
      loadOutreachList();
    }

    if (currentCaseAnalysisState.outreachLoading) {
      wrapper.appendChild(createOutreachSkeletonLoader());
      return wrapper;
    }

    if (currentCaseAnalysisState.outreachError) {
      wrapper.appendChild(
        createInfoRow("Error", currentCaseAnalysisState.outreachError)
      );
      return wrapper;
    }

    wrapper.appendChild(
      createOutreachTabContent(currentCaseAnalysisState.outreachList || [])
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

  wrapper.appendChild(createSuppliersLibraryFilterBar(suppliers));

  const filteredSuppliers = getFilteredLibrarySuppliers(suppliers);
  const activeQuery = (currentCaseAnalysisState.suppliersLibrarySearch || "").trim();
  const hasActiveFilter =
    !!activeQuery ||
    !!currentCaseAnalysisState.suppliersLibraryRegFilter ||
    (currentCaseAnalysisState.suppliersLibraryStatusFilter || "all") !== "all";

  const summary = document.createElement("div");
  if (activeQuery) {
    summary.textContent = filteredSuppliers.length === 0
      ? `No suppliers matched "${activeQuery}"`
      : `${filteredSuppliers.length} result${filteredSuppliers.length === 1 ? "" : "s"} for "${activeQuery}"`;
  } else if (hasActiveFilter) {
    summary.textContent = `Showing ${filteredSuppliers.length} of ${suppliers.length} suppliers`;
  } else {
    summary.textContent = `Suppliers found: ${
      typeof currentCaseAnalysisState.suppliersLibrary?.total === "number"
        ? currentCaseAnalysisState.suppliersLibrary.total
        : suppliers.length
    }`;
  }
  Object.assign(summary.style, {
    fontSize: "13px",
    color: hasActiveFilter ? "#0176d3" : "#4b5563",
    fontWeight: hasActiveFilter ? "600" : "400",
    marginBottom: "12px",
  });
  wrapper.appendChild(summary);

  if (!suppliers.length) {
    wrapper.appendChild(createInfoRow("Suppliers", "No suppliers found."));
    return wrapper;
  }

  if (!filteredSuppliers.length) {
    wrapper.appendChild(createInfoRow("Suppliers", "No suppliers match the selected filters."));
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

  filteredSuppliers.forEach((supplier) => {
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

  const selectedSupplier =
    filteredSuppliers.find(
      (item) =>
        String(item?.supplierId || "") ===
        String(currentCaseAnalysisState.selectedSupplierLibraryId || "")
    ) || filteredSuppliers[0];

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

  const statusRow = document.createElement("div");
  Object.assign(statusRow.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 0",
  });

  const statusLabel = document.createElement("span");
  statusLabel.textContent = "Analyzing...";
  Object.assign(statusLabel.style, { fontSize: "13px", color: "#6b7280", flex: "1" });

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  Object.assign(cancelBtn.style, {
    border: "1px solid #d0d7de",
    borderRadius: "6px",
    background: "#fff",
    color: "#6b7280",
    padding: "2px 10px",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
    flexShrink: "0",
  });
  cancelBtn.onclick = () => {
    activeCaseRequestToken++;
    lastSentCaseUrl = null;
    lastCompletedRecordId = null;
    clearToastBody(body);
    body.appendChild(createInfoRow("Case Number", payload.caseId));
    body.appendChild(createInfoRow("Status", "Cancelled — click ↺ to re-analyze"));
  };

  statusRow.appendChild(statusLabel);
  statusRow.appendChild(cancelBtn);
  body.appendChild(statusRow);
}

function _matchesQuery(text, q) {
  return String(text || "").toLowerCase().includes(q);
}

function createGlobalSearchResults(query) {
  const q = query.toLowerCase();
  const wrapper = document.createElement("div");

  const makeSection = (title) => {
    const sec = document.createElement("div");
    sec.style.marginBottom = "14px";
    const hdr = document.createElement("div");
    Object.assign(hdr.style, {
      fontSize: "11px", fontWeight: "600", color: "#6b7280",
      textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px",
    });
    hdr.textContent = title;
    sec.appendChild(hdr);
    return sec;
  };

  const makeRow = (primary, secondary, onClick) => {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "6px 8px", borderRadius: "6px", cursor: "pointer",
      border: "1px solid #e5e7eb", marginBottom: "4px", gap: "8px",
    });
    row.addEventListener("mouseover", () => row.style.background = "#f3f4f6");
    row.addEventListener("mouseout", () => row.style.background = "");
    const lbl = document.createElement("div");
    Object.assign(lbl.style, { fontSize: "12px", fontWeight: "600", flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    lbl.textContent = primary;
    const sub = document.createElement("div");
    Object.assign(sub.style, { fontSize: "11px", color: "#6b7280", flexShrink: "0" });
    sub.textContent = secondary;
    row.appendChild(lbl);
    row.appendChild(sub);
    row.addEventListener("click", onClick);
    return row;
  };

  let total = 0;

  // --- Suppliers ---
  const suppliers = currentCaseAnalysisState.suppliersLibrary?.suppliers || [];
  const suppMatches = suppliers.filter((s) =>
    _matchesQuery(s.supplierName, q) ||
    _matchesQuery(s.supplierCode, q) ||
    (Array.isArray(s.aliases) && s.aliases.some((a) => _matchesQuery(a, q)))
  ).slice(0, 5);

  if (suppMatches.length > 0) {
    const sec = makeSection("Suppliers");
    suppMatches.forEach((s) => {
      const regCount = Array.isArray(s.regulationSummary) ? s.regulationSummary.length : 0;
      sec.appendChild(makeRow(s.supplierName, `${regCount} reg`, () => {
        currentCaseAnalysisState.globalSearchQuery = "";
        currentCaseAnalysisState.selectedSupplierLibraryId = s.supplierId;
        activeCaseToastTab = "suppliers";
        suppliersSubTab = "library";
        rerenderCurrentCaseToast();
      }));
    });
    wrapper.appendChild(sec);
    total += suppMatches.length;
  }

  // --- Materials ---
  const materials = Array.isArray(currentCaseAnalysisState.overriddenMaterials)
    ? currentCaseAnalysisState.overriddenMaterials : [];
  const matMatches = materials.filter((m) =>
    _matchesQuery(m.part_number, q) || _matchesQuery(m.description, q)
  ).slice(0, 5);

  if (matMatches.length > 0) {
    const sec = makeSection("Materials");
    matMatches.forEach((m) => {
      sec.appendChild(makeRow(m.part_number || "—", m.description || "", () => {
        currentCaseAnalysisState.globalSearchQuery = "";
        activeCaseToastTab = "materials";
        rerenderCurrentCaseToast();
      }));
    });
    wrapper.appendChild(sec);
    total += matMatches.length;
  }

  // --- Outreach ---
  const outreach = Array.isArray(currentCaseAnalysisState.outreachList)
    ? currentCaseAnalysisState.outreachList : [];
  const outMatches = outreach.filter((o) =>
    _matchesQuery(o.supplierName, q) ||
    _matchesQuery(o.subject, q) ||
    _matchesQuery(o.notes, q)
  ).slice(0, 5);

  if (outMatches.length > 0) {
    const sec = makeSection("Outreach");
    outMatches.forEach((o) => {
      sec.appendChild(makeRow(o.supplierName, o.status || "", () => {
        currentCaseAnalysisState.globalSearchQuery = "";
        activeCaseToastTab = "suppliers";
        suppliersSubTab = "outreach";
        rerenderCurrentCaseToast();
      }));
    });
    wrapper.appendChild(sec);
    total += outMatches.length;
  }

  if (total === 0) {
    const empty = document.createElement("div");
    Object.assign(empty.style, { fontSize: "12px", color: "#9ca3af", fontStyle: "italic", padding: "12px 0" });
    empty.textContent = `No results for "${query}"`;
    wrapper.appendChild(empty);
  }

  return wrapper;
}

function renderCaseToastAnalysis(payload, response) {
  const toast = getOrCreateCaseToast();
  const body = toast.querySelector("#sf-compliance-case-toast-body");
  if (!body) return;

  const rerender = () => {
    clearToastBody(body);
    setCaseToastTab(activeCaseToastTab);

    if (currentCaseAnalysisState.globalSearchQuery) {
      body.appendChild(createGlobalSearchResults(currentCaseAnalysisState.globalSearchQuery));
      return;
    }

    const analyzeJson =
      response?.analyzeResult?.json ||
      safeParseJson(response?.analyzeResult?.body || "");

    const analysis =
      currentCaseAnalysisState.analysis ||
      analyzeJson?.result?.analysis ||
      null;

    const hasAnalyzeResult = !!response?.analyzeResult;
    const isLookupTab = activeCaseToastTab === "lookup";
    const isSuppliersTab = activeCaseToastTab === "suppliers";

    if (!isLookupTab && !isSuppliersTab && hasAnalyzeResult && !response?.analyzeResult?.ok) {
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

    if (!isLookupTab && !isSuppliersTab && !analysis) {
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

    if (currentCaseAnalysisState.cachedAt) {
      body.appendChild(createOfflineBanner(currentCaseAnalysisState.cachedAt));
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

function updateLauncherState() {}

function toggleAuthCard() {
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

function getOrCreateAuthLauncher() { return null; }
function ensureLauncherVisible() {}
function hideLauncher() {}
function showLauncher() {}

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
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
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
      <div style="display:flex; gap:0; margin-bottom:12px; border:1px solid #d0d7de; border-radius:9px; overflow:hidden;">
        <button
          id="sf-compliance-tab-login"
          type="button"
          style="flex:1; padding:7px; border:none; background:#0176d3; color:#fff; font-size:12px; font-weight:700; cursor:pointer;"
        >Sign in</button>
        <button
          id="sf-compliance-tab-register"
          type="button"
          style="flex:1; padding:7px; border:none; background:#ffffff; color:#444; font-size:12px; font-weight:600; cursor:pointer;"
        >Register</button>
      </div>

      <div id="sf-compliance-name-row" style="display:none; margin-bottom:8px;">
        <label style="display:block; font-weight:600; margin-bottom:4px;">Name</label>
        <input
          id="sf-compliance-auth-name"
          type="text"
          autocomplete="name"
          style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #c9d1d9; border-radius:8px;"
          placeholder="Your name"
        />
      </div>

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

      <button
        id="sf-compliance-open-panel"
        type="button"
        style="display:none; width:100%; margin-top:8px; padding:9px 12px; border:none; border-radius:9px; background:#0176d3; color:#ffffff; font-weight:700; cursor:pointer;"
      >
        Open Panel
      </button>
    </div>

    <div
      id="sf-compliance-auth-status"
      style="margin-top:10px; min-height:18px; color:#5b5f66;"
    ></div>
  `;

  document.body.appendChild(card);

  const nameInput = card.querySelector("#sf-compliance-auth-name");
  const nameRow = card.querySelector("#sf-compliance-name-row");
  const emailInput = card.querySelector("#sf-compliance-auth-email");
  const passwordInput = card.querySelector("#sf-compliance-auth-password");
  const submitBtn = card.querySelector("#sf-compliance-auth-submit");
  const signOutBtn = card.querySelector("#sf-compliance-auth-signout");
  const closeBtn = card.querySelector("#sf-compliance-auth-close");
  const openPanelBtn = card.querySelector("#sf-compliance-open-panel");
  const tabLogin = card.querySelector("#sf-compliance-tab-login");
  const tabRegister = card.querySelector("#sf-compliance-tab-register");

  card._authMode = "login";

  function setAuthMode(mode) {
    card._authMode = mode;
    const isRegister = mode === "register";

    nameRow.style.display = isRegister ? "block" : "none";
    submitBtn.textContent = isRegister ? "Create account" : "Sign in";

    tabLogin.style.background = isRegister ? "#ffffff" : "#0176d3";
    tabLogin.style.color = isRegister ? "#444" : "#fff";
    tabRegister.style.background = isRegister ? "#0176d3" : "#ffffff";
    tabRegister.style.color = isRegister ? "#fff" : "#444";

    setAuthStatus("");
  }

  tabLogin.addEventListener("click", () => setAuthMode("login"));
  tabRegister.addEventListener("click", () => setAuthMode("register"));

  const handleEnter = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAuthSubmit();
    }
  };

  nameInput.addEventListener("keydown", handleEnter);
  emailInput.addEventListener("keydown", handleEnter);
  passwordInput.addEventListener("keydown", handleEnter);
  submitBtn.addEventListener("click", handleAuthSubmit);
  signOutBtn.addEventListener("click", handleLogout);
  closeBtn.addEventListener("click", () => {
    card.style.display = "none";
  });
  openPanelBtn.addEventListener("click", openStandalonePanel);

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
  const nameInput = card.querySelector("#sf-compliance-auth-name");
  const emailInput = card.querySelector("#sf-compliance-auth-email");
  const passwordInput = card.querySelector("#sf-compliance-auth-password");
  const isRegister = card._authMode === "register";

  if (submitBtn) {
    submitBtn.disabled = isBusy;
    submitBtn.style.opacity = isBusy ? "0.7" : "1";
    if (isBusy) {
      submitBtn.textContent = isRegister ? "Creating account..." : "Signing in...";
    } else {
      submitBtn.textContent = isRegister ? "Create account" : "Sign in";
    }
  }

  if (signOutBtn) {
    signOutBtn.disabled = isBusy;
    signOutBtn.style.opacity = isBusy ? "0.7" : "1";
  }

  if (nameInput) nameInput.disabled = isBusy;
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
  const openPanelBtn = card.querySelector("#sf-compliance-open-panel");
  const tabRow = card.querySelector("#sf-compliance-tab-login")?.parentElement;
  const nameRow = card.querySelector("#sf-compliance-name-row");

  if (emailInput && authState.lastEmail && !emailInput.value) {
    emailInput.value = authState.lastEmail;
  }

  if (authState.authenticated) {
    connectedBox.style.display = "block";
    userLine.textContent =
      authState.user?.email || authState.user?.name || "Authenticated user";
    connectionLine.textContent = "Connected";

    if (tabRow) tabRow.style.display = "none";
    if (nameRow) nameRow.style.display = "none";
    if (passwordInput) passwordInput.value = "";

    if (submitBtn) submitBtn.style.display = "none";

    if (signOutBtn) {
      signOutBtn.style.display = "inline-block";
      signOutBtn.textContent = "Sign out";
      signOutBtn.style.flex = "1";
    }

    if (openPanelBtn) {
      openPanelBtn.style.display = isCaseRecordPage() ? "none" : "block";
    }
  } else {
    connectedBox.style.display = "none";
    userLine.textContent = "";
    connectionLine.textContent = "";

    if (tabRow) tabRow.style.display = "flex";

    if (submitBtn) {
      submitBtn.style.display = "inline-block";
      submitBtn.style.flex = "1";
    }

    if (signOutBtn) signOutBtn.style.display = "none";
    if (openPanelBtn) openPanelBtn.style.display = "none";
  }

  updateLauncherState();
}

function openStandalonePanel() {
  const card = document.getElementById("sf-compliance-auth-card");
  if (card) card.style.display = "none";

  activeCaseToastTab = "suppliers";
  renderCaseToastAnalysis({}, { ok: true });
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
  const isRegister = card._authMode === "register";
  const nameInput = card.querySelector("#sf-compliance-auth-name");
  const emailInput = card.querySelector("#sf-compliance-auth-email");
  const passwordInput = card.querySelector("#sf-compliance-auth-password");

  const name = String(nameInput?.value || "").trim();
  const email = String(emailInput?.value || "").trim();
  const password = String(passwordInput?.value || "");

  if (isRegister && !name) {
    setAuthStatus("Enter your name.", "#b42318");
    return;
  }

  if (!email || !password) {
    setAuthStatus("Enter email and password.", "#b42318");
    return;
  }

  setAuthBusy(true);
  setAuthStatus(isRegister ? "Creating account..." : "Signing in...");

  const response = await sendMessageAsync(
    isRegister
      ? { type: "AUTH_REGISTER", payload: { name, email, password } }
      : { type: "AUTH_LOGIN", payload: { email, password } }
  );

  setAuthBusy(false);

  if (!response?.ok) {
    authState = { ...authState, authenticated: false, user: null, lastEmail: email };
    syncAuthCardUi();
    setAuthStatus(response?.error || (isRegister ? "Registration failed." : "Sign in failed."), "#b42318");
    return;
  }

  authState = {
    authenticated: true,
    user: response?.user || null,
    lastEmail: email,
  };

  if (passwordInput) passwordInput.value = "";
  if (nameInput) nameInput.value = "";

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

  const priorityNode = findFirstVisible([
    '[data-target-selection-name="sfdc:RecordField.Case.Priority"] lightning-formatted-text',
    '[data-target-selection-name="sfdc:RecordField.Case.Priority"]',
    '[field-label="Priority"] lightning-formatted-text',
    '[field-label="Priority"]'
  ]);

  const statusNode = findFirstVisible([
    '[data-target-selection-name="sfdc:RecordField.Case.Status"] lightning-formatted-text',
    '[data-target-selection-name="sfdc:RecordField.Case.Status"]',
    '[field-label="Status"] lightning-formatted-text',
    '[field-label="Status"]'
  ]);

  const accountNode = findFirstVisible([
    '[data-target-selection-name="sfdc:RecordField.Case.AccountId"] a',
    '[data-target-selection-name="sfdc:RecordField.Case.AccountId"] lightning-formatted-text',
    '[field-label="Account Name"] a',
    '[field-label="Account Name"] lightning-formatted-text'
  ]);

  const contactNode = findFirstVisible([
    '[data-target-selection-name="sfdc:RecordField.Case.ContactId"] a',
    '[data-target-selection-name="sfdc:RecordField.Case.ContactId"] lightning-formatted-text',
    '[field-label="Contact Name"] a',
    '[field-label="Contact Name"] lightning-formatted-text'
  ]);

  const typeNode = findFirstVisible([
    '[data-target-selection-name="sfdc:RecordField.Case.Type"] lightning-formatted-text',
    '[data-target-selection-name="sfdc:RecordField.Case.Type"]',
    '[field-label="Type"] lightning-formatted-text',
    '[field-label="Type"]'
  ]);

  const reasonNode = findFirstVisible([
    '[data-target-selection-name="sfdc:RecordField.Case.Reason"] lightning-formatted-text',
    '[data-target-selection-name="sfdc:RecordField.Case.Reason"]',
    '[field-label="Reason"] lightning-formatted-text',
    '[field-label="Reason"]'
  ]);

  return {
    caseId: cleanCaseNumber(normalizeText(caseIdNode?.textContent, 100)),
    subject: normalizeText(cleanSubject(subjectNode?.textContent), 500),
    description: normalizeRichText(descriptionNode?.textContent, 4000),
    href: window.location.href,
    title: normalizeText(document.title, 300),
    capturedAt: new Date().toISOString(),
    priority: normalizeText(priorityNode?.textContent, 50) || null,
    status: normalizeText(statusNode?.textContent, 50) || null,
    accountName: normalizeText(accountNode?.textContent, 200) || null,
    contactName: normalizeText(contactNode?.textContent, 200) || null,
    caseType: normalizeText(typeNode?.textContent, 100) || null,
    reason: normalizeText(reasonNode?.textContent, 100) || null,
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

  const panelAlreadyOpen = !!document.getElementById("sf-compliance-case-toast");
  if (!panelAlreadyOpen && !wasPanelOpen) {
    return;
  }

  const requestToken = ++activeCaseRequestToken;

  console.log("SF payload:", payload);

  wasPanelOpen = true;
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
    currentCaseAnalysisState.cachedAt = response.fromCache ? (response.cachedAt || null) : null;
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

    const errorType = response?.errorType;
    let statusText = "Analysis failed";
    let hintText = null;

    if (errorType === "timeout") {
      statusText = "Request timed out";
      hintText = "The server took too long to respond. Check your connection and try again.";
    } else if (errorType === "network") {
      statusText = "Network error";
      hintText = "Cannot reach the compliance server. Check your internet connection.";
    } else if (errorType === "server") {
      statusText = "Server error";
      hintText = "The compliance server is temporarily unavailable. Try again in a moment.";
    } else if (errorType === "forbidden") {
      statusText = "Access denied";
      hintText = "Your account does not have permission for this action. Contact your administrator.";
    }

    body.appendChild(createInfoRow("Status", statusText));
    body.appendChild(createInfoRow("Detail", response?.error || "Unknown error"));
    if (hintText) {
      const hint = document.createElement("div");
      hint.textContent = hintText;
      Object.assign(hint.style, {
        fontSize: "12px",
        color: "#6b7280",
        fontStyle: "italic",
        marginTop: "6px",
        borderLeft: "3px solid #e5e7eb",
        paddingLeft: "8px",
      });
      body.appendChild(hint);
    }
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
    const hadPanel = !!document.getElementById("sf-compliance-case-toast");
    lastSentCaseUrl = null;
    lastCompletedRecordId = null;
    activeCaseRequestToken += 1;

    resetCaseAnalysisState();
    ensureLauncherVisible();

    if (!isCaseRecordPage()) {
      removeCaseToast();
      hideAuthCard();
      return;
    }

    if (hadPanel && wasPanelOpen && authState.authenticated) {
      renderCaseToastSwitching();
    } else {
      removeCaseToast();
    }

    if (authState.authenticated) {
      scheduleChecks();
    } else {
      removeCaseToast();
      showAuthCard("Sign in to use Compliance Assistant.");
    }
  }
}

function renderCaseToastSwitching() {
  initSkeletonStyles();
  const toast = getOrCreateCaseToast();
  const body = toast.querySelector("#sf-compliance-case-toast-body");
  if (!body) return;
  clearToastBody(body);

  const label = document.createElement("div");
  Object.assign(label.style, {
    fontSize: "12px",
    color: "#6b7280",
    marginBottom: "14px",
    fontStyle: "italic",
  });
  label.textContent = "Loading new case...";
  body.appendChild(label);

  body.appendChild(createSkeletonBlock(["40%", "60%"]));
  const sep = document.createElement("div");
  sep.style.marginTop = "12px";
  body.appendChild(sep);
  body.appendChild(createSuppliersSkeletonLoader());
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

// ─────────────────────────────────────────────────────────────────────────────
// Export helpers: Excel (SpreadsheetML) and PDF (print)
// ─────────────────────────────────────────────────────────────────────────────

function _exportDownloadFile(content, filename, mimeType) {
  const a = document.createElement("a");
  a.href = `data:${mimeType};charset=utf-8,` + encodeURIComponent(content);
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function exportToExcel(data) {
  const STATUS_LABEL = {
    covered: "Covered", partial: "Partial", missing: "Missing",
    expired: "Expired", non_compliant: "Non-Compliant", informational: "Informational",
  };
  const STATUS_COLOR = {
    covered: "C6EFCE", partial: "FFEB9C", missing: "F2F2F2",
    expired: "FFCCCC", non_compliant: "FFC7CE", informational: "DDEBF7",
  };

  function xlEsc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function xlStr(value, styleId) {
    const s = styleId ? ` ss:StyleID="${styleId}"` : "";
    return `<Cell${s}><Data ss:Type="String">${xlEsc(value)}</Data></Cell>`;
  }

  function xlNum(value, styleId) {
    const s = styleId ? ` ss:StyleID="${styleId}"` : "";
    const n = Number(value);
    return `<Cell${s}><Data ss:Type="Number">${isNaN(n) ? 0 : n}</Data></Cell>`;
  }

  function xlRow(cells) {
    return `<Row>${cells.join("")}</Row>`;
  }

  function makeSheet(name, rows) {
    return `<Worksheet ss:Name="${xlEsc(name)}"><Table>${rows.join("")}</Table></Worksheet>`;
  }

  const coverageRateBySupplier = {};
  data.matrix.forEach(r => { coverageRateBySupplier[r.supplierId] = r.coverageRate; });

  // Sheet 1: Compliance Matrix
  const matrixHeaderCells = [
    xlStr("Supplier", "hdr"), xlStr("Code", "hdr"),
    ...data.regulations.map(r => xlStr(r.code + (r.name ? `\n${r.name}` : ""), "hdr")),
    xlStr("Coverage %", "hdr"),
  ];
  const matrixRows = [
    xlRow(matrixHeaderCells),
    ...data.matrix.map(row => xlRow([
      xlStr(row.supplierName),
      xlStr(row.supplierCode || ""),
      ...row.cells.map(c => xlStr(STATUS_LABEL[c.status] || c.status, `bg_${STATUS_COLOR[c.status] || "F2F2F2"}`)),
      xlStr(`${Math.round(row.coverageRate * 100)}%`),
    ])),
  ];

  // Sheet 2: Suppliers Overview
  const supplierRows = [
    xlRow([xlStr("Supplier","hdr"), xlStr("Code","hdr"), xlStr("Documents","hdr"), xlStr("Assertions","hdr"), xlStr("Coverage %","hdr"), xlStr("Contacts","hdr")]),
    ...data.suppliers.map(s => xlRow([
      xlStr(s.supplierName || ""),
      xlStr(s.supplierCode || ""),
      xlNum(s.documentsCount || 0),
      xlNum(s.assertionsCount || 0),
      xlNum(Math.round((coverageRateBySupplier[s.supplierId] || 0) * 100)),
      xlStr((s.contacts || []).map(c => [c.name, c.email].filter(Boolean).join(" ")).filter(Boolean).join("; ")),
    ])),
  ];

  // Sheet 3: Expiring Documents
  const expiringRows = [
    xlRow([xlStr("Supplier","hdr"), xlStr("Code","hdr"), xlStr("Regulation","hdr"), xlStr("Document","hdr"), xlStr("Expires","hdr"), xlStr("Days Left","hdr"), xlStr("Urgency","hdr")]),
    ...data.expiringSoon.map(e => xlRow([
      xlStr(e.supplierName || ""),
      xlStr(e.supplierCode || ""),
      xlStr(e.regulationCode || ""),
      xlStr(e.documentTitle || ""),
      xlStr(e.validUntil ? new Date(e.validUntil).toLocaleDateString() : ""),
      e.daysLeft != null ? xlNum(e.daysLeft) : xlStr("—"),
      xlStr(e.urgency || ""),
    ])),
  ];

  // Sheet 4: At-Risk Suppliers
  const atRiskRows = [
    xlRow([xlStr("Supplier","hdr"), xlStr("Code","hdr"), xlStr("Missing","hdr"), xlStr("Expired","hdr"), xlStr("Non-Compliant","hdr"), xlStr("Gap Score","hdr"), xlStr("Missing Regulations","hdr")]),
    ...data.atRisk.map(r => xlRow([
      xlStr(r.supplierName || ""),
      xlStr(r.supplierCode || ""),
      xlNum(r.missingCount || 0),
      xlNum(r.expiredCount || 0),
      xlNum(r.nonCompliantCount || 0),
      xlNum(r.gapScore || 0),
      xlStr((r.missingRegCodes || []).join(", ")),
    ])),
  ];

  const colorStyles = Object.values(STATUS_COLOR)
    .filter((v, i, a) => a.indexOf(v) === i)
    .map(color => `<Style ss:ID="bg_${color}"><Interior ss:Color="#${color}" ss:Pattern="Solid"/></Style>`)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="hdr">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#D9E1F2" ss:Pattern="Solid"/>
    </Style>
    ${colorStyles}
  </Styles>
  ${makeSheet("Compliance Matrix", matrixRows)}
  ${makeSheet("Suppliers", supplierRows)}
  ${makeSheet("Expiring Documents", expiringRows)}
  ${makeSheet("At Risk", atRiskRows)}
</Workbook>`;

  _exportDownloadFile(xml, "compliance_report.xls", "application/vnd.ms-excel");
}

function exportToPdf(data, casePayload) {
  const STATUS_LABEL = {
    covered: "Covered", partial: "Partial", missing: "Missing",
    expired: "Expired", non_compliant: "Non-Compliant", informational: "Info",
  };
  const STATUS_BG = {
    covered: "#c6efce", partial: "#ffeb9c", missing: "#f2f2f2",
    expired: "#ffcccc", non_compliant: "#ffc7ce", informational: "#ddebf7",
  };

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const caseId = esc(casePayload?.caseId || casePayload?.recordId || "N/A");
  const caseSubject = esc(casePayload?.subject || "N/A");
  const today = new Date().toLocaleDateString();

  const matrixHeaderCols = [
    "<th>Supplier</th><th>Code</th>",
    ...data.regulations.map(r => `<th>${esc(r.code)}</th>`),
    "<th>Rate</th>",
  ].join("");

  const matrixBodyRows = data.matrix.map(row => `<tr>
    <td>${esc(row.supplierName)}</td>
    <td>${esc(row.supplierCode || "")}</td>
    ${row.cells.map(c => `<td style="background:${STATUS_BG[c.status] || "#f2f2f2"};text-align:center">${STATUS_LABEL[c.status] || esc(c.status)}</td>`).join("")}
    <td style="text-align:center;font-weight:600">${Math.round(row.coverageRate * 100)}%</td>
  </tr>`).join("");

  const expiringBodyRows = data.expiringSoon.slice(0, 50).map(e => `<tr>
    <td>${esc(e.supplierName)}</td>
    <td>${esc(e.regulationCode)}</td>
    <td>${esc(e.documentTitle || "")}</td>
    <td>${e.validUntil ? esc(new Date(e.validUntil).toLocaleDateString()) : "—"}</td>
    <td style="color:${e.urgency === "critical" ? "#dc2626" : "#d97706"}">${e.daysLeft != null ? e.daysLeft + "d" : "—"}</td>
  </tr>`).join("");

  const atRiskBodyRows = data.atRisk.slice(0, 30).map(r => `<tr>
    <td>${esc(r.supplierName)}</td>
    <td>${esc(r.supplierCode || "")}</td>
    <td>${r.missingCount || 0}</td>
    <td>${r.expiredCount || 0}</td>
    <td>${r.nonCompliantCount || 0}</td>
    <td>${esc((r.missingRegCodes || []).join(", "))}</td>
  </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Compliance Report — ${caseId}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:20px 28px}
  h1{font-size:17px;margin:0 0 4px}
  h2{font-size:13px;margin:22px 0 7px;border-bottom:1px solid #ccc;padding-bottom:3px;color:#1e3a5f}
  .meta{color:#555;margin-bottom:14px;font-size:11px}
  .stats{display:flex;gap:12px;margin-bottom:18px;flex-wrap:wrap}
  .stat{background:#f6f8fa;border:1px solid #d0d7de;border-radius:8px;padding:8px 14px;text-align:center;min-width:80px}
  .stat .val{font-size:20px;font-weight:700;color:#0176d3}
  .stat .lbl{font-size:10px;color:#6b7280;margin-top:2px}
  table{border-collapse:collapse;width:100%;margin-bottom:14px;font-size:10px}
  th{background:#d9e1f2;border:1px solid #bbb;padding:4px 7px;text-align:left;white-space:nowrap}
  td{border:1px solid #ddd;padding:3px 7px}
  @media print{
    h2{page-break-before:auto}
    table{page-break-inside:auto}
    tr{page-break-inside:avoid}
  }
</style>
</head>
<body>
<h1>Compliance Report</h1>
<div class="meta">Case: <b>${caseId}</b> &nbsp;|&nbsp; ${caseSubject} &nbsp;|&nbsp; Generated: ${today}</div>
<div class="stats">
  <div class="stat"><div class="val">${data.stats.totalSuppliers || 0}</div><div class="lbl">Suppliers</div></div>
  <div class="stat"><div class="val">${data.stats.totalRegulations || 0}</div><div class="lbl">Regulations</div></div>
  <div class="stat"><div class="val">${Math.round((data.stats.overallCoverageRate || 0) * 100)}%</div><div class="lbl">Coverage</div></div>
  <div class="stat"><div class="val">${data.stats.fullyCovered || 0}</div><div class="lbl">Fully Covered</div></div>
  <div class="stat"><div class="val">${data.stats.withGaps || 0}</div><div class="lbl">With Gaps</div></div>
  <div class="stat"><div class="val">${data.expiringSoon.length}</div><div class="lbl">Expiring Soon</div></div>
</div>
<h2>Compliance Matrix</h2>
<table><thead><tr>${matrixHeaderCols}</tr></thead><tbody>${matrixBodyRows}</tbody></table>
${data.expiringSoon.length ? `
<h2>Expiring Documents</h2>
<table>
  <thead><tr><th>Supplier</th><th>Regulation</th><th>Document</th><th>Expires</th><th>Days Left</th></tr></thead>
  <tbody>${expiringBodyRows}</tbody>
</table>` : ""}
${data.atRisk.length ? `
<h2>At-Risk Suppliers</h2>
<table>
  <thead><tr><th>Supplier</th><th>Code</th><th>Missing</th><th>Expired</th><th>Non-Compliant</th><th>Missing Regulations</th></tr></thead>
  <tbody>${atRiskBodyRows}</tbody>
</table>` : ""}
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Pop-up blocked. Please allow pop-ups for this site to export PDF.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
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
      documentAgeData: [],
      allStatements: [],
      supplierFreshness: [],
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

function classifyNonCompliance(assertionsForReg) {
    const assertions = Array.isArray(assertionsForReg) ? assertionsForReg : [];
    const active = assertions.filter(isAssertionActive);
    const hasNonCompliant = active.some(
      (a) => String(a?.assertionType || "").toLowerCase() === "non_compliant"
    );
    if (!hasNonCompliant) return null;
 
    const hasFullScopeNC = active.some(
      (a) =>
        String(a?.assertionType || "").toLowerCase() === "non_compliant" &&
        normalizeCoverageBucket(a) === "supplier_all"
    );
    const hasPositive = active.some((a) => {
      const t = String(a?.assertionType || "").toLowerCase();
      return t === "compliant" || t === "partial" || t === "free_from" || t === "contains";
    });
 
    return hasFullScopeNC && !hasPositive ? "full" : "partial";
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
   const nonComplianceTier = status === "non_compliant"
    ? classifyNonCompliance(assertionsForReg)
    : null;

  return {
    regulationCode: reg.code,
    status,
    scopeSummary,
    assertions: assertionsForReg,
    nonComplianceTier,
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
      c.status === "expired" ||
      c.status === "non_compliant"
  );

  const hasGap = row.cells.some(
    (c) =>
      c.status === "missing" ||
      c.status === "partial" ||
      c.status === "expired" ||
      c.status === "non_compliant"
  );

  return hasAnyCoverage && hasGap;
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
    .map((row) => {
      const missingCells = row.cells.filter((c) => c.status === "missing");
      const partialCells = row.cells.filter((c) => c.status === "partial");
      const expiredCells = row.cells.filter((c) => c.status === "expired");
      const nonCompliantCells = row.cells.filter(
        (c) => c.status === "non_compliant"
      );
 
      return {
        ...row,
        missingCount: missingCells.length,
        partialCount: partialCells.length,
        expiredCount: expiredCells.length,
        nonCompliantCount: nonCompliantCells.length,
        missingRegCodes: missingCells.map((c) => c.regulationCode),
        partialRegCodes: partialCells.map((c) => c.regulationCode),
        expiredRegCodes: expiredCells.map((c) => c.regulationCode),
        nonCompliantRegCodes: nonCompliantCells.map((c) => c.regulationCode),
        gapScore:
          missingCells.length * 3 +
          partialCells.length * 2 +
          expiredCells.length * 2 +
          nonCompliantCells.length * 5,
      };
    })
    .filter((row) => row.gapScore > 0)
    .sort((a, b) => b.gapScore - a.gapScore);

  // Regulation breakdown
  const regulationBreakdown = regulations.map((reg) => {
    let covered = 0;
    let partial = 0;
    let missing = 0;
    let expired = 0;
    let nonCompliant = 0;
    let nonCompliantFull = 0;
    let nonCompliantPartial = 0;
    let informational = 0;

    matrix.forEach((row) => {
      const cell = row.cells.find((c) => c.regulationCode === reg.code);
      const status = cell?.status || "missing";

      if (status === "covered") covered++;
      else if (status === "partial") partial++;
      else if (status === "expired") expired++;
      else if (status === "non_compliant") {
        nonCompliant++;
 if (cell?.nonComplianceTier === "full") nonCompliantFull++;
        else nonCompliantPartial++;
      } else if (status === "informational") informational++;
      else missing++;
    });

const total = totalSuppliers;

const coverageRate = total > 0 ? covered / total : 0;
const partialRate = total > 0 ? partial / total : 0;
const expiredRate = total > 0 ? expired / total : 0;
const nonCompliantRate = total > 0 ? nonCompliant / total : 0;
const missingRate = total > 0 ? missing / total : 0;

// Чем выше riskScore, тем хуже regulation.
// non_compliant даём самый большой вес.
const riskScore =
  nonCompliant * 5 +
  expired * 3 +
  partial * 2 +
  missing * 1;

return {
  code: reg.code,
  name: reg.name,

  covered,
  partial,
  missing,
  expired,
  informational,

  nonCompliant,
  nonCompliantFull,
  nonCompliantPartial,

  total,

  coverageRate,
  partialRate,
  expiredRate,
  nonCompliantRate,
  missingRate,

  riskScore,
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

  // Document age data
  const documentAgeData = [];
  const docSeen = new Set();
  suppliers.forEach((supplier) => {
    (supplier.assertions || []).forEach((assertion) => {
      const issueDate = assertion.document?.issueDate || assertion.validFrom;
      const docTitle = assertion.document?.title || "";
      const regCode = assertion.regulation?.code || "";
      const docKey = `${supplier.supplierCode}::${docTitle}::${regCode}`;
      if (docSeen.has(docKey)) return;
      docSeen.add(docKey);

      if (!issueDate) {
        documentAgeData.push({
          supplierName: supplier.supplierName,
          supplierCode: supplier.supplierCode,
          documentTitle: docTitle,
          regulationCode: regCode,
          ageDays: null,
          undated: true,
        });
        return;
      }
      const issueTime = new Date(issueDate).getTime();
      if (Number.isNaN(issueTime)) return;
      const ageDays = Math.floor((now - issueTime) / (24 * 60 * 60 * 1000));
      if (ageDays < 0) return;
      documentAgeData.push({
        supplierName: supplier.supplierName,
        supplierCode: supplier.supplierCode,
        documentTitle: docTitle,
        regulationCode: regCode,
        ageDays,
        undated: false,
      });
    });
  });
  documentAgeData.sort((a, b) => {
    if (a.undated && !b.undated) return -1;
    if (!a.undated && b.undated) return 1;
    return (b.ageDays || 0) - (a.ageDays || 0);
  });

  // --- allStatements: flat list for Statement Browser ---
  const allStatements = [];
  suppliers.forEach((supplier) => {
    (supplier.assertions || []).forEach((assertion) => {
      const issueDate = assertion.document?.issueDate || assertion.validFrom || null;
      const validUntil = assertion.document?.validUntil || assertion.validUntil || null;
      const issueTime = issueDate ? new Date(issueDate).getTime() : null;
      const ageDays = issueTime && !Number.isNaN(issueTime)
        ? Math.floor((now - issueTime) / 86400000)
        : null;
      allStatements.push({
        supplierName: supplier.supplierName || "Unknown",
        supplierCode: supplier.supplierCode || "",
        regCode: assertion.regulation?.code || "",
        regName: assertion.regulation?.name || "",
        docTitle: assertion.document?.title || "",
        issueDate,
        validUntil,
        ageDays,
        undated: ageDays === null,
        assertionType: assertion.assertionType || "",
        status: assertion.status || "",
      });
    });
  });
  allStatements.sort((a, b) => {
    if (a.undated && !b.undated) return 1;
    if (!a.undated && b.undated) return -1;
    return (b.ageDays || 0) - (a.ageDays || 0);
  });

  // --- supplierFreshness: per-supplier summary for Freshness Table ---
  const supplierFreshnessMap = new Map();
  suppliers.forEach((supplier) => {
    const key = supplier.supplierCode || supplier.supplierName;
    const assertions = Array.isArray(supplier.assertions) ? supplier.assertions : [];
    const stmts = assertions.map((assertion) => {
      const issueDate = assertion.document?.issueDate || assertion.validFrom || null;
      const validUntil = assertion.document?.validUntil || assertion.validUntil || null;
      const issueTime = issueDate ? new Date(issueDate).getTime() : null;
      const ageDays = issueTime && !Number.isNaN(issueTime)
        ? Math.floor((now - issueTime) / 86400000)
        : null;
      return {
        docTitle: assertion.document?.title || "",
        regCode: assertion.regulation?.code || "",
        regName: assertion.regulation?.name || "",
        issueDate,
        validUntil,
        ageDays,
        undated: ageDays === null,
        assertionType: assertion.assertionType || "",
        status: assertion.status || "",
      };
    });

    const dated = stmts.filter((s) => !s.undated);
    const newestAgeDays = dated.length ? Math.min(...dated.map((s) => s.ageDays)) : null;
    const oldestAgeDays = dated.length ? Math.max(...dated.map((s) => s.ageDays)) : null;
    const newestStmt = dated.length ? dated.find((s) => s.ageDays === newestAgeDays) : null;
    const oldestStmt = dated.length ? dated.find((s) => s.ageDays === oldestAgeDays) : null;

    let freshnessLevel = "no_data";
    if (newestAgeDays !== null) {
      if (newestAgeDays < 365) freshnessLevel = "fresh";
      else if (newestAgeDays < 730) freshnessLevel = "ok";
      else if (newestAgeDays < 1095) freshnessLevel = "aging";
      else freshnessLevel = "old";
    }

    supplierFreshnessMap.set(key, {
      supplierName: supplier.supplierName || "Unknown",
      supplierCode: supplier.supplierCode || "",
      supplierId: supplier.supplierId || "",
      statementCount: stmts.length,
      undatedCount: stmts.filter((s) => s.undated).length,
      newestAgeDays,
      oldestAgeDays,
      newestDate: newestStmt?.issueDate || null,
      oldestDate: oldestStmt?.issueDate || null,
      freshnessLevel,
      statements: stmts,
    });
  });
  const supplierFreshness = Array.from(supplierFreshnessMap.values());

  // --- cell freshness for matrix mode ---
  // Attach newestAgeDays per cell so the matrix can color by age
  const matrixWithFreshness = matrix.map((row) => {
    const sf = supplierFreshnessMap.get(row.supplierCode || row.supplierName);
    const cellsWithAge = row.cells.map((cell) => {
      const stmts = (sf?.statements || []).filter((s) => s.regCode === cell.regulationCode && !s.undated);
      const cellNewestAge = stmts.length ? Math.min(...stmts.map((s) => s.ageDays)) : null;
      return { ...cell, newestAgeDays: cellNewestAge };
    });
    return { ...row, cells: cellsWithAge };
  });

  return {
    suppliers,
    regulations,
    matrix: matrixWithFreshness,
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
    documentAgeData,
    allStatements,
    supplierFreshness,
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

  const currentCoverage = Math.round(stats.overallCoverageRate * 100);
  const coverageColor = stats.overallCoverageRate >= 0.8 ? "#16a34a" : stats.overallCoverageRate >= 0.5 ? "#ea580c" : "#dc2626";

  // Compute trend: compare current coverage with most recent previous snapshot
  const snapshots = currentCaseAnalysisState.complianceSnapshots || [];
  let trendEl = null;
  if (snapshots.length > 0) {
    const prev = snapshots[0];
    const delta = currentCoverage - (prev.coveragePercent || 0);
    if (delta !== 0) {
      const prevDate = prev.date ? new Date(prev.date).toLocaleDateString() : "previously";
      trendEl = document.createElement("span");
      trendEl.title = `Was ${prev.coveragePercent}% on ${prevDate}`;
      trendEl.textContent = delta > 0 ? ` ↑${delta}%` : ` ↓${Math.abs(delta)}%`;
      Object.assign(trendEl.style, {
        fontSize: "13px",
        fontWeight: "700",
        color: delta > 0 ? "#16a34a" : "#dc2626",
        marginLeft: "4px",
        verticalAlign: "middle",
      });
    }
  }

  const coverageCard = createAnalyticsStatCard(
    "Coverage Rate",
    `${currentCoverage}%`,
    `${stats.coveredCells} / ${stats.totalCells} cells`,
    coverageColor
  );

  if (trendEl) {
    // Append trend arrow next to the value element (second child of card)
    const valueEl = coverageCard.children[1];
    if (valueEl) valueEl.appendChild(trendEl);
  }

  wrapper.appendChild(coverageCard);

  return wrapper;
}

function getMatrixCellColor(status, tier) {
  switch (status) {
    case "covered":
      return { bg: "#dcfce7", text: "#166534", symbol: "✓" };
    case "partial":
      return { bg: "#fef3c7", text: "#92400e", symbol: "◐" };
    case "expired":
      return { bg: "#f3f4f6", text: "#6b7280", symbol: "⏱" };
    case "non_compliant":
      if (tier === "partial") return { bg: "#ffedd5", text: "#9a3412", symbol: "⚠" };
      return { bg: "#fee2e2", text: "#991b1b", symbol: "✗" };
    case "informational":
      return { bg: "#e0f2fe", text: "#075985", symbol: "i" };
    default:
      return { bg: "#f9fafb", text: "#d1d5db", symbol: "—" };
  }
}

function createSupplierDonutCard(row, selectedCodes) {
  const STATUS_COLORS = {
    covered: "#22c55e",
    partial: "#f59e0b",
    informational: "#38bdf8",
    expired: "#9ca3af",
    non_compliant: "#ef4444",
    missing: "#e5e7eb",
  };
  const STATUS_ORDER = ["non_compliant", "covered", "partial", "informational", "expired", "missing"];

  const isSelected = Array.isArray(selectedCodes) && selectedCodes.includes(row.supplierCode);
  const hasNonCompliant = row.cells.some((c) => c.status === "non_compliant");

  const card = document.createElement("div");
  Object.assign(card.style, {
    background: isSelected ? "#eff6ff" : "#ffffff",
    border: isSelected ? "2px solid #0176d3" : hasNonCompliant ? "1px solid #fca5a5" : "1px solid #d9dee7",
    borderRadius: "14px",
    padding: "14px 12px 10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    minWidth: "0",
    cursor: "pointer",
    position: "relative",
  });
  if (!isSelected && hasNonCompliant) card.style.background = "#fff8f8";

  // Selection indicator
  const selDot = document.createElement("div");
  Object.assign(selDot.style, {
    position: "absolute", top: "8px", right: "8px",
    width: "16px", height: "16px", borderRadius: "999px",
    border: isSelected ? "none" : "1.5px solid #d0d7de",
    background: isSelected ? "#0176d3" : "#ffffff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "10px", color: "#ffffff", fontWeight: "900",
    flexShrink: "0",
  });
  if (isSelected) selDot.textContent = "✓";
  card.appendChild(selDot);

  card.onclick = () => {
    const current = currentCaseAnalysisState.analyticsComparisonSelected || [];
    if (isSelected) {
      currentCaseAnalysisState.analyticsComparisonSelected = current.filter((c) => c !== row.supplierCode);
    } else if (current.length < 4) {
      currentCaseAnalysisState.analyticsComparisonSelected = [...current, row.supplierCode];
    }
    rerenderCurrentCaseToast();
  };

  // SVG donut
  const RADIUS = 38;
  const STROKE = 14;
  const SIZE = 100;
  const CX = 50;
  const CY = 50;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "90");
  svg.setAttribute("height", "90");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);

  // Background track
  const track = document.createElementNS(ns, "circle");
  track.setAttribute("cx", CX);
  track.setAttribute("cy", CY);
  track.setAttribute("r", RADIUS);
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "#f3f4f6");
  track.setAttribute("stroke-width", STROKE);
  svg.appendChild(track);

  // Count statuses
  const total = row.cells.length;
  const counts = {};
  row.cells.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });

  let offsetAngle = 0;
  STATUS_ORDER.forEach((status) => {
    const count = counts[status] || 0;
    if (!count) return;
    const segLen = (count / total) * CIRCUMFERENCE;
    const seg = document.createElementNS(ns, "circle");
    seg.setAttribute("cx", CX);
    seg.setAttribute("cy", CY);
    seg.setAttribute("r", RADIUS);
    seg.setAttribute("fill", "none");
    seg.setAttribute("stroke", STATUS_COLORS[status] || "#e5e7eb");
    seg.setAttribute("stroke-width", STROKE);
    seg.setAttribute("stroke-dasharray", `${segLen} ${CIRCUMFERENCE - segLen}`);
    seg.setAttribute("stroke-dashoffset", -offsetAngle);
    seg.setAttribute("transform", `rotate(-90 ${CX} ${CY})`);
    seg.setAttribute("stroke-linecap", "butt");
    svg.appendChild(seg);
    offsetAngle += segLen;
  });

  // Center percentage text
  const pct = Math.round(row.coverageRate * 100);
  const pctColor = pct >= 80 ? "#16a34a" : pct >= 50 ? "#92400e" : "#dc2626";

  const textPct = document.createElementNS(ns, "text");
  textPct.setAttribute("x", CX);
  textPct.setAttribute("y", CY + 6);
  textPct.setAttribute("text-anchor", "middle");
  textPct.setAttribute("font-size", "18");
  textPct.setAttribute("font-weight", "800");
  textPct.setAttribute("fill", pctColor);
  textPct.textContent = `${pct}%`;
  svg.appendChild(textPct);

  card.appendChild(svg);

  // Supplier name
  const name = document.createElement("div");
  Object.assign(name.style, {
    fontSize: "12px",
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    wordBreak: "break-word",
    lineHeight: "1.3",
    maxWidth: "120px",
  });
  name.textContent = row.supplierName;
  name.title = `${row.supplierName} (${row.supplierCode})`;
  card.appendChild(name);

  // Coverage counts row
  const countsRow = document.createElement("div");
  Object.assign(countsRow.style, {
    display: "flex",
    gap: "4px",
    flexWrap: "wrap",
    justifyContent: "center",
  });

  const addBadge = (count, color, bgColor, label) => {
    if (!count) return;
    const badge = document.createElement("span");
    Object.assign(badge.style, {
      padding: "2px 6px",
      borderRadius: "999px",
      fontSize: "10px",
      fontWeight: "700",
      background: bgColor,
      color: color,
      border: `1px solid ${color}33`,
    });
    badge.textContent = `${count} ${label}`;
    badge.title = `${count} ${label}`;
    countsRow.appendChild(badge);
  };

  addBadge(counts.covered || 0, "#166534", "#dcfce7", "✓");
  addBadge(counts.partial || 0, "#92400e", "#fef3c7", "◐");
  addBadge(counts.non_compliant || 0, "#991b1b", "#fee2e2", "✗");
  addBadge(counts.expired || 0, "#4b5563", "#f3f4f6", "⏱");
  addBadge(counts.missing || 0, "#6b7280", "#f9fafb", "—");

  card.appendChild(countsRow);

  return card;
}

function createSupplierCardsView(displayRows, regulations) {
  const wrapper = document.createElement("div");
  const selectedCodes = currentCaseAnalysisState.analyticsComparisonSelected || [];

  // Hint bar
  const hint = document.createElement("div");
  Object.assign(hint.style, {
    fontSize: "12px", color: "#6b7280", marginBottom: "10px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  });
  const hintText = document.createElement("span");
  hintText.textContent = selectedCodes.length === 0
    ? "Click cards to select up to 4 suppliers for comparison"
    : `${selectedCodes.length} selected — ${selectedCodes.length >= 2 ? "comparison shown below" : "select at least 2 to compare"}`;
  hintText.style.color = selectedCodes.length > 0 ? "#0176d3" : "#9ca3af";
  hintText.style.fontWeight = selectedCodes.length > 0 ? "600" : "400";
  hint.appendChild(hintText);

  if (selectedCodes.length > 0) {
    const clearAll = document.createElement("button");
    clearAll.type = "button";
    clearAll.textContent = "Clear selection";
    Object.assign(clearAll.style, {
      padding: "3px 8px", border: "1px solid #d0d7de", borderRadius: "6px",
      background: "#ffffff", color: "#374151", fontSize: "11px",
      fontWeight: "600", cursor: "pointer",
    });
    clearAll.onclick = () => {
      currentCaseAnalysisState.analyticsComparisonSelected = [];
      rerenderCurrentCaseToast();
    };
    hint.appendChild(clearAll);
  }
  wrapper.appendChild(hint);

  if (displayRows.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No suppliers match the current filter.";
    Object.assign(empty.style, {
      padding: "24px", textAlign: "center", color: "#6b7280", fontSize: "13px",
    });
    wrapper.appendChild(empty);
    return wrapper;
  }

  const grid = document.createElement("div");
  Object.assign(grid.style, {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: "10px",
  });

  displayRows.forEach((row) => {
    grid.appendChild(createSupplierDonutCard(row, selectedCodes));
  });
  wrapper.appendChild(grid);

  // Legend
  const legend = document.createElement("div");
  Object.assign(legend.style, {
    display: "flex", gap: "14px", marginTop: "12px", flexWrap: "wrap",
  });
  [
    { color: "#22c55e", label: "Covered" },
    { color: "#f59e0b", label: "Partial" },
    { color: "#ef4444", label: "Non-compliant" },
    { color: "#9ca3af", label: "Expired" },
    { color: "#38bdf8", label: "Informational" },
    { color: "#e5e7eb", label: "Missing" },
  ].forEach(({ color, label }) => {
    const item = document.createElement("div");
    Object.assign(item.style, {
      display: "flex", alignItems: "center", gap: "5px",
      fontSize: "12px", color: "#4b5563",
    });
    const dot = document.createElement("span");
    Object.assign(dot.style, {
      width: "10px", height: "10px", borderRadius: "999px",
      background: color, flexShrink: "0",
    });
    item.appendChild(dot);
    item.appendChild(document.createTextNode(label));
    legend.appendChild(item);
  });
  wrapper.appendChild(legend);

  // Comparison panel (2+ selected)
  if (selectedCodes.length >= 2) {
    const panel = createSupplierComparisonPanel(selectedCodes, displayRows, regulations);
    if (panel) wrapper.appendChild(panel);
  }

  return wrapper;
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
    marginBottom: "12px",
  });
  section.appendChild(subtitle);

  // === Controls bar: search + filter pills + CSV button ===
  const controlsBar = document.createElement("div");
  Object.assign(controlsBar.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "12px",
    flexWrap: "wrap",
  });

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Filter by supplier name...";
  searchInput.value = currentCaseAnalysisState.analyticsMatrixSearch || "";
  Object.assign(searchInput.style, {
    flex: "1",
    minWidth: "160px",
    padding: "7px 10px",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    fontSize: "13px",
  });
  searchInput.addEventListener("input", (e) => {
    currentCaseAnalysisState.analyticsMatrixSearch = e.target.value || "";
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") rerenderCurrentCaseToast();
  });
  controlsBar.appendChild(searchInput);

  const filterOptions = [
    { key: "all", label: "All" },
    { key: "gaps", label: "With Gaps" },
    { key: "non_compliant", label: "Non-Compliant" },
    { key: "expired", label: "Expired" },
  ];
  const currentFilter = currentCaseAnalysisState.analyticsMatrixFilter || "all";
  filterOptions.forEach(({ key, label }) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.textContent = label;
    const isActive = currentFilter === key;
    Object.assign(pill.style, {
      padding: "6px 12px",
      border: isActive ? "1px solid #0176d3" : "1px solid #d0d7de",
      borderRadius: "999px",
      background: isActive ? "#0176d3" : "#ffffff",
      color: isActive ? "#ffffff" : "#374151",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer",
      whiteSpace: "nowrap",
    });
    pill.onclick = () => {
      currentCaseAnalysisState.analyticsMatrixFilter = key;
      rerenderCurrentCaseToast();
    };
    controlsBar.appendChild(pill);
  });

  // Mode toggle: Status / Freshness
  const modeToggle = document.createElement("div");
  Object.assign(modeToggle.style, {
    display: "flex", border: "1px solid #d0d7de", borderRadius: "8px", overflow: "hidden", flexShrink: "0",
  });
  const currentMode = currentCaseAnalysisState.analyticsMatrixMode || "status";
  [{ key: "status", label: "Status" }, { key: "freshness", label: "Freshness" }].forEach(({ key, label }) => {
    const btn = document.createElement("button");
    btn.type = "button"; btn.textContent = label;
    const isActive = currentMode === key;
    Object.assign(btn.style, {
      padding: "6px 10px", border: "none", fontSize: "12px", fontWeight: "600",
      background: isActive ? "#0176d3" : "#ffffff",
      color: isActive ? "#ffffff" : "#374151", cursor: "pointer",
    });
    btn.onclick = () => { currentCaseAnalysisState.analyticsMatrixMode = key; rerenderCurrentCaseToast(); };
    modeToggle.appendChild(btn);
  });
  controlsBar.appendChild(modeToggle);

  // View toggle: Table / Cards
  const viewToggle = document.createElement("div");
  Object.assign(viewToggle.style, {
    display: "flex",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    overflow: "hidden",
    marginLeft: "auto",
    flexShrink: "0",
  });
  const currentView = currentCaseAnalysisState.analyticsMatrixView || "table";
  [{ key: "table", icon: "▤" }, { key: "cards", icon: "⬡" }].forEach(({ key, icon }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = key === "table" ? "Table view" : "Cards view";
    btn.textContent = icon;
    const isActive = currentView === key;
    Object.assign(btn.style, {
      padding: "6px 10px",
      border: "none",
      background: isActive ? "#0176d3" : "#ffffff",
      color: isActive ? "#ffffff" : "#374151",
      fontSize: "14px",
      cursor: "pointer",
    });
    btn.onclick = () => {
      currentCaseAnalysisState.analyticsMatrixView = key;
      rerenderCurrentCaseToast();
    };
    viewToggle.appendChild(btn);
  });
  controlsBar.appendChild(viewToggle);

  const exportBtnStyle = {
    padding: "6px 12px",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#374151",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const csvBtn = document.createElement("button");
  csvBtn.type = "button";
  csvBtn.textContent = "CSV";
  Object.assign(csvBtn.style, exportBtnStyle);
  controlsBar.appendChild(csvBtn);

  const xlsBtn = document.createElement("button");
  xlsBtn.type = "button";
  xlsBtn.textContent = "Excel";
  Object.assign(xlsBtn.style, { ...exportBtnStyle, color: "#166534", borderColor: "#86efac" });
  xlsBtn.title = "Export full report to Excel (4 sheets: matrix, suppliers, expiring docs, at-risk)";
  xlsBtn.onclick = () => {
    const lib = currentCaseAnalysisState.suppliersLibrary;
    if (!lib) { alert("No supplier data loaded yet."); return; }
    exportToExcel(buildAnalyticsData(lib));
  };
  controlsBar.appendChild(xlsBtn);

  const pdfBtn = document.createElement("button");
  pdfBtn.type = "button";
  pdfBtn.textContent = "PDF";
  Object.assign(pdfBtn.style, { ...exportBtnStyle, color: "#7c2d12", borderColor: "#fca5a5" });
  pdfBtn.title = "Open printable PDF report in a new tab";
  pdfBtn.onclick = () => {
    const lib = currentCaseAnalysisState.suppliersLibrary;
    if (!lib) { alert("No supplier data loaded yet."); return; }
    exportToPdf(buildAnalyticsData(lib), currentCaseAnalysisState.payload);
  };
  controlsBar.appendChild(pdfBtn);

  section.appendChild(controlsBar);

  if (!data.matrix.length || !data.regulations.length) {
    const empty = document.createElement("div");
    empty.textContent = "No data available for matrix view.";
    Object.assign(empty.style, { color: "#6b7280", fontSize: "14px" });
    section.appendChild(empty);
    return section;
  }

  // === Compute displayRows (filter + sort) ===
  let displayRows = [...data.matrix];

  const searchVal = (currentCaseAnalysisState.analyticsMatrixSearch || "").toLowerCase().trim();
  if (searchVal) {
    displayRows = displayRows.filter(
      (row) =>
        row.supplierName.toLowerCase().includes(searchVal) ||
        (row.supplierCode || "").toLowerCase().includes(searchVal)
    );
  }

  if (currentFilter === "gaps") {
    displayRows = displayRows.filter((row) => row.coveredCount < row.totalCount);
  } else if (currentFilter === "non_compliant") {
    displayRows = displayRows.filter((row) =>
      row.cells.some((c) => c.status === "non_compliant")
    );
  } else if (currentFilter === "expired") {
    displayRows = displayRows.filter((row) =>
      row.cells.some((c) => c.status === "expired")
    );
  }

  const sort = currentCaseAnalysisState.analyticsMatrixSort || { by: "coverageRate", dir: "asc" };
  const statusOrder = { non_compliant: 0, missing: 1, expired: 2, partial: 3, informational: 4, covered: 5 };

  displayRows.sort((a, b) => {
    let cmp = 0;
    if (sort.by === "name") {
      cmp = a.supplierName.localeCompare(b.supplierName);
    } else if (sort.by === "coverageRate") {
      cmp = a.coverageRate - b.coverageRate;
    } else {
      const cellA = a.cells.find((c) => c.regulationCode === sort.by);
      const cellB = b.cells.find((c) => c.regulationCode === sort.by);
      cmp = (statusOrder[cellA?.status || "missing"] ?? 1) - (statusOrder[cellB?.status || "missing"] ?? 1);
    }
    return sort.dir === "asc" ? cmp : -cmp;
  });

  // === CSV export (uses displayRows) ===
  csvBtn.onclick = () => {
    const headers = ["Supplier", ...data.regulations.map((r) => r.code), "Rate"];
    const rows = displayRows.map((row) => [
      `"${row.supplierName.replace(/"/g, '""')}"`,
      ...row.cells.map((c) => (c.status === "missing" ? "" : c.status)),
      `${Math.round(row.coverageRate * 100)}%`,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csv);
    a.download = "compliance_matrix.csv";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // === Cards view ===
  if (currentView === "cards") {
    section.appendChild(createSupplierCardsView(displayRows, data.regulations));
    return section;
  }

  // === Helper: make header cell sortable ===
  const makeSortableHeader = (cell, sortKey) => {
    const isActive = sort.by === sortKey;
    const arrow = isActive ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
    cell.textContent = cell.textContent + arrow;
    cell.style.cursor = "pointer";
    cell.title = (cell.title ? cell.title + " — " : "") + "Click to sort";
    cell.onmouseenter = () => { if (!isActive) cell.style.background = "#eef6ff"; };
    cell.onmouseleave = () => { cell.style.background = "#f8fafc"; };
    cell.onclick = () => {
      currentCaseAnalysisState.analyticsMatrixSort = {
        by: sortKey,
        dir: sort.by === sortKey && sort.dir === "asc" ? "desc" : "asc",
      };
      rerenderCurrentCaseToast();
    };
  };

  // === Build table ===
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
  makeSortableHeader(cornerCell, "name");
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
    makeSortableHeader(th, reg.code);
    headerRow.appendChild(th);
  });

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
  makeSortableHeader(rateHeader, "coverageRate");
  headerRow.appendChild(rateHeader);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  if (displayRows.length === 0) {
    const emptyRow = document.createElement("tr");
    const emptyTd = document.createElement("td");
    emptyTd.colSpan = data.regulations.length + 2;
    emptyTd.textContent = "No suppliers match the current filter.";
    Object.assign(emptyTd.style, {
      padding: "24px",
      textAlign: "center",
      color: "#6b7280",
      fontSize: "13px",
    });
    emptyRow.appendChild(emptyTd);
    tbody.appendChild(emptyRow);
  } else {
    displayRows.forEach((row, rowIdx) => {
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
        let colorInfo, tdTitle;
        if (currentMode === "freshness") {
          const age = cell.newestAgeDays;
          const level = age === null ? "no_data"
            : age < 365 ? "fresh"
            : age < 730 ? "ok"
            : age < 1095 ? "aging" : "old";
          const fc = freshnessColor(level);
          const symbol = age === null
            ? (cell.status === "missing" ? "—" : "?")
            : age < 365 ? "✓" : age < 730 ? "~" : age < 1095 ? "!" : "!!"
          colorInfo = { bg: fc.bg, text: fc.color, symbol };
          const ageStr = age !== null ? formatAge(age) : "no date";
          tdTitle = `${row.supplierName} — ${cell.regulationCode}\nNewest doc: ${ageStr}`;
        } else {
          colorInfo = getMatrixCellColor(cell.status, cell.nonComplianceTier);
          const humanScope = humanizeScopeSummary(cell.scopeSummary);
          const scopeLabel =
            cell.status === "covered" ? `Covered: ${humanScope}` :
            cell.status === "partial" ? `Partial: ${humanScope}` :
            cell.status === "non_compliant" && cell.nonComplianceTier === "full" ? `Non-compliant (all materials): ${humanScope}` :
            cell.status === "non_compliant" ? `Non-compliant (specific materials): ${humanScope}` :
            cell.status === "expired" ? `Expired: ${humanScope}` :
            cell.status === "informational" ? `Informational: ${humanScope}` :
            "Missing: no assertions";
          tdTitle = `${row.supplierName} — ${cell.regulationCode}\n${scopeLabel}`;
        }
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
        td.title = tdTitle;
        tr.appendChild(td);
      });

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
  }

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

  const statuses = currentMode === "freshness"
    ? [
        { status: "fresh",   label: "< 1 yr",  bg: freshnessColor("fresh").bg,   text: freshnessColor("fresh").color },
        { status: "ok",      label: "1–2 yr",  bg: freshnessColor("ok").bg,      text: freshnessColor("ok").color },
        { status: "aging",   label: "2–3 yr",  bg: freshnessColor("aging").bg,   text: freshnessColor("aging").color },
        { status: "old",     label: "3+ yr",   bg: freshnessColor("old").bg,     text: freshnessColor("old").color },
        { status: "no_data", label: "No date", bg: freshnessColor("no_data").bg, text: freshnessColor("no_data").color },
      ]
    : [
        { status: "covered",                        label: "Covered = all supplier items",              ...getMatrixCellColor("covered") },
        { status: "partial",                        label: "Partial = specific items / subset / family", ...getMatrixCellColor("partial") },
        { status: "expired",                        label: "Expired",                                    ...getMatrixCellColor("expired") },
        { status: "non_compliant", tier: "full",    label: "Non-compliant (all materials)",              ...getMatrixCellColor("non_compliant", "full") },
        { status: "non_compliant", tier: "partial", label: "Non-compliant (specific materials only)",    ...getMatrixCellColor("non_compliant", "partial") },
        { status: "informational",                  label: "Info only",                                  ...getMatrixCellColor("informational") },
        { status: "missing",                        label: "Missing = no assertions",                    ...getMatrixCellColor("missing") },
      ];

  statuses.forEach((item) => {
    const colorInfo = currentMode === "freshness"
      ? { bg: item.bg, text: item.text, symbol: "●" }
      : getMatrixCellColor(item.status, item.tier);
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
    marginBottom: "10px",
  });
  section.appendChild(subtitle);

  if (!data.regulationBreakdown.length) {
    const empty = document.createElement("div");
    empty.textContent = "No regulation data available.";
    Object.assign(empty.style, { color: "#6b7280", fontSize: "14px" });
    section.appendChild(empty);
    return section;
  }

  // Sort controls
  const sortBar = document.createElement("div");
  Object.assign(sortBar.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "12px",
  });

  const sortLabel = document.createElement("span");
  sortLabel.textContent = "Sort:";
  Object.assign(sortLabel.style, { fontSize: "12px", color: "#6b7280", fontWeight: "600" });
  sortBar.appendChild(sortLabel);

  const sortOptions = [
    { key: "coverage_asc", label: "Worst first" },
    { key: "coverage_desc", label: "Best first" },
    { key: "name", label: "Name A–Z" },
  ];
  const currentRegSort = currentCaseAnalysisState.analyticsRegSort || "coverage_asc";
  sortOptions.forEach(({ key, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    const isActive = currentRegSort === key;
    Object.assign(btn.style, {
      padding: "4px 10px",
      border: isActive ? "1px solid #0176d3" : "1px solid #d0d7de",
      borderRadius: "999px",
      background: isActive ? "#0176d3" : "#ffffff",
      color: isActive ? "#ffffff" : "#374151",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer",
    });
    btn.onclick = () => {
      currentCaseAnalysisState.analyticsRegSort = key;
      rerenderCurrentCaseToast();
    };
    sortBar.appendChild(btn);
  });
  section.appendChild(sortBar);

  const list = document.createElement("div");
  Object.assign(list.style, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });

  const sorted = [...data.regulationBreakdown].sort((a, b) => {
    if (currentRegSort === "coverage_desc") return b.coverageRate - a.coverageRate;
    if (currentRegSort === "name") return a.code.localeCompare(b.code);
    return a.coverageRate - b.coverageRate; // coverage_asc default
  });

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
      { count: reg.nonCompliantPartial, color: "#f87171" },
      { count: reg.nonCompliantFull, color: "#dc2626" },
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
      color:
  reg.nonCompliantFull > 0
    ? "#b91c1c"
    : reg.nonCompliantPartial > 0
      ? "#dc2626"
      : reg.coverageRate >= 0.8
        ? "#16a34a"
        : reg.coverageRate >= 0.5
          ? "#92400e"
          : "#dc2626",
    });
    numbers.textContent = `${reg.covered}/${reg.total} (${Math.round(reg.coverageRate * 100)}%)`;
    row.appendChild(numbers);

    list.appendChild(row);
  });

  section.appendChild(list);
   
  // Legend
const legend = document.createElement("div");
  Object.assign(legend.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px 20px",
    marginTop: "16px",
    padding: "10px 14px",
    background: "#f9fafb",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  });
 
  const legendItems = [
    { color: "#22c55e", label: "Covered" },
    { color: "#f59e0b", label: "Partial" },
    { color: "#38bdf8", label: "Informational" },
    { color: "#9ca3af", label: "Expired" },
    { color: "#f87171", label: "Non-compliant (some items)" },
    { color: "#dc2626", label: "Non-compliant (all items)" },
  ];
 
  legendItems.forEach(({ color, label }) => {
    const item = document.createElement("div");
    Object.assign(item.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "12px",
      color: "#374151",
    });
 
    const dot = document.createElement("span");
    Object.assign(dot.style, {
      width: "12px",
      height: "12px",
      borderRadius: "3px",
      background: color,
      flexShrink: "0",
    });
 
    item.appendChild(dot);
    item.appendChild(document.createTextNode(label));
    legend.appendChild(item);
  });
 
  section.appendChild(legend);
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

       const regulationNameByCode = new Map(
    (Array.isArray(data.regulations) ? data.regulations : []).map((reg) => [
      reg.code,
      reg.name || reg.code,
    ])
  );
 
  const expandedList = Array.isArray(currentCaseAnalysisState.atRiskExpanded)
    ? currentCaseAnalysisState.atRiskExpanded
    : [];

  topRisk.forEach((row, idx) => {
    const rowKey =
      row.supplierId || row.supplierCode || row.supplierName || "";
    const isExpanded = expandedList.indexOf(rowKey) >= 0;
 
    const group = document.createElement("div");
    Object.assign(group.style, {
      display: "flex",
      flexDirection: "column",
    });
    const card = document.createElement("div");
    Object.assign(card.style, {
      display: "flex",
      alignItems: "center",
      gap: "14px",
      padding: "12px 14px",
      background: "#ffffff",
      border: "1px solid #d9dee7",
      borderRadius: isExpanded ? "12px 12px 0 0" : "12px",
      borderBottom: isExpanded ? "1px solid #e5e7eb" : "1px solid #d9dee7",
      cursor: "pointer",
    });
 
    card.addEventListener("click", () => {
      const current = Array.isArray(currentCaseAnalysisState.atRiskExpanded)
        ? currentCaseAnalysisState.atRiskExpanded
        : [];
      const pos = current.indexOf(rowKey);
      if (pos >= 0) {
        current.splice(pos, 1);
      } else {
        current.push(rowKey);
      }
      currentCaseAnalysisState.atRiskExpanded = current;
      rerenderCurrentCaseToast();
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
    Object.assign(nameBlock.style, {
      flex: "1",
      cursor: row.supplierId ? "pointer" : "default",
    });
    if (row.supplierId) {
      nameBlock.title = `Open ${row.supplierName} in Library`;
    }

    const nameEl = document.createElement("div");
    Object.assign(nameEl.style, {
      fontWeight: "700",
      fontSize: "14px",
      color: row.supplierId ? "#0176d3" : "#111827",
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
    nameBlock.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!row.supplierId) return;
      suppliersSubTab = "library";
      currentCaseAnalysisState.selectedSupplierLibraryId = row.supplierId;
      rerenderCurrentCaseToast();
    });
 
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
    // Gap score chip with breakdown tooltip
    if (row.gapScore > 0) {
      const gapChip = document.createElement("span");
      Object.assign(gapChip.style, {
        padding: "3px 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: "700",
        background: "#eef2ff",
        color: "#3730a3",
        border: "1px solid #c7d2fe",
        flexShrink: "0",
      });
      gapChip.textContent = `Gap: ${row.gapScore}`;
      gapChip.title =
        "Gap score = missing×3 + partial×2 + expired×2 + non_compliant×5" +
        `\n          = ${row.missingCount}×3 + ${row.partialCount}×2 + ${row.expiredCount}×2 + ${row.nonCompliantCount}×5` +
        `\n          = ${row.gapScore}`;
      card.appendChild(gapChip);
    }
 
    // Expand chevron
    const chevron = document.createElement("div");
    Object.assign(chevron.style, {
      padding: "0 4px",
      color: "#6b7280",
      fontSize: "14px",
      userSelect: "none",
      flexShrink: "0",
    });
    chevron.textContent = isExpanded ? "▾" : "▸";
    card.appendChild(chevron);
 
    group.appendChild(card);
 
    // Inline expanded panel
    if (isExpanded) {
      const panel = document.createElement("div");
      Object.assign(panel.style, {
        background: "#f9fafb",
        border: "1px solid #d9dee7",
        borderTop: "none",
        borderRadius: "0 0 12px 12px",
        padding: "12px 14px 14px 50px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "12px",
      });
 
      const groupsConfig = [
        {
          label: "Non-compliant",
          codes: row.nonCompliantRegCodes,
          color: "#991b1b",
        },
        {
          label: "Expired",
          codes: row.expiredRegCodes,
          color: "#92400e",
        },
        {
          label: "Partial",
          codes: row.partialRegCodes,
          color: "#1f2937",
        },
        {
          label: "Missing",
          codes: row.missingRegCodes,
          color: "#4b5563",
        },
      ];
 
      let renderedGroups = 0;
      groupsConfig.forEach((cfg) => {
        const codes = Array.isArray(cfg.codes) ? cfg.codes : [];
        if (!codes.length) return;
 
        renderedGroups += 1;
 
        const col = document.createElement("div");
 
        const heading = document.createElement("div");
        Object.assign(heading.style, {
          fontSize: "11px",
          fontWeight: "800",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: cfg.color,
          marginBottom: "6px",
        });
        heading.textContent = `${cfg.label} (${codes.length})`;
        col.appendChild(heading);
 
        const itemList = document.createElement("div");
        Object.assign(itemList.style, {
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        });
 
        codes.forEach((code) => {
          const item = document.createElement("div");
          Object.assign(item.style, {
            fontSize: "12px",
            color: "#374151",
            lineHeight: "1.35",
          });
          const name = regulationNameByCode.get(code);
          item.textContent =
            name && name !== code ? `${code} — ${name}` : code;
          itemList.appendChild(item);
        });
 
        col.appendChild(itemList);
        panel.appendChild(col);
      });
 
      if (renderedGroups === 0) {
        const empty = document.createElement("div");
        Object.assign(empty.style, {
          fontSize: "12px",
          color: "#6b7280",
          fontStyle: "italic",
        });
        empty.textContent = "No regulation-level gaps to show.";
        panel.appendChild(empty);
      }
 
      group.appendChild(panel);
    }
 
    list.appendChild(group);
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

// ============================================================
// VARIANT 1 — Supplier Freshness Table
// ============================================================
function freshnessColor(level) {
  const map = {
    fresh:   { color: "#166534", bg: "#dcfce7", border: "#86efac" },
    ok:      { color: "#92400e", bg: "#fef3c7", border: "#fcd34d" },
    aging:   { color: "#c2410c", bg: "#ffedd5", border: "#fb923c" },
    old:     { color: "#991b1b", bg: "#fee2e2", border: "#fca5a5" },
    no_data: { color: "#4b5563", bg: "#f3f4f6", border: "#d1d5db" },
  };
  return map[level] || map.no_data;
}

function freshnessLabel(level) {
  return { fresh: "< 1 yr", ok: "1–2 yr", aging: "2–3 yr", old: "3+ yr", no_data: "No dates" }[level] || "—";
}

function formatAge(ageDays) {
  if (ageDays === null || ageDays === undefined) return "—";
  const yrs = Math.floor(ageDays / 365);
  const mos = Math.floor((ageDays % 365) / 30);
  if (yrs > 0) return `${yrs}y ${mos}m`;
  return `${mos}m`;
}

function createSupplierFreshnessTable(data) {
  const { supplierFreshness } = data;
  const state = currentCaseAnalysisState;

  const section = document.createElement("div");
  Object.assign(section.style, { marginBottom: "28px" });

  const hdr = document.createElement("div");
  hdr.textContent = "Supplier Freshness";
  Object.assign(hdr.style, { fontSize: "18px", fontWeight: "800", color: "#111827", marginBottom: "4px" });
  section.appendChild(hdr);

  const sub = document.createElement("div");
  sub.textContent = "How recent are each supplier's compliance statements — click a row to see details";
  Object.assign(sub.style, { fontSize: "13px", color: "#6b7280", marginBottom: "14px" });
  section.appendChild(sub);

  // Sort controls
  const sortBar = document.createElement("div");
  Object.assign(sortBar.style, { display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" });

  const sortOptions = [
    { key: "oldestDoc",  label: "Oldest doc" },
    { key: "newestDoc",  label: "Newest doc" },
    { key: "name",       label: "Name" },
    { key: "count",      label: "# Statements" },
  ];

  sortOptions.forEach(({ key, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isActive = state.freshnessSort.by === key;
    const dir = isActive ? state.freshnessSort.dir : null;
    btn.textContent = label + (dir === "asc" ? " ↑" : dir === "desc" ? " ↓" : "");
    Object.assign(btn.style, {
      padding: "5px 10px", fontSize: "12px", fontWeight: "600", cursor: "pointer",
      border: isActive ? "1px solid #0176d3" : "1px solid #d0d7de",
      borderRadius: "999px",
      background: isActive ? "#0176d3" : "#ffffff",
      color: isActive ? "#ffffff" : "#374151",
    });
    btn.onclick = () => {
      if (state.freshnessSort.by === key) {
        state.freshnessSort.dir = state.freshnessSort.dir === "asc" ? "desc" : "asc";
      } else {
        state.freshnessSort = { by: key, dir: "desc" };
      }
      rerenderCurrentCaseToast();
    };
    sortBar.appendChild(btn);
  });
  section.appendChild(sortBar);

  // Sort data
  const sorted = [...supplierFreshness].sort((a, b) => {
    const { by, dir } = state.freshnessSort;
    let cmp = 0;
    if (by === "oldestDoc") cmp = (b.oldestAgeDays ?? -1) - (a.oldestAgeDays ?? -1);
    else if (by === "newestDoc") cmp = (b.newestAgeDays ?? -1) - (a.newestAgeDays ?? -1);
    else if (by === "name") cmp = a.supplierName.localeCompare(b.supplierName);
    else if (by === "count") cmp = b.statementCount - a.statementCount;
    return dir === "asc" ? -cmp : cmp;
  });

  // Table header
  const table = document.createElement("div");
  Object.assign(table.style, { display: "flex", flexDirection: "column", gap: "4px" });

  const headerRow = document.createElement("div");
  Object.assign(headerRow.style, {
    display: "grid",
    gridTemplateColumns: "1fr 70px 100px 100px 60px 90px",
    gap: "8px", padding: "6px 12px",
    background: "#f8fafc", borderRadius: "8px",
    fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase",
  });
  ["Supplier", "Stmts", "Newest Doc", "Oldest Doc", "No Date", "Freshness"].forEach((h) => {
    const c = document.createElement("div");
    c.textContent = h;
    headerRow.appendChild(c);
  });
  table.appendChild(headerRow);

  sorted.forEach((sf) => {
    const isExpanded = state.freshnessExpanded.includes(sf.supplierCode || sf.supplierName);
    const fc = freshnessColor(sf.freshnessLevel);

    const wrapper = document.createElement("div");
    Object.assign(wrapper.style, { border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden" });

    // Main row
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "1fr 70px 100px 100px 60px 90px",
      gap: "8px", padding: "10px 12px",
      background: "#ffffff", cursor: "pointer", alignItems: "center",
    });
    row.onmouseenter = () => { row.style.background = "#f8fafc"; };
    row.onmouseleave = () => { row.style.background = "#ffffff"; };

    const nameCell = document.createElement("div");
    Object.assign(nameCell.style, { fontWeight: "700", fontSize: "13px", color: "#111827", display: "flex", alignItems: "center", gap: "6px" });
    const chevron = document.createElement("span");
    chevron.textContent = isExpanded ? "▾" : "▸";
    Object.assign(chevron.style, { color: "#9ca3af", fontSize: "11px", flexShrink: "0" });
    nameCell.appendChild(chevron);
    const nameText = document.createElement("span");
    nameText.textContent = sf.supplierName + (sf.supplierCode ? ` (${sf.supplierCode})` : "");
    Object.assign(nameText.style, { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    nameCell.appendChild(nameText);

    const countCell = document.createElement("div");
    Object.assign(countCell.style, { fontSize: "13px", color: "#374151", fontWeight: "600" });
    countCell.textContent = sf.statementCount;

    const newestCell = document.createElement("div");
    Object.assign(newestCell.style, { fontSize: "12px", color: "#374151" });
    newestCell.textContent = sf.newestDate ? `${sf.newestDate.slice(0, 10)} (${formatAge(sf.newestAgeDays)})` : "—";

    const oldestCell = document.createElement("div");
    Object.assign(oldestCell.style, { fontSize: "12px", color: "#374151" });
    oldestCell.textContent = sf.oldestDate ? `${sf.oldestDate.slice(0, 10)} (${formatAge(sf.oldestAgeDays)})` : "—";

    const undatedCell = document.createElement("div");
    Object.assign(undatedCell.style, { fontSize: "12px", color: sf.undatedCount > 0 ? "#6b7280" : "#374151" });
    undatedCell.textContent = sf.undatedCount > 0 ? `${sf.undatedCount}` : "—";

    const badge = document.createElement("div");
    badge.textContent = freshnessLabel(sf.freshnessLevel);
    Object.assign(badge.style, {
      display: "inline-block", padding: "3px 8px", borderRadius: "999px",
      fontSize: "11px", fontWeight: "700",
      background: fc.bg, color: fc.color, border: `1px solid ${fc.border}`,
      whiteSpace: "nowrap",
    });

    [nameCell, countCell, newestCell, oldestCell, undatedCell, badge].forEach((c) => row.appendChild(c));
    wrapper.appendChild(row);

    // Expandable detail
    const detail = document.createElement("div");
    Object.assign(detail.style, {
      display: isExpanded ? "block" : "none",
      borderTop: "1px solid #e5e7eb",
      background: "#fafafa",
    });

    if (isExpanded) {
      const stmtList = document.createElement("div");
      Object.assign(stmtList.style, { display: "flex", flexDirection: "column" });

      const stmtHeader = document.createElement("div");
      Object.assign(stmtHeader.style, {
        display: "grid", gridTemplateColumns: "1fr 80px 100px 100px 80px",
        gap: "8px", padding: "6px 16px",
        fontSize: "11px", fontWeight: "700", color: "#9ca3af", textTransform: "uppercase",
        borderBottom: "1px solid #e5e7eb",
      });
      ["Document", "Regulation", "Issue Date", "Valid Until", "Age"].forEach((h) => {
        const c = document.createElement("div"); c.textContent = h; stmtHeader.appendChild(c);
      });
      stmtList.appendChild(stmtHeader);

      sf.statements.forEach((stmt, i) => {
        const srow = document.createElement("div");
        Object.assign(srow.style, {
          display: "grid", gridTemplateColumns: "1fr 80px 100px 100px 80px",
          gap: "8px", padding: "8px 16px", alignItems: "center",
          background: i % 2 === 0 ? "#ffffff" : "#f8fafc",
          borderBottom: i < sf.statements.length - 1 ? "1px solid #f3f4f6" : "none",
        });

        const dTitle = document.createElement("div");
        Object.assign(dTitle.style, { fontSize: "12px", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
        dTitle.textContent = stmt.docTitle || "—";
        dTitle.title = stmt.docTitle || "";

        const dReg = document.createElement("div");
        Object.assign(dReg.style, { fontSize: "12px", color: "#4b5563", fontWeight: "600" });
        dReg.textContent = stmt.regCode || "—";

        const dIssue = document.createElement("div");
        Object.assign(dIssue.style, { fontSize: "12px", color: stmt.issueDate ? "#374151" : "#9ca3af" });
        dIssue.textContent = stmt.issueDate ? stmt.issueDate.slice(0, 10) : "—";

        const dValid = document.createElement("div");
        Object.assign(dValid.style, { fontSize: "12px", color: stmt.validUntil ? "#374151" : "#9ca3af" });
        dValid.textContent = stmt.validUntil ? stmt.validUntil.slice(0, 10) : "—";

        const dAge = document.createElement("div");
        const ageLevel = stmt.undated ? "no_data"
          : stmt.ageDays < 365 ? "fresh"
          : stmt.ageDays < 730 ? "ok"
          : stmt.ageDays < 1095 ? "aging" : "old";
        const afc = freshnessColor(ageLevel);
        dAge.textContent = stmt.undated ? "No date" : formatAge(stmt.ageDays);
        Object.assign(dAge.style, {
          fontSize: "11px", fontWeight: "700",
          color: afc.color, background: afc.bg,
          padding: "2px 7px", borderRadius: "999px", border: `1px solid ${afc.border}`,
          whiteSpace: "nowrap", display: "inline-block",
        });

        [dTitle, dReg, dIssue, dValid, dAge].forEach((c) => srow.appendChild(c));
        stmtList.appendChild(srow);
      });

      detail.appendChild(stmtList);
    }

    row.onclick = () => {
      const key = sf.supplierCode || sf.supplierName;
      const idx = state.freshnessExpanded.indexOf(key);
      if (idx >= 0) state.freshnessExpanded.splice(idx, 1);
      else state.freshnessExpanded.push(key);
      rerenderCurrentCaseToast();
    };

    wrapper.appendChild(detail);
    table.appendChild(wrapper);
  });

  section.appendChild(table);
  return section;
}

// ============================================================
// VARIANT 2 — Statement Browser
// ============================================================
function createStatementBrowser(data) {
  const { allStatements, supplierFreshness } = data;
  const state = currentCaseAnalysisState;

  const section = document.createElement("div");
  Object.assign(section.style, { marginBottom: "28px" });

  const hdr = document.createElement("div");
  hdr.textContent = "Statement Browser";
  Object.assign(hdr.style, { fontSize: "18px", fontWeight: "800", color: "#111827", marginBottom: "4px" });
  section.appendChild(hdr);

  const sub = document.createElement("div");
  sub.textContent = "Browse all statements across suppliers with filters by age, regulation, and supplier";
  Object.assign(sub.style, { fontSize: "13px", color: "#6b7280", marginBottom: "14px" });
  section.appendChild(sub);

  // Filter bar
  const filterBar = document.createElement("div");
  Object.assign(filterBar.style, { display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap", alignItems: "center" });

  // Supplier dropdown
  const supplierSel = document.createElement("select");
  Object.assign(supplierSel.style, {
    padding: "6px 10px", border: "1px solid #d0d7de", borderRadius: "8px", fontSize: "12px",
    background: "#ffffff", color: "#111827", cursor: "pointer",
  });
  const allSupplierOpt = document.createElement("option");
  allSupplierOpt.value = ""; allSupplierOpt.textContent = "All suppliers";
  supplierSel.appendChild(allSupplierOpt);
  [...new Set(allStatements.map((s) => s.supplierName))].sort().forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    if (state.stmtBrowserSupplier === name) opt.selected = true;
    supplierSel.appendChild(opt);
  });
  supplierSel.onchange = () => { state.stmtBrowserSupplier = supplierSel.value; rerenderCurrentCaseToast(); };
  filterBar.appendChild(supplierSel);

  // Regulation dropdown
  const regSel = document.createElement("select");
  Object.assign(regSel.style, {
    padding: "6px 10px", border: "1px solid #d0d7de", borderRadius: "8px", fontSize: "12px",
    background: "#ffffff", color: "#111827", cursor: "pointer",
  });
  const allRegOpt = document.createElement("option");
  allRegOpt.value = ""; allRegOpt.textContent = "All regulations";
  regSel.appendChild(allRegOpt);
  [...new Set(allStatements.map((s) => s.regCode).filter(Boolean))].sort().forEach((code) => {
    const opt = document.createElement("option");
    opt.value = code; opt.textContent = code;
    if (state.stmtBrowserReg === code) opt.selected = true;
    regSel.appendChild(opt);
  });
  regSel.onchange = () => { state.stmtBrowserReg = regSel.value; rerenderCurrentCaseToast(); };
  filterBar.appendChild(regSel);

  // Age pills
  const agePills = [
    { key: "all",     label: "All" },
    { key: "fresh",   label: "< 1 yr" },
    { key: "ok",      label: "1–2 yr" },
    { key: "aging",   label: "2–3 yr" },
    { key: "old",     label: "3+ yr" },
    { key: "undated", label: "No date" },
  ];
  agePills.forEach(({ key, label }) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.textContent = label;
    const isActive = (state.stmtBrowserAge || "all") === key;
    Object.assign(pill.style, {
      padding: "5px 10px", fontSize: "12px", fontWeight: "600", cursor: "pointer",
      border: isActive ? "1px solid #0176d3" : "1px solid #d0d7de",
      borderRadius: "999px",
      background: isActive ? "#0176d3" : "#ffffff",
      color: isActive ? "#ffffff" : "#374151",
      whiteSpace: "nowrap",
    });
    pill.onclick = () => { state.stmtBrowserAge = key; rerenderCurrentCaseToast(); };
    filterBar.appendChild(pill);
  });

  section.appendChild(filterBar);

  // Apply filters
  let filtered = allStatements;
  if (state.stmtBrowserSupplier) filtered = filtered.filter((s) => s.supplierName === state.stmtBrowserSupplier);
  if (state.stmtBrowserReg) filtered = filtered.filter((s) => s.regCode === state.stmtBrowserReg);
  const age = state.stmtBrowserAge || "all";
  if (age === "undated") filtered = filtered.filter((s) => s.undated);
  else if (age === "fresh")  filtered = filtered.filter((s) => !s.undated && s.ageDays < 365);
  else if (age === "ok")     filtered = filtered.filter((s) => !s.undated && s.ageDays >= 365 && s.ageDays < 730);
  else if (age === "aging")  filtered = filtered.filter((s) => !s.undated && s.ageDays >= 730 && s.ageDays < 1095);
  else if (age === "old")    filtered = filtered.filter((s) => !s.undated && s.ageDays >= 1095);

  const counter = document.createElement("div");
  Object.assign(counter.style, { fontSize: "12px", color: "#6b7280", marginBottom: "8px" });
  counter.textContent = `${filtered.length} statement${filtered.length !== 1 ? "s" : ""}`;
  section.appendChild(counter);

  if (!filtered.length) {
    const empty = document.createElement("div");
    Object.assign(empty.style, { padding: "20px", textAlign: "center", color: "#6b7280", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e5e7eb" });
    empty.textContent = "No statements match the current filters.";
    section.appendChild(empty);
    return section;
  }

  // List
  const list = document.createElement("div");
  Object.assign(list.style, { display: "flex", flexDirection: "column", gap: "4px" });

  filtered.forEach((stmt) => {
    const ageLevel = stmt.undated ? "no_data"
      : stmt.ageDays < 365 ? "fresh"
      : stmt.ageDays < 730 ? "ok"
      : stmt.ageDays < 1095 ? "aging" : "old";
    const fc = freshnessColor(ageLevel);

    const card = document.createElement("div");
    Object.assign(card.style, {
      display: "grid",
      gridTemplateColumns: "90px 1fr 90px 90px 90px 90px",
      gap: "10px", padding: "9px 14px", alignItems: "center",
      background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "8px",
      borderLeft: `4px solid ${fc.border}`,
    });

    const ageBadge = document.createElement("div");
    ageBadge.textContent = stmt.undated ? "No date" : formatAge(stmt.ageDays);
    Object.assign(ageBadge.style, {
      fontSize: "11px", fontWeight: "700",
      color: fc.color, background: fc.bg,
      padding: "2px 7px", borderRadius: "999px", border: `1px solid ${fc.border}`,
      textAlign: "center", whiteSpace: "nowrap",
    });

    const nameEl = document.createElement("div");
    Object.assign(nameEl.style, { minWidth: "0" });
    const nTop = document.createElement("div");
    Object.assign(nTop.style, { fontWeight: "700", fontSize: "12px", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    nTop.textContent = stmt.supplierName;
    nTop.title = stmt.supplierName;
    const nBot = document.createElement("div");
    Object.assign(nBot.style, { fontSize: "11px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    nBot.textContent = stmt.docTitle || "—";
    nBot.title = stmt.docTitle || "";
    nameEl.appendChild(nTop); nameEl.appendChild(nBot);

    const regEl = document.createElement("div");
    Object.assign(regEl.style, { fontSize: "12px", fontWeight: "700", color: "#0176d3" });
    regEl.textContent = stmt.regCode || "—";

    const issuedEl = document.createElement("div");
    Object.assign(issuedEl.style, { fontSize: "12px", color: stmt.issueDate ? "#374151" : "#9ca3af" });
    issuedEl.textContent = stmt.issueDate ? stmt.issueDate.slice(0, 10) : "—";

    const validEl = document.createElement("div");
    Object.assign(validEl.style, { fontSize: "12px", color: stmt.validUntil ? "#374151" : "#9ca3af" });
    validEl.textContent = stmt.validUntil ? stmt.validUntil.slice(0, 10) : "—";

    const typeEl = document.createElement("div");
    Object.assign(typeEl.style, { fontSize: "11px", color: "#6b7280" });
    typeEl.textContent = stmt.assertionType || "—";

    [ageBadge, nameEl, regEl, issuedEl, validEl, typeEl].forEach((c) => card.appendChild(c));
    list.appendChild(card);
  });

  section.appendChild(list);
  return section;
}

function createDocumentAgeSection(data) {
  const { documentAgeData } = data;
  const old = documentAgeData.filter((d) => !d.undated && d.ageDays >= 365);
  const undated = documentAgeData.filter((d) => d.undated);

  if (!old.length && !undated.length) return null;

  const section = document.createElement("div");
  Object.assign(section.style, { marginBottom: "28px" });

  const title = document.createElement("div");
  title.textContent = "Document Age Analysis";
  Object.assign(title.style, {
    fontSize: "18px", fontWeight: "800", color: "#111827", marginBottom: "4px",
  });
  section.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.textContent = "Documents older than 1 year or without issue date — may require renewal review";
  Object.assign(subtitle.style, {
    fontSize: "13px", color: "#6b7280", marginBottom: "14px",
  });
  section.appendChild(subtitle);

  // Age distribution buckets
  const buckets = [
    { label: "1–2 years", color: "#f59e0b", bg: "#fef3c7", items: old.filter((d) => d.ageDays < 730) },
    { label: "2–3 years", color: "#ea580c", bg: "#ffedd5", items: old.filter((d) => d.ageDays >= 730 && d.ageDays < 1095) },
    { label: "3+ years",  color: "#dc2626", bg: "#fee2e2", items: old.filter((d) => d.ageDays >= 1095) },
    { label: "No date",   color: "#6b7280", bg: "#f3f4f6", items: undated },
  ].filter((b) => b.items.length > 0);

  const maxCount = Math.max(...buckets.map((b) => b.items.length), 1);

  const distWrapper = document.createElement("div");
  Object.assign(distWrapper.style, {
    display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px",
  });

  buckets.forEach((bucket) => {
    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", alignItems: "center", gap: "10px" });

    const lbl = document.createElement("div");
    lbl.textContent = bucket.label;
    Object.assign(lbl.style, {
      width: "80px", fontSize: "12px", fontWeight: "600",
      color: bucket.color, flexShrink: "0",
    });
    row.appendChild(lbl);

    const barBg = document.createElement("div");
    Object.assign(barBg.style, {
      flex: "1", height: "20px", background: "#f3f4f6",
      borderRadius: "6px", overflow: "hidden",
    });
    const barFill = document.createElement("div");
    Object.assign(barFill.style, {
      width: `${(bucket.items.length / maxCount) * 100}%`,
      height: "100%", background: bucket.color, borderRadius: "6px",
      minWidth: "4px",
    });
    barBg.appendChild(barFill);
    row.appendChild(barBg);

    const cnt = document.createElement("div");
    cnt.textContent = `${bucket.items.length} doc${bucket.items.length !== 1 ? "s" : ""}`;
    Object.assign(cnt.style, {
      width: "60px", fontSize: "12px", fontWeight: "700",
      color: bucket.color, textAlign: "right", flexShrink: "0",
    });
    row.appendChild(cnt);
    distWrapper.appendChild(row);
  });
  section.appendChild(distWrapper);

  // Top oldest documents list
  const listItems = [...old].slice(0, 12);
  if (undated.length > 0) {
    undated.slice(0, 4).forEach((d) => listItems.push(d));
  }

  const list = document.createElement("div");
  Object.assign(list.style, {
    display: "flex", flexDirection: "column", gap: "6px",
  });

  listItems.forEach((doc) => {
    const card = document.createElement("div");
    Object.assign(card.style, {
      display: "flex", alignItems: "center", gap: "12px",
      padding: "10px 14px", background: "#ffffff",
      border: "1px solid #d9dee7", borderRadius: "10px",
    });

    // Age badge
    const ageBadge = document.createElement("div");
    let badgeColor = "#6b7280", badgeBg = "#f3f4f6";
    if (!doc.undated) {
      const yrs = doc.ageDays / 365;
      if (yrs >= 3) { badgeColor = "#dc2626"; badgeBg = "#fee2e2"; }
      else if (yrs >= 2) { badgeColor = "#ea580c"; badgeBg = "#ffedd5"; }
      else { badgeColor = "#92400e"; badgeBg = "#fef3c7"; }
    }
    Object.assign(ageBadge.style, {
      padding: "3px 8px", borderRadius: "999px", fontSize: "11px",
      fontWeight: "700", background: badgeBg, color: badgeColor,
      border: `1px solid ${badgeColor}44`, whiteSpace: "nowrap", flexShrink: "0",
    });
    ageBadge.textContent = doc.undated
      ? "No date"
      : doc.ageDays >= 365 ? `${Math.floor(doc.ageDays / 365)}y ${Math.floor((doc.ageDays % 365) / 30)}m`
      : `${Math.floor(doc.ageDays / 30)}m`;
    card.appendChild(ageBadge);

    // Info
    const info = document.createElement("div");
    info.style.flex = "1";
    info.style.minWidth = "0";

    const nameEl = document.createElement("div");
    Object.assign(nameEl.style, {
      fontWeight: "700", fontSize: "12px", color: "#111827",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    });
    nameEl.textContent = doc.supplierName + (doc.supplierCode ? ` (${doc.supplierCode})` : "");
    info.appendChild(nameEl);

    const docEl = document.createElement("div");
    Object.assign(docEl.style, {
      fontSize: "12px", color: "#6b7280",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    });
    docEl.textContent = [doc.documentTitle, doc.regulationCode].filter(Boolean).join(" · ") || "—";
    info.appendChild(docEl);

    card.appendChild(info);
    list.appendChild(card);
  });

  section.appendChild(list);
  return section;
}

function createSupplierComparisonPanel(selectedCodes, allRows, regulations) {
  const selectedRows = allRows.filter((r) => selectedCodes.includes(r.supplierCode));
  if (selectedRows.length < 2) return null;

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    marginTop: "20px",
    border: "1px solid #d9dee7",
    borderRadius: "14px",
    overflow: "hidden",
    background: "#ffffff",
  });

  // Header
  const header = document.createElement("div");
  Object.assign(header.style, {
    padding: "12px 16px",
    background: "#f8fafc",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  });
  const headerTitle = document.createElement("div");
  Object.assign(headerTitle.style, { fontWeight: "800", fontSize: "14px", color: "#111827" });
  headerTitle.textContent = `Comparing ${selectedRows.length} suppliers`;
  header.appendChild(headerTitle);

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "Clear selection";
  Object.assign(clearBtn.style, {
    padding: "4px 10px", border: "1px solid #d0d7de", borderRadius: "8px",
    background: "#ffffff", color: "#374151", fontSize: "12px",
    fontWeight: "600", cursor: "pointer",
  });
  clearBtn.onclick = () => {
    currentCaseAnalysisState.analyticsComparisonSelected = [];
    rerenderCurrentCaseToast();
  };
  header.appendChild(clearBtn);
  panel.appendChild(header);

  // Table
  const scrollWrapper = document.createElement("div");
  scrollWrapper.style.overflowX = "auto";

  const table = document.createElement("table");
  Object.assign(table.style, {
    width: "100%", borderCollapse: "collapse", fontSize: "12px",
    minWidth: `${180 + selectedRows.length * 120}px`,
  });

  // Header row
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const regTh = document.createElement("th");
  regTh.textContent = "Regulation";
  Object.assign(regTh.style, {
    position: "sticky", left: "0", zIndex: "2",
    background: "#f8fafc", padding: "10px 14px",
    textAlign: "left", fontWeight: "700",
    borderBottom: "2px solid #d9dee7", borderRight: "1px solid #e5e7eb",
    minWidth: "160px", fontSize: "12px", color: "#374151",
  });
  headerRow.appendChild(regTh);

  selectedRows.forEach((row) => {
    const th = document.createElement("th");
    th.textContent = row.supplierName;
    th.title = row.supplierCode;
    Object.assign(th.style, {
      padding: "10px 12px", textAlign: "center", fontWeight: "700",
      borderBottom: "2px solid #d9dee7", borderRight: "1px solid #f0f0f0",
      background: "#f8fafc", fontSize: "11px", color: "#374151",
      minWidth: "120px", maxWidth: "160px",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    });
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body: one row per regulation
  const tbody = document.createElement("tbody");

  regulations.forEach((reg, regIdx) => {
    const tr = document.createElement("tr");
    tr.style.background = regIdx % 2 === 0 ? "#ffffff" : "#fafbfc";

    const regTd = document.createElement("td");
    Object.assign(regTd.style, {
      position: "sticky", left: "0", zIndex: "1",
      background: regIdx % 2 === 0 ? "#ffffff" : "#fafbfc",
      padding: "8px 14px", borderBottom: "1px solid #f0f0f0",
      borderRight: "1px solid #e5e7eb", fontWeight: "600",
      fontSize: "12px", color: "#111827",
    });
    regTd.textContent = reg.code;
    regTd.title = reg.name;
    tr.appendChild(regTd);

    selectedRows.forEach((row) => {
      const cell = row.cells.find((c) => c.regulationCode === reg.code);
      const status = cell?.status || "missing";
      const colorInfo = getMatrixCellColor(status, cell?.nonComplianceTier);

      const td = document.createElement("td");
      Object.assign(td.style, {
        padding: "7px 8px", textAlign: "center",
        borderBottom: "1px solid #f0f0f0", borderRight: "1px solid #f0f0f0",
        background: colorInfo.bg,
      });

      const badge = document.createElement("span");
      Object.assign(badge.style, {
        display: "inline-block", padding: "2px 8px", borderRadius: "999px",
        fontSize: "11px", fontWeight: "700",
        color: colorInfo.text, background: colorInfo.bg,
      });
      const statusLabel = {
        covered: "Covered", partial: "Partial", expired: "Expired",
        non_compliant: "Non-compliant", informational: "Info", missing: "—",
      }[status] || status;
      badge.textContent = colorInfo.symbol + " " + statusLabel;
      td.appendChild(badge);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  // Summary row
  const summaryRow = document.createElement("tr");
  summaryRow.style.background = "#f8fafc";

  const summaryLabelTd = document.createElement("td");
  Object.assign(summaryLabelTd.style, {
    position: "sticky", left: "0", zIndex: "1",
    background: "#f8fafc", padding: "10px 14px",
    borderTop: "2px solid #d9dee7", fontWeight: "800",
    fontSize: "12px", color: "#374151",
  });
  summaryLabelTd.textContent = "Coverage Rate";
  summaryRow.appendChild(summaryLabelTd);

  selectedRows.forEach((row) => {
    const pct = Math.round(row.coverageRate * 100);
    const td = document.createElement("td");
    Object.assign(td.style, {
      padding: "10px 8px", textAlign: "center",
      borderTop: "2px solid #d9dee7", borderRight: "1px solid #f0f0f0",
      fontWeight: "800", fontSize: "14px",
      color: pct >= 80 ? "#16a34a" : pct >= 50 ? "#92400e" : "#dc2626",
    });
    td.textContent = `${pct}%`;
    summaryRow.appendChild(td);
  });

  tbody.appendChild(summaryRow);
  table.appendChild(tbody);
  scrollWrapper.appendChild(table);
  panel.appendChild(scrollWrapper);
  return panel;
}

function createNonCompliantSection(data) {
  const nonCompliantRows = data.matrix.filter((row) =>
    row.cells.some((c) => c.status === "non_compliant")
  );

  if (!nonCompliantRows.length) return null;

  // Rows where at least one NC cell covers all materials (tier === "full")
  const fullNCRows = nonCompliantRows.filter((row) =>
    row.cells.some((c) => c.status === "non_compliant" && c.nonComplianceTier === "full")
  );
  // Rows where NC cells cover only specific materials (all partial tier)
  const partialNCRows = nonCompliantRows.filter((row) =>
    !row.cells.some((c) => c.status === "non_compliant" && c.nonComplianceTier === "full")
  );

  const section = document.createElement("div");
  Object.assign(section.style, {
    marginBottom: "28px",
    padding: "16px 18px",
    background: "#fff5f5",
    border: "1px solid #fca5a5",
    borderRadius: "14px",
  });

  const countParts = [];
  if (fullNCRows.length) countParts.push(`${fullNCRows.length} fully`);
  if (partialNCRows.length) countParts.push(`${partialNCRows.length} partially`);
  const title = document.createElement("div");
  title.textContent = `Non-Compliant Suppliers (${nonCompliantRows.length}: ${countParts.join(", ")})`;
  Object.assign(title.style, {
    fontSize: "16px",
    fontWeight: "800",
    color: "#991b1b",
    marginBottom: "4px",
  });
  section.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.textContent = "Suppliers with active non-compliant assertions. ✗ = all materials affected, ⚠ = specific materials only.";
  Object.assign(subtitle.style, {
    fontSize: "13px",
    color: "#b91c1c",
    marginBottom: "14px",
  });
  section.appendChild(subtitle);

  function buildNCCellTag(cell) {
    const isFull = cell.nonComplianceTier === "full";
    const tag = document.createElement("div");
    Object.assign(tag.style, {
      display: "inline-flex",
      flexDirection: "column",
      gap: "2px",
      padding: "3px 8px",
      borderRadius: "8px",
      background: isFull ? "#fee2e2" : "#ffedd5",
      border: `1px solid ${isFull ? "#fca5a5" : "#fdba74"}`,
    });

    const topLine = document.createElement("div");
    Object.assign(topLine.style, {
      display: "flex",
      alignItems: "center",
      gap: "4px",
    });

    const badge = document.createElement("span");
    badge.textContent = isFull ? "✗" : "⚠";
    Object.assign(badge.style, {
      fontWeight: "900",
      fontSize: "11px",
      color: isFull ? "#991b1b" : "#9a3412",
    });
    topLine.appendChild(badge);

    const regCode = document.createElement("span");
    regCode.textContent = cell.regulationCode;
    Object.assign(regCode.style, {
      fontWeight: "700",
      fontSize: "11px",
      color: isFull ? "#991b1b" : "#9a3412",
    });
    topLine.appendChild(regCode);
    tag.appendChild(topLine);

    if (!isFull) {
      const ncAssertions = (cell.assertions || []).filter((a) => {
        if (String(a?.assertionType || "").toLowerCase() !== "non_compliant") return false;
        if (a?.status && a.status !== "active") return false;
        if (a?.validUntil && new Date(a.validUntil) < new Date()) return false;
        return true;
      });
      const scopeItems = [
        ...ncAssertions.flatMap((a) => a?.scope?.dwkItemNumbers || []),
        ...ncAssertions.flatMap((a) => a?.scope?.supplierPartNumbers || []),
        ...ncAssertions.flatMap((a) => a?.scope?.families || []),
      ].filter(Boolean);

      const scopeLine = document.createElement("div");
      Object.assign(scopeLine.style, {
        fontSize: "10px",
        color: "#92400e",
        fontStyle: "italic",
        maxWidth: "180px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      if (scopeItems.length) {
        const shown = scopeItems.slice(0, 3).join(", ");
        scopeLine.textContent = scopeItems.length > 3 ? `${shown} +${scopeItems.length - 3} more` : shown;
      } else {
        const humanScope = cell.scopeSummary && cell.scopeSummary !== "supplier_all"
          ? cell.scopeSummary.replace(/_/g, " ")
          : "specific materials";
        scopeLine.textContent = humanScope;
      }
      tag.appendChild(scopeLine);
    }

    return tag;
  }

  function buildSupplierCard(row, isFullGroup) {
    const card = document.createElement("div");
    Object.assign(card.style, {
      display: "flex",
      alignItems: "flex-start",
      gap: "12px",
      padding: "10px 14px",
      background: "#ffffff",
      border: `1px solid ${isFullGroup ? "#fca5a5" : "#fdba74"}`,
      borderRadius: "10px",
    });

    const icon = document.createElement("div");
    icon.textContent = isFullGroup ? "✗" : "⚠";
    Object.assign(icon.style, {
      width: "24px",
      height: "24px",
      borderRadius: "999px",
      background: isFullGroup ? "#fee2e2" : "#ffedd5",
      color: isFullGroup ? "#dc2626" : "#ea580c",
      fontWeight: "900",
      fontSize: "13px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
    });
    card.appendChild(icon);

    const info = document.createElement("div");
    info.style.flex = "1";

    const nameEl = document.createElement("div");
    Object.assign(nameEl.style, {
      fontWeight: "700",
      fontSize: "13px",
      color: "#111827",
      marginBottom: "6px",
    });
    nameEl.textContent = row.supplierName + (row.supplierCode ? ` (${row.supplierCode})` : "");
    info.appendChild(nameEl);

    const tagsEl = document.createElement("div");
    Object.assign(tagsEl.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
    });

    row.cells
      .filter((c) => c.status === "non_compliant")
      .forEach((cell) => tagsEl.appendChild(buildNCCellTag(cell)));

    info.appendChild(tagsEl);
    card.appendChild(info);
    return card;
  }

  if (fullNCRows.length) {
    if (partialNCRows.length) {
      const groupLabel = document.createElement("div");
      groupLabel.textContent = "Critical — non-compliant for all materials";
      Object.assign(groupLabel.style, {
        fontSize: "12px",
        fontWeight: "700",
        color: "#991b1b",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        marginBottom: "6px",
      });
      section.appendChild(groupLabel);
    }

    const list = document.createElement("div");
    Object.assign(list.style, { display: "flex", flexDirection: "column", gap: "8px" });
    fullNCRows.forEach((row) => list.appendChild(buildSupplierCard(row, true)));
    section.appendChild(list);
  }

  if (partialNCRows.length) {
    const groupLabel = document.createElement("div");
    groupLabel.textContent = "Warning — non-compliant for specific materials only";
    Object.assign(groupLabel.style, {
      fontSize: "12px",
      fontWeight: "700",
      color: "#9a3412",
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      marginTop: fullNCRows.length ? "14px" : "0",
      marginBottom: "6px",
    });
    section.appendChild(groupLabel);

    const list = document.createElement("div");
    Object.assign(list.style, { display: "flex", flexDirection: "column", gap: "8px" });
    partialNCRows.forEach((row) => list.appendChild(buildSupplierCard(row, false)));
    section.appendChild(list);
  }

  return section;
}

function createCollapsibleSection(key, title, contentFn) {
  const sections = currentCaseAnalysisState.analyticsExpandedSections;
  const isOpen = sections[key] === true;

  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    marginBottom: "12px",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    overflow: "hidden",
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    padding: "12px 16px",
    background: "#f9fafb",
    cursor: "pointer",
    userSelect: "none",
    borderBottom: isOpen ? "1px solid #e5e7eb" : "none",
  });

  const arrow = document.createElement("span");
  arrow.textContent = isOpen ? "▾" : "▸";
  Object.assign(arrow.style, {
    fontSize: "14px",
    color: "#6b7280",
    marginRight: "10px",
    flexShrink: "0",
    lineHeight: "1",
  });

  const titleEl = document.createElement("span");
  titleEl.textContent = title;
  Object.assign(titleEl.style, {
    fontSize: "13px",
    fontWeight: "700",
    color: "#111827",
    flex: "1",
  });

  header.appendChild(arrow);
  header.appendChild(titleEl);
  wrapper.appendChild(header);

  const body = document.createElement("div");
  body.style.display = isOpen ? "block" : "none";
  Object.assign(body.style, { padding: "16px" });

  // Lazy render: only build DOM when section is first opened
  let rendered = false;
  function renderBody() {
    if (rendered) return;
    rendered = true;
    try {
      const content = contentFn();
      if (content) body.appendChild(content);
    } catch (e) {
      console.error(`[Analytics collapsible] Error rendering "${title}":`, e);
      const err = document.createElement("div");
      Object.assign(err.style, { padding: "10px", color: "#b42318", fontSize: "12px" });
      err.textContent = `Failed to render: ${e.message}`;
      body.appendChild(err);
    }
  }

  if (isOpen) renderBody();

  header.addEventListener("click", () => {
    const nowOpen = body.style.display === "none";
    body.style.display = nowOpen ? "block" : "none";
    arrow.textContent = nowOpen ? "▾" : "▸";
    header.style.borderBottom = nowOpen ? "1px solid #e5e7eb" : "none";
    sections[key] = nowOpen;
    if (nowOpen) renderBody();
  });

  wrapper.appendChild(body);
  return wrapper;
}

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

  function safeAppend(fn, label) {
    try {
      const el = fn();
      if (el) wrapper.appendChild(el);
    } catch (e) {
      console.error(`[Analytics] Error rendering "${label}":`, e);
      const err = document.createElement("div");
      Object.assign(err.style, { padding: "10px 14px", color: "#b42318", fontSize: "12px", background: "#fff5f5", borderRadius: "8px", marginBottom: "12px" });
      err.textContent = `⚠ Failed to render "${label}": ${e.message}`;
      wrapper.appendChild(err);
    }
  }

  safeAppend(() => createAnalyticsStatsBar(data.stats), "Stats");

  const nonCompliantCount = data.matrix.filter((r) => r.cells.some((c) => c.status === "non_compliant")).length;
  const atRiskCount = data.atRisk.length;
  const expiringSoonCount = data.expiringSoon.length;

  if (nonCompliantCount > 0) {
    safeAppend(() => createCollapsibleSection("nonCompliant", `Non-Compliant Suppliers (${nonCompliantCount})`, () => createNonCompliantSection(data)), "Non-compliant");
  }
  if (atRiskCount > 0) {
    safeAppend(() => createCollapsibleSection("atRisk", `At-Risk Certifications (${atRiskCount})`, () => createAtRiskSection(data)), "At Risk");
  }
  if (expiringSoonCount > 0) {
    safeAppend(() => createCollapsibleSection("expiringSoon", `Expiring Soon (${expiringSoonCount})`, () => createExpiringSoonSection(data)), "Expiring Soon");
  }

  safeAppend(() => createCollapsibleSection("complianceMatrix", `Compliance Matrix (${data.matrix.length} suppliers × ${data.regulations.length} regulations)`, () => createComplianceMatrix(data)), "Compliance Matrix");
  safeAppend(() => createCollapsibleSection("supplierFreshness", `Supplier Freshness (${data.supplierFreshness.length} suppliers)`, () => createSupplierFreshnessTable(data)), "Supplier Freshness");
  safeAppend(() => createCollapsibleSection("statementBrowser", `Statement Browser (${data.allStatements.length} statements)`, () => createStatementBrowser(data)), "Statement Browser");
  safeAppend(() => createCollapsibleSection("regulationBreakdown", `Regulation Breakdown (${data.regulationBreakdown.length} regulations)`, () => createRegulationBreakdownSection(data)), "Regulation Breakdown");

  return wrapper;
}

async function bootstrap() {
  ensureLauncherVisible();

  // Intercept Salesforce SPA navigation — Lightning uses history.pushState()
  // which doesn't fire popstate, so we wrap it to catch route changes reliably.
  const _origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    _origPushState(...args);
    handlePotentialRouteChange();
  };

  const isAuthenticated = await syncAuthState();

  if (isAuthenticated && isCaseRecordPage()) {
    scheduleChecks();
  }
}

bootstrap();

let _routeChangeTimeout;
const observer = new MutationObserver(() => {
  clearTimeout(_routeChangeTimeout);
  _routeChangeTimeout = setTimeout(handlePotentialRouteChange, 300);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

window.addEventListener("popstate", handlePotentialRouteChange);
window.addEventListener("hashchange", handlePotentialRouteChange);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPEN_PANEL") {
    wasPanelOpen = true;
    const card = getOrCreateAuthCard();
    card.style.display = "block";
    syncAuthCardUi();
  }
});