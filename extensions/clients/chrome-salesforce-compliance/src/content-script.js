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
};

let activeCaseRequestToken = 0;
let lastCompletedRecordId = null;

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
  width: "720px",
  maxWidth: "calc(100vw - 32px)",
  maxHeight: "78vh",
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

  header.appendChild(title);
  header.appendChild(closeBtn);

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

const lookupTab = document.createElement("button");
lookupTab.type = "button";
lookupTab.id = "sf-compliance-tab-lookup";
lookupTab.textContent = "Lookup";

[overviewTab, materialsTab, lookupTab].forEach((btn) => {
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
  padding: "16px 18px 20px 18px",
  overflowY: "auto",
  flex: "1",
  background: "#ffffff",
});

tabs.appendChild(overviewTab);
tabs.appendChild(materialsTab);
tabs.appendChild(lookupTab);

toast.appendChild(header);
toast.appendChild(tabs);
toast.appendChild(body);

hideLauncher();
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

function createCoverageSection(supplierLookup) {
  const coverage = supplierLookup?.coverage;
  const regulations = Array.isArray(coverage?.regulations) ? coverage.regulations : [];

  if (!coverage || regulations.length === 0) {
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "16px";
  wrapper.style.paddingTop = "0";

  const title = document.createElement("div");
  title.textContent = "Compliance";
  Object.assign(title.style, {
    fontSize: "18px",
    fontWeight: "700",
    marginBottom: "12px",
    color: "#111827",
  });
  wrapper.appendChild(title);

  regulations.forEach((regItem) => {
    const row = document.createElement("div");
    Object.assign(row.style, {
      background: "#ffffff",
      border: "1px solid #d9dee7",
      borderRadius: "14px",
      padding: "16px 18px",
      marginTop: "10px",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "12px",
      marginBottom: "12px",
    });

    const regName = document.createElement("div");
    regName.textContent =
      regItem?.regulation?.name || regItem?.regulation?.code || "Unknown regulation";

    Object.assign(regName.style, {
      fontSize: "18px",
      fontWeight: "700",
      color: "#111827",
      lineHeight: "1.3",
    });

    const badge = createCoverageBadge(regItem?.overallStatus || "missing");
    Object.assign(badge.style, {
      padding: "8px 16px",
      fontSize: "14px",
      fontWeight: "700",
      borderRadius: "999px",
      alignSelf: "flex-start",
    });

    header.appendChild(regName);
    header.appendChild(badge);
    row.appendChild(header);

    const coveredSuppliers = Array.isArray(regItem?.coveredSuppliers)
      ? regItem.coveredSuppliers
      : [];
    const missingSuppliers = Array.isArray(regItem?.missingSuppliers)
      ? regItem.missingSuppliers
      : [];
    const partialSuppliers = Array.isArray(regItem?.partialSuppliers)
      ? regItem.partialSuppliers
      : [];
    const nonCompliantSuppliers = Array.isArray(regItem?.nonCompliantSuppliers)
      ? regItem.nonCompliantSuppliers
      : [];
    const expiredSuppliers = Array.isArray(regItem?.expiredSuppliers)
      ? regItem.expiredSuppliers
      : [];

    const primarySuppliers =
      coveredSuppliers.length > 0
        ? coveredSuppliers
        : partialSuppliers.length > 0
        ? partialSuppliers
        : missingSuppliers.length > 0
        ? missingSuppliers
        : nonCompliantSuppliers.length > 0
        ? nonCompliantSuppliers
        : expiredSuppliers;

    if (primarySuppliers.length > 0) {
      const suppliersLine = document.createElement("div");
      suppliersLine.innerHTML = `<strong>Suppliers:</strong> ${primarySuppliers.join(", ")}`;
      Object.assign(suppliersLine.style, {
        fontSize: "15px",
        color: "#111827",
        marginBottom: "10px",
      });
      row.appendChild(suppliersLine);
    }

    const bestAssertions = (Array.isArray(regItem?.supplierResults) ? regItem.supplierResults : [])
      .map((supplierResult) => ({
        supplierName: supplierResult?.supplierName || "Unknown supplier",
        bestAssertion: supplierResult?.bestAssertion || null,
      }))
      .filter((entry) => entry.bestAssertion);

    if (bestAssertions.length > 0) {
      bestAssertions.forEach((entry) => {
        const evidenceLine = document.createElement("div");
        const documentTitle =
          entry.bestAssertion?.document?.title ||
          entry.bestAssertion?.document?.fileName ||
          "Document";

        evidenceLine.textContent = `${entry.supplierName}: ${entry.bestAssertion.assertionType} — ${documentTitle}`;

        Object.assign(evidenceLine.style, {
          fontSize: "14px",
          color: "#374151",
          lineHeight: "1.45",
          marginTop: "4px",
        });

        row.appendChild(evidenceLine);
      });
    }

    if (!bestAssertions.length && missingSuppliers.length) {
      const missingLine = document.createElement("div");
      missingLine.textContent = `Missing confirmation from: ${missingSuppliers.join(", ")}`;
      Object.assign(missingLine.style, {
        fontSize: "14px",
        color: "#6b7280",
        lineHeight: "1.45",
      });
      row.appendChild(missingLine);
    }

    wrapper.appendChild(row);
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
  } else if (tabName === "lookup") {
    activeCaseToastTab = "lookup";
  } else {
    activeCaseToastTab = "overview";
  }

  const overviewBtn = document.getElementById("sf-compliance-tab-overview");
  const materialsBtn = document.getElementById("sf-compliance-tab-materials");
  const lookupBtn = document.getElementById("sf-compliance-tab-lookup");

  const applyActive = (btn, isActive) => {
    if (!btn) return;
    btn.style.background = isActive ? "#0176d3" : "#ffffff";
    btn.style.color = isActive ? "#ffffff" : "#111111";
    btn.style.borderColor = isActive ? "#0176d3" : "#d0d7de";
  };

  applyActive(overviewBtn, activeCaseToastTab === "overview");
  applyActive(materialsBtn, activeCaseToastTab === "materials");
  applyActive(lookupBtn, activeCaseToastTab === "lookup");
}

function wireCaseToastTabs(renderFn) {
  const overviewBtn = document.getElementById("sf-compliance-tab-overview");
  const materialsBtn = document.getElementById("sf-compliance-tab-materials");
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
    marginTop: "16px",
    padding: "22px",
    border: "1px solid #d9dee7",
    borderRadius: "24px",
    background: "#f7f8fb",
  });

  const part = materialItem?.part_number || "N/A";
  const desc = materialItem?.description || "";

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

  if (currentCaseAnalysisState.editingMaterialIndex === materialIndex) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = part;

    Object.assign(input.style, {
      width: "100%",
      boxSizing: "border-box",
      padding: "10px 12px",
      border: "1px solid #cfd6e4",
      borderRadius: "12px",
      fontSize: "16px",
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
        borderRadius: "12px",
        padding: "10px 14px",
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
      fontSize: "30px",
      fontWeight: "800",
      lineHeight: "1.15",
      color: "#111827",
      marginBottom: desc ? "8px" : "0",
      letterSpacing: "-0.02em",
    });

    left.appendChild(title);

    if (desc) {
      const descLine = document.createElement("div");
      descLine.textContent = desc;
      Object.assign(descLine.style, {
        fontSize: "14px",
        color: "#4b5563",
        lineHeight: "1.45",
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
        borderRadius: "16px",
        padding: "12px 18px",
        cursor: "pointer",
        background: "#ffffff",
        fontWeight: "700",
        fontSize: "14px",
        minWidth: "86px",
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
      fontSize: "14px",
      marginTop: "8px",
    });
    wrapper.appendChild(notFound);
    return wrapper;
  }

  if (supplierLookup.matchType) {
    const matchTypeLine = document.createElement("div");
    matchTypeLine.textContent = `Matched by: ${supplierLookup.matchType}`;
    Object.assign(matchTypeLine.style, {
      fontSize: "14px",
      color: "#6b7280",
      marginBottom: "16px",
    });
    wrapper.appendChild(matchTypeLine);
  }

  const divider = document.createElement("div");
  Object.assign(divider.style, {
    height: "1px",
    background: "#dde3ee",
    marginBottom: "12px",
  });
  wrapper.appendChild(divider);

  const visibleComponents = Array.isArray(supplierLookup.components)
    ? supplierLookup.components.filter((item) => !item?.isPackaging)
    : [];

  const stats = document.createElement("div");
  Object.assign(stats.style, {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
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

  stats.appendChild(createStat("Suppliers", supplierLookup.supplierCount || 0, true));
  stats.appendChild(createStat("Components", visibleComponents.length, false));
  wrapper.appendChild(stats);

  const coverageSection = createCoverageSection(supplierLookup);
  if (coverageSection) {
    wrapper.appendChild(coverageSection);
  }

  const bomSection = createBomSection(supplierLookup);
  wrapper.appendChild(bomSection);

  return wrapper;
}

function createBomSection(supplierLookup) {
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "18px";

  const title = document.createElement("div");
  title.textContent = "BOM Structure";
  Object.assign(title.style, {
    fontSize: "18px",
    fontWeight: "700",
    color: "#111827",
    marginBottom: "12px",
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
      fontSize: "14px",
    });
    wrapper.appendChild(empty);
    return wrapper;
  }

  allComponents.forEach((componentItem) => {
    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "#ffffff",
      border: "1px solid #d9dee7",
      borderRadius: "16px",
      padding: "18px 18px 16px 18px",
      marginTop: "10px",
    });

    const componentTitle = document.createElement("div");
    const componentNumber = componentItem?.component || "No component number";
    componentTitle.textContent = componentNumber;

    Object.assign(componentTitle.style, {
      fontSize: "16px",
      fontWeight: "700",
      color: "#111827",
      marginBottom: "10px",
    });
    card.appendChild(componentTitle);

    const componentDesc = Array.isArray(componentItem?.descriptions)
      ? componentItem.descriptions.join("; ")
      : "";

    if (componentDesc) {
      const desc = document.createElement("div");
      desc.textContent = componentDesc;
      Object.assign(desc.style, {
        fontSize: "14px",
        color: "#111827",
        lineHeight: "1.5",
        marginBottom: "10px",
      });
      card.appendChild(desc);
    }

    if (Array.isArray(componentItem?.suppliers) && componentItem.suppliers.length > 0) {
      const supplierLine = document.createElement("div");
      supplierLine.textContent = `Supplier: ${componentItem.suppliers.join(", ")}`;
      Object.assign(supplierLine.style, {
        fontSize: "14px",
        color: "#374151",
        lineHeight: "1.45",
        marginBottom: "6px",
      });
      card.appendChild(supplierLine);
    }

    if (
      Array.isArray(componentItem?.vendorMaterialNumbers) &&
      componentItem.vendorMaterialNumbers.length > 0
    ) {
      const vendorLine = document.createElement("div");
      vendorLine.textContent = `Vendor Material Number: ${componentItem.vendorMaterialNumbers.join(", ")}`;
      Object.assign(vendorLine.style, {
        fontSize: "14px",
        color: "#374151",
        lineHeight: "1.45",
      });
      card.appendChild(vendorLine);
    }

    wrapper.appendChild(card);
  });

  return wrapper;
}

function createMaterialOverviewCard(materialItem, supplierLookup) {
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "8px";
  wrapper.style.padding = "8px 10px";
  wrapper.style.border = "1px solid #d8dee4";
  wrapper.style.borderRadius = "10px";
  wrapper.style.background = "#f6f8fa";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.marginBottom = "4px";
  title.textContent = materialItem?.part_number || "N/A";
  wrapper.appendChild(title);

  const desc = materialItem?.description || "";
  if (desc) {
    const descLine = document.createElement("div");
    descLine.style.color = "#555";
    descLine.style.marginBottom = "6px";
    descLine.textContent = desc;
    wrapper.appendChild(descLine);
  }

  if (!supplierLookup || !supplierLookup.found) {
    const line = document.createElement("div");
    line.style.color = "#666";
    line.textContent = "No supplier data found.";
    wrapper.appendChild(line);
    return wrapper;
  }

  const previewSupplier =
    Array.isArray(supplierLookup.suppliers) && supplierLookup.suppliers.length > 0
      ? supplierLookup.suppliers[0]
      : "N/A";

const visibleComponents = Array.isArray(supplierLookup?.components)
  ? supplierLookup.components.filter((item) => !item?.isPackaging)
  : [];

const meta = document.createElement("div");
meta.textContent =
  `Suppliers: ${supplierLookup.supplierCount || 0} | Components: ${visibleComponents.length}`;
wrapper.appendChild(meta);

  const preview = document.createElement("div");
  preview.style.marginTop = "4px";
  preview.style.color = "#555";
  preview.textContent = `Preview: ${previewSupplier}`;
  wrapper.appendChild(preview);

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
    createMaterialSupplierCard(materialItem, supplierLookup, materialIndex)
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

        const materialsLabel = document.createElement("strong");
        materialsLabel.textContent = "Materials:";
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