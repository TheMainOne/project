import {
  DomMessageSheetContextAdapter,
  PasteRowSheetContextAdapter,
  enforceReadinessGuard,
  formatStatusAliasLines,
  parseSingleTsvRow,
  parseStatusAliasLines,
  profileCanonicalFields,
  suggestProfileBindings,
} from "../src/sheet-context-adapter.js";

const I18N = {
  en: {
    readOnly: "Read-only pilot · no Smartsheet or SAP changes",
    signInKicker: "SECURE ACCESS",
    signIn: "Sign in",
    signInHelp: "Use an account with the ecn_user role.",
    password: "Password",
    selectedRowKicker: "SHEET CONTEXT",
    selectedRow: "Selected row",
    domMode: "Current row",
    pasteMode: "Paste row",
    domHelp: "Click a cell in Smartsheet, then capture. Scroll horizontally by hand to collect more columns.",
    capture: "Capture selected row",
    pasteLabel: "TSV row",
    pastePlaceholder: "Paste one tab-separated row",
    validatePaste: "Validate pasted row",
    noCapture: "No row captured yet.",
    viewCapturedFields: "View captured fields",
    classificationKicker: "ROUTING INPUT",
    changeTypes: "Change types",
    typeHelp: "Optional before analysis. Select one or more when classification is uncertain.",
    analyze: "Analyze ECN",
    assessmentKicker: "DETERMINISTIC ASSESSMENT",
    gates: "Gates & findings",
    routingKicker: "PEOPLE & HANDOFFS",
    routing: "Routing",
    workKicker: "IMPLEMENTATION",
    tasks: "SAP / document checklist",
    nextActionKicker: "RECOMMENDED",
    nextAction: "Next step",
    draftsKicker: "COPY-READY TEXT",
    drafts: "Drafts",
    draftMissingInformation: "Missing information request",
    draftApprovalComment: "Approval comment",
    draftImplementationHandoff: "Implementation handoff",
    draftReviewerRequest: "Reviewer request",
    draftClosureSummary: "Closure summary",
    sourcesKicker: "TRACEABILITY",
    citations: "Sources",
    profileAndDiagnostics: "Sheet profile & diagnostics",
    headerRow: "Header row (TSV)",
    headerPlaceholder: "Paste the exported header row",
    mapHeaders: "Map headers",
    confirmProfile: "I verified the order and canonical mappings.",
    saveProfile: "Confirm & save profile",
    copyDiagnostics: "Copy selector diagnostics (no values)",
    signOut: "Sign out",
    working: "Working…",
    captureComplete: "Complete",
    capturePartial: "Partial",
    captureAmbiguous: "Ambiguous",
    profileReady: "Profile ready",
    profileNeedsRemap: "Needs remap",
    columnsCaptured: "{captured} of {expected} columns captured",
    missingColumns: "Missing columns: {value}",
    guardIncomplete: "Final readiness and closure are disabled until the row capture and sheet profile are complete.",
    noActiveRow: "Select a Smartsheet cell first.",
    captureFailed: "Could not capture the row.",
    pasteExact: "{actual} of {expected} columns",
    pasteMismatch: "Column count does not match the sheet profile ({actual} vs {expected}). Analysis is blocked.",
    profileRequired: "Confirm the sheet profile before using Paste row.",
    selectedTypes: "Selected",
    confirmationRequired: "Manual confirmation required",
    confidence: "Confidence",
    noFindings: "No applicable findings returned.",
    preApprovers: "Pre-approvers",
    reviewers: "Reviewers",
    recipients: "Completion recipients",
    none: "None",
    blockers: "Blockers",
    warnings: "Warnings",
    info: "Info",
    completeCaptureFirst: "Complete the row capture before readiness or closure can be assessed.",
    modelUnavailable: "AI drafts are unavailable; deterministic checks and routing remain active.",
    copy: "Copy",
    copied: "Copied",
    closureLocked: "Available after complete capture",
    profileVersion: "Profile",
    rulesVersion: "Rules",
    canonicalField: "Canonical field",
    sourceColumn: "Source column",
    chooseColumn: "Choose a column",
    optionalColumn: "Optional; leave unmapped when the column is absent",
    requiredPrimary: "Required primary key",
    statusAliases: "Status lifecycle mapping",
    statusAliasesHelp: "One per line: live Status = lifecycle stage. Original Status values remain unchanged.",
    statusAliasesPlaceholder: "Waiting for approval = Pre-Approval",
    invalidStatusAliases: "Check the Status mapping. Use one valid lifecycle stage per line.",
    profileSaved: "Sheet profile confirmed and activated.",
    diagnosticsCopied: "Diagnostics copied. No cell values were included.",
    analyzed: "Analysis complete.",
    rowCaptured: "Row snapshot updated.",
    authRequired: "Your session expired. Sign in again.",
    unknownError: "Something went wrong.",
    reanalyzeHint: "Change type selection changed. Analyze again to recompute routes and tasks.",
  },
  ru: {
    readOnly: "Пилот только для чтения · без изменений Smartsheet и SAP",
    signInKicker: "ЗАЩИЩЁННЫЙ ДОСТУП",
    signIn: "Войти",
    signInHelp: "Используйте учётную запись с ролью ecn_user.",
    password: "Пароль",
    selectedRowKicker: "КОНТЕКСТ ЛИСТА",
    selectedRow: "Выбранная строка",
    domMode: "Текущая строка",
    pasteMode: "Вставить строку",
    domHelp: "Выберите ячейку в Smartsheet и запустите захват. Прокручивайте строку по горизонтали вручную, чтобы собрать остальные колонки.",
    capture: "Захватить выбранную строку",
    pasteLabel: "TSV-строка",
    pastePlaceholder: "Вставьте одну строку с разделителями Tab",
    validatePaste: "Проверить вставленную строку",
    noCapture: "Строка ещё не захвачена.",
    viewCapturedFields: "Показать захваченные поля",
    classificationKicker: "ДАННЫЕ ДЛЯ МАРШРУТА",
    changeTypes: "Change types",
    typeHelp: "Можно выбрать один или несколько типов до анализа или при низкой уверенности классификации.",
    analyze: "Проанализировать ECN",
    assessmentKicker: "ДЕТЕРМИНИРОВАННАЯ ПРОВЕРКА",
    gates: "Gates и замечания",
    routingKicker: "УЧАСТНИКИ И ПЕРЕДАЧА",
    routing: "Маршрут согласования",
    workKicker: "IMPLEMENTATION",
    tasks: "SAP / document checklist",
    nextActionKicker: "РЕКОМЕНДАЦИЯ",
    nextAction: "Следующий шаг",
    draftsKicker: "ТЕКСТ ДЛЯ КОПИРОВАНИЯ",
    drafts: "Черновики",
    draftMissingInformation: "Запрос недостающих сведений",
    draftApprovalComment: "Комментарий для согласования",
    draftImplementationHandoff: "Передача исполнителю",
    draftReviewerRequest: "Запрос reviewer",
    draftClosureSummary: "Итог для закрытия",
    sourcesKicker: "ТРАССИРУЕМОСТЬ",
    citations: "Источники",
    profileAndDiagnostics: "Профиль листа и диагностика",
    headerRow: "Строка заголовков (TSV)",
    headerPlaceholder: "Вставьте строку заголовков из экспорта",
    mapHeaders: "Сопоставить колонки",
    confirmProfile: "Я проверил порядок и сопоставление канонических полей.",
    saveProfile: "Подтвердить и сохранить профиль",
    copyDiagnostics: "Скопировать диагностику селекторов (без значений)",
    signOut: "Выйти",
    working: "Выполняется…",
    captureComplete: "Полный",
    capturePartial: "Частичный",
    captureAmbiguous: "Неоднозначный",
    profileReady: "Профиль готов",
    profileNeedsRemap: "Нужно сопоставление",
    columnsCaptured: "Захвачено колонок: {captured} из {expected}",
    missingColumns: "Не захвачены: {value}",
    guardIncomplete: "Окончательная готовность и закрытие недоступны, пока строка и профиль листа не полны.",
    noActiveRow: "Сначала выберите ячейку Smartsheet.",
    captureFailed: "Не удалось захватить строку.",
    pasteExact: "Колонок: {actual} из {expected}",
    pasteMismatch: "Количество колонок не совпадает с профилем листа ({actual} и {expected}). Анализ заблокирован.",
    profileRequired: "Подтвердите профиль листа перед использованием Paste row.",
    selectedTypes: "Выбрано",
    confirmationRequired: "Нужно ручное подтверждение",
    confidence: "Уверенность",
    noFindings: "Применимые замечания не найдены.",
    preApprovers: "Pre-approvers",
    reviewers: "Reviewers",
    recipients: "Completion recipients",
    none: "Нет",
    blockers: "Blockers",
    warnings: "Warnings",
    info: "Info",
    completeCaptureFirst: "Завершите захват строки, прежде чем оценивать готовность или закрытие.",
    modelUnavailable: "ИИ-черновики недоступны; детерминированные проверки и маршрутизация продолжают работать.",
    copy: "Копировать",
    copied: "Скопировано",
    closureLocked: "Доступно после полного захвата",
    profileVersion: "Профиль",
    rulesVersion: "Правила",
    canonicalField: "Каноническое поле",
    sourceColumn: "Колонка листа",
    chooseColumn: "Выберите колонку",
    optionalColumn: "Необязательно; оставьте пустым, если колонки нет",
    requiredPrimary: "Обязательный primary key",
    statusAliases: "Сопоставление Status с жизненным циклом",
    statusAliasesHelp: "Одна строка на значение: фактический Status = этап жизненного цикла. Исходные значения Status не изменяются.",
    statusAliasesPlaceholder: "Waiting for approval = Pre-Approval",
    invalidStatusAliases: "Проверьте сопоставление Status: в каждой строке должен быть допустимый этап жизненного цикла.",
    profileSaved: "Профиль листа подтверждён и активирован.",
    diagnosticsCopied: "Диагностика скопирована. Значения ячеек не включены.",
    analyzed: "Анализ завершён.",
    rowCaptured: "Снимок строки обновлён.",
    authRequired: "Сессия истекла. Войдите снова.",
    unknownError: "Произошла ошибка.",
    reanalyzeHint: "Выбор Change Type изменён. Повторите анализ для пересчёта маршрута и задач.",
  },
};

const FALLBACK_CHANGE_TYPES = [
  ["form_fit_function_catalog", "Form/Fit/Function - Catalog"],
  ["form_fit_function_custom", "Form/Fit/Function - Custom"],
  ["source_catalog", "Source - Catalog"],
  ["source_custom", "Source - Custom"],
  ["secondary_process_catalog", "Secondary Process - Catalog"],
  ["secondary_process_custom", "Secondary Process - Custom"],
  ["quality_improvement", "Quality Improvement"],
  ["manufacturing_process_change", "Manufacturing Process Change"],
  ["new_custom_packager", "New Custom/Packager"],
  ["new_catalog_packager", "New Catalog/Packager"],
  ["discontinuation_reactivation", "Discontinuation/Reactivation"],
  ["branding_artwork", "Branding/Artwork"],
  ["packaging_catalog", "Packaging - Catalog"],
  ["packaging_custom", "Packaging - Custom"],
  ["cost_catalog", "Cost - Catalog"],
  ["cost_custom", "Cost - Custom"],
  ["engineering_minor_document", "Engineering Minor Document"],
  ["routing_change", "Routing Change"],
  ["custom_routing", "Custom Routing"],
  ["catalog_routing_rate", "Catalog Routing Rate"],
  ["custom_routing_rate", "Custom Routing Rate"],
  ["qa_block", "QA Block"],
  ["incoming_inspection_flag_text", "Incoming Inspection Flag/Text"],
  ["po_text_quality", "PO Text - Quality"],
  ["po_text_vendor_information", "PO Text - Vendor Information"],
].map(([id, label]) => ({ id, label, aliases: [] }));

const LIFECYCLE = [
  "Submitted",
  "MDC Validation / Needs Info",
  "Pre-Approval",
  "Rework / Implementation",
  "MDC Verification",
  "Implementation Review",
  "Notifications",
  "Closed",
];

const state = {
  language: "ru",
  authenticated: false,
  profile: null,
  capabilities: {},
  changeTypes: FALLBACK_CHANGE_TYPES,
  ruleSetVersion: "",
  mode: "dom",
  snapshot: null,
  analysis: null,
  selectedTypes: new Set(),
  mappedHeaders: null,
};

const domAdapter = new DomMessageSheetContextAdapter();
const byId = (id) => document.getElementById(id);

function t(key, variables = {}) {
  let text = I18N[state.language]?.[key] || I18N.en[key] || key;
  for (const [name, value] of Object.entries(variables)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function showNotice(message, kind = "") {
  const node = byId("notice");
  node.textContent = message || "";
  node.className = `notice${kind ? ` ${kind}` : ""}${message ? "" : " hidden"}`;
}

function setBusy(active, label = "working") {
  byId("busy").classList.toggle("hidden", !active);
  byId("busyText").textContent = t(label);
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (response?.authRequired || response?.status === 401) {
    state.authenticated = false;
    renderSession();
    throw new Error(t("authRequired"));
  }
  if (!response?.ok) throw new Error(response?.error || t("unknownError"));
  return response;
}

function applyTranslations() {
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === state.language);
  });
  renderLifecycle();
  renderSnapshot();
  renderChangeTypes();
  renderProfileSummary();
  if (state.analysis) renderAnalysis();
}

function renderSession() {
  byId("authView").classList.toggle("hidden", state.authenticated);
  byId("workspace").classList.toggle("hidden", !state.authenticated);
}

function currentStatusValue() {
  if (!state.snapshot || !state.profile?.bindings?.status) return "";
  const binding = String(state.profile.bindings.status);
  const match = binding.match(/^(.*?)(?:#|::)(\d+)$/);
  const header = match?.[1] || binding;
  const ordinal = Number(match?.[2] || 0);
  const field = state.snapshot.fields?.find((item) => (
    String(item.header).trim().toLowerCase() === header.trim().toLowerCase() &&
    (!ordinal || item.ordinal === ordinal)
  ));
  const raw = String(field?.value || "").trim();
  const mapped = state.profile?.statusAliases?.[raw] || state.profile?.statusAliases?.[raw.toLowerCase()] || raw;
  return String(mapped).trim().toLowerCase();
}

function renderLifecycle() {
  const list = byId("lifecycle");
  list.replaceChildren();
  const status = currentStatusValue();
  for (const label of LIFECYCLE) {
    const item = element("li");
    if (status && (label.toLowerCase().includes(status) || status.includes(label.toLowerCase()))) item.classList.add("active");
    item.append(element("span", "step-dot"), document.createTextNode(label));
    list.append(item);
  }
}

function expectedColumnCount() {
  return state.profile?.headerOrder?.length || state.profile?.expectedHeaders?.length || 0;
}

function renderSnapshot() {
  const snapshot = state.snapshot;
  const pill = byId("captureState");
  pill.className = "state-pill neutral";
  if (!snapshot) {
    pill.textContent = "—";
    byId("snapshotSummary").className = "snapshot-summary empty";
    byId("snapshotSummary").replaceChildren(element("p", "", t("noCapture")));
    byId("rowDetails").classList.add("hidden");
    byId("captureGuard").classList.add("hidden");
    byId("analyzeButton").disabled = true;
    renderLifecycle();
    return;
  }

  const stateLabel = snapshot.captureState === "complete"
    ? t("captureComplete")
    : snapshot.captureState === "partial" ? t("capturePartial") : t("captureAmbiguous");
  pill.textContent = stateLabel;
  pill.className = `state-pill ${snapshot.captureState}`;

  const title = snapshot.rowHint?.ecnNumber || snapshot.rowHint?.primaryValue || snapshot.sheetTitle || t("selectedRow");
  const summary = byId("snapshotSummary");
  summary.className = "snapshot-summary";
  const expected = expectedColumnCount();
  summary.replaceChildren(
    element("p", "snapshot-title", title),
    (() => {
      const meta = element("div", "snapshot-meta");
      meta.append(
        element("span", "", snapshot.captureMode.toUpperCase()),
        element("span", "", t("columnsCaptured", { captured: snapshot.fields?.length || 0, expected: expected || "?" })),
      );
      if (snapshot.rowHint?.rowIndex) meta.append(element("span", "", `aria-rowindex ${snapshot.rowHint.rowIndex}`));
      return meta;
    })(),
  );

  const fieldsNode = byId("capturedFields");
  fieldsNode.replaceChildren();
  for (const field of snapshot.fields || []) {
    const row = element("div", "field-row");
    row.append(
      element("div", "field-name", `${field.ordinal}. ${field.header}`),
      element("div", "field-value", printable(field.value)),
    );
    fieldsNode.append(row);
  }
  byId("rowDetails").classList.toggle("hidden", !(snapshot.fields?.length));

  const guard = byId("captureGuard");
  const incomplete = snapshot.captureState !== "complete";
  guard.classList.toggle("hidden", !incomplete);
  if (incomplete) {
    const missing = snapshot.captureMeta?.missingColumns || [];
    guard.textContent = missing.length
      ? `${t("guardIncomplete")} ${t("missingColumns", { value: missing.join(", ") })}`
      : t("guardIncomplete");
  }
  // Partial rows may still run deterministic checks, but TSV mismatches never produce a snapshot.
  byId("analyzeButton").disabled = !(snapshot.fields?.length);
  renderLifecycle();
}

function renderChangeTypes() {
  const list = byId("changeTypeList");
  list.replaceChildren();
  for (const type of state.changeTypes) {
    const label = element("label", "type-option");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = type.id;
    input.checked = state.selectedTypes.has(type.id);
    input.addEventListener("change", () => {
      if (input.checked) state.selectedTypes.add(type.id);
      else state.selectedTypes.delete(type.id);
      byId("typeCount").textContent = String(state.selectedTypes.size);
      if (state.analysis) showNotice(t("reanalyzeHint"));
    });
    const copy = element("span", "", type.label || type.id);
    copy.append(element("span", "type-id", type.id));
    label.append(input, copy);
    list.append(label);
  }
  byId("typeCount").textContent = String(state.selectedTypes.size);
}

function printable(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function labelFrom(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  return printable(value.label || value.title || value.name || value.message || value.description || value.code || value.id || "");
}

function detailFrom(value) {
  if (!value || typeof value !== "object") return "";
  const pieces = [];
  if (value.stage) pieces.push(value.stage);
  if (value.status) pieces.push(value.status);
  if (value.transaction) pieces.push(value.transaction);
  if (value.expectedValue) pieces.push(`Expected: ${printable(value.expectedValue)}`);
  if (Array.isArray(value.missingFields) && value.missingFields.length) pieces.push(`Missing: ${value.missingFields.join(", ")}`);
  if (value.nextAction && value.nextAction !== value.label) pieces.push(printable(value.nextAction));
  if (value.reason) pieces.push(printable(value.reason));
  return pieces.filter(Boolean).join(" · ");
}

function normalizeSeverity(item) {
  const value = String(item?.severity || item?.status || "info").toLowerCase();
  if (["block", "blocked", "blocker", "missing"].includes(value)) return "block";
  if (["warning", "unknown", "needs_confirmation"].includes(value)) return "warning";
  if (value === "pass") return "pass";
  return "info";
}

function renderFindingList(container, items) {
  container.replaceChildren();
  if (!items?.length) {
    container.append(element("p", "muted compact", t("noFindings")));
    return;
  }
  for (const item of items) {
    const finding = element("div", "finding");
    finding.dataset.severity = normalizeSeverity(item);
    const copy = element("div");
    copy.append(element("div", "finding-title", labelFrom(item) || "—"));
    const detail = detailFrom(item);
    if (detail) copy.append(element("div", "finding-detail", detail));
    finding.append(element("span", "finding-dot"), copy);
    container.append(finding);
  }
}

function renderClassification(analysis) {
  const classification = analysis.classification || {};
  const selected = classification.selectedTypes || [];
  const labels = selected.map((id) => state.changeTypes.find((type) => type.id === id)?.label || id);
  const confidence = Math.max(0, Math.min(1, Number(classification.confidence || 0)));
  const node = byId("classificationSummary");
  node.replaceChildren();
  const line = element("div", "confidence-line");
  line.append(
    element("strong", "", labels.length ? labels.join(", ") : t("confirmationRequired")),
    element("span", "", `${Math.round(confidence * 100)}%`),
  );
  const bar = element("div", "confidence-bar");
  const fill = element("span");
  fill.style.width = `${Math.round(confidence * 100)}%`;
  bar.append(fill);
  node.append(line, bar);
  if (classification.requiresConfirmation) node.append(element("p", "microcopy", t("confirmationRequired")));

  if (selected.length && state.selectedTypes.size === 0) {
    for (const id of selected) state.selectedTypes.add(id);
    renderChangeTypes();
  }
}

function renderSeverity(analysis) {
  const items = [...(analysis.gates || []), ...(analysis.tasks || [])];
  const counts = { block: 0, warning: 0, info: 0 };
  for (const item of items) {
    const severity = normalizeSeverity(item);
    if (severity === "block") counts.block += 1;
    else if (severity === "warning") counts.warning += 1;
    else counts.info += 1;
  }
  const node = byId("severityCounts");
  node.replaceChildren(
    element("span", "sev-block", `${counts.block} B`),
    element("span", "sev-warning", `${counts.warning} W`),
    element("span", "sev-info", `${counts.info} I`),
  );
}

function renderRouting(analysis) {
  const node = byId("routingGroups");
  node.replaceChildren();
  const groups = [
    ["preApprovers", t("preApprovers")],
    ["reviewers", t("reviewers")],
    ["recipients", t("recipients")],
  ];
  for (const [key, label] of groups) {
    const group = element("div", "routing-group");
    group.append(element("h3", "", label));
    const participants = analysis.routing?.[key] || [];
    if (!participants.length) group.append(element("span", "muted", t("none")));
    for (const participant of participants) {
      const chip = element("span", "person-chip");
      const assignees = Array.isArray(participant.assignees)
        ? participant.assignees.map((item) => item.name).filter(Boolean)
        : [];
      const name = participant.department || participant.role || participant.name || labelFrom(participant);
      chip.append(element("span", "person-name", assignees.length ? `${name}: ${assignees.join(", ")}` : name));
      const reasons = Array.isArray(participant.reasons)
        ? participant.reasons.map((reason) => reason.typeLabel || reason.typeId || labelFrom(reason)).filter(Boolean)
        : [];
      if (reasons.length) chip.append(element("span", "person-reason", reasons.join(" · ")));
      group.append(chip);
    }
    node.append(group);
  }
}

function renderNextAction(analysis) {
  const node = byId("nextAction");
  node.replaceChildren();
  if (!analysis.clientGuard?.finalReadinessAllowed) {
    node.append(element("p", "", t("completeCaptureFirst")));
    return;
  }
  const action = analysis.nextAction || {};
  node.append(element("p", "", labelFrom(action) || printable(action)));
  const detail = detailFrom(action);
  if (detail && detail !== labelFrom(action)) node.append(element("p", "", detail));
}

const DRAFT_LABELS = {
  missingInformation: "draftMissingInformation",
  approvalComment: "draftApprovalComment",
  implementationHandoff: "draftImplementationHandoff",
  reviewerRequest: "draftReviewerRequest",
  closureSummary: "draftClosureSummary",
};

function renderDrafts(analysis) {
  const node = byId("draftsList");
  node.replaceChildren();
  const drafts = analysis.drafts || {};
  if (drafts.status === "unavailable") {
    node.append(element("div", "draft-unavailable", t("modelUnavailable")));
    return;
  }
  for (const [key, labelKey] of Object.entries(DRAFT_LABELS)) {
    const text = drafts[key];
    if (!text) continue;
    const card = element("article", "draft-card");
    const head = element("div", "draft-head");
    const copy = element("button", "copy-button", t("copy"));
    copy.type = "button";
    const readinessLocked = key !== "missingInformation" && !analysis.clientGuard?.finalReadinessAllowed;
    copy.disabled = readinessLocked;
    copy.title = readinessLocked ? t("closureLocked") : t("copy");
    if (!readinessLocked) {
      copy.addEventListener("click", async () => {
        await navigator.clipboard.writeText(String(text));
        copy.textContent = t("copied");
        setTimeout(() => { copy.textContent = t("copy"); }, 1300);
      });
    }
    head.append(element("strong", "", t(labelKey)), copy);
    card.append(head, element("pre", "draft-body", text));
    node.append(card);
  }
  if (!node.childElementCount) node.append(element("div", "draft-unavailable", t("modelUnavailable")));
}

function renderCitations(analysis) {
  const node = byId("citationsList");
  node.replaceChildren();
  for (const citation of analysis.citations || []) {
    const item = element("article", "citation");
    const title = element("div", "citation-title", citation.source || "Source");
    const evidence = element("span", `evidence ${citation.evidenceLevel === "controlled" ? "controlled" : ""}`, citation.evidenceLevel || "unknown");
    title.append(evidence);
    const locator = [citation.revision, citation.section, citation.cellRange].filter(Boolean).join(" · ");
    item.append(title, element("div", "citation-meta", locator));
    const quote = citation.excerpt || citation.quote;
    if (quote) item.append(element("blockquote", "citation-quote", quote));
    node.append(item);
  }
  if (!node.childElementCount) node.append(element("p", "muted compact", t("none")));
}

function renderAnalysis() {
  const analysis = state.analysis;
  if (!analysis) return;
  byId("analysisView").classList.remove("hidden");
  const guard = byId("decisionGuard");
  guard.classList.toggle("hidden", analysis.clientGuard?.finalReadinessAllowed !== false);
  guard.textContent = analysis.clientGuard?.finalReadinessAllowed === false ? t("guardIncomplete") : "";
  renderClassification(analysis);
  renderSeverity(analysis);
  renderFindingList(byId("gatesList"), analysis.gates || []);
  renderRouting(analysis);
  renderFindingList(byId("tasksList"), analysis.tasks || []);
  renderNextAction(analysis);
  renderDrafts(analysis);
  renderCitations(analysis);
}

function renderProfileSummary() {
  const node = byId("profileSummary");
  if (!node || !state.profile) return;
  const ready = state.profile.mappingState === "ready" && state.profile.confirmed === true;
  const row = element("div", "profile-state");
  const versions = element("span", "", `${t("profileVersion")}: ${state.profile.version || "—"}`);
  versions.append(document.createElement("br"), document.createTextNode(`${t("rulesVersion")}: ${state.ruleSetVersion || "—"}`));
  row.append(versions, element("strong", "", ready ? t("profileReady") : t("profileNeedsRemap")));
  node.replaceChildren(row);
}

function renderBindingEditor(headers) {
  state.mappedHeaders = headers;
  const editor = byId("bindingEditor");
  editor.replaceChildren();
  const canonicalFields = profileCanonicalFields(state.profile);
  if (!canonicalFields.length) return;
  const suggested = suggestProfileBindings(state.profile, headers);
  const primaryKeys = new Set(state.profile?.primaryKeys || []);
  const headings = element("div", "binding-row");
  headings.append(element("label", "", t("canonicalField")), element("label", "", t("sourceColumn")));
  editor.append(headings);

  for (const canonical of canonicalFields) {
    const row = element("div", "binding-row");
    row.dataset.canonical = canonical;
    const label = element("label", "", primaryKeys.has(canonical) ? `${canonical} *` : canonical);
    label.title = primaryKeys.has(canonical) ? t("requiredPrimary") : t("optionalColumn");
    const select = document.createElement("select");
    select.dataset.canonical = canonical;
    select.append(new Option(t("chooseColumn"), ""));
    headers.forEach((header, index) => select.append(new Option(`${index + 1}. ${header}`, String(index + 1))));
    if (suggested[canonical]) select.value = String(suggested[canonical]);
    row.append(label, select);
    editor.append(row);
  }
  byId("confirmProfileLabel").classList.remove("hidden");
  byId("saveProfileButton").classList.remove("hidden");
  byId("confirmProfile").checked = false;
  byId("saveProfileButton").disabled = true;
}

function normalizeHeader(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

async function fingerprint(headers) {
  const source = headers.map((header, index) => `${index + 1}:${normalizeHeader(header)}`).join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function bootstrap() {
  const response = await send({ type: "ECN_BOOTSTRAP" });
  const data = response.data || {};
  state.profile = data.profile || null;
  state.capabilities = data.capabilities || {};
  state.changeTypes = Array.isArray(data.changeTypes) && data.changeTypes.length ? data.changeTypes : FALLBACK_CHANGE_TYPES;
  state.ruleSetVersion = data.ruleSetVersion || "";
  byId("profileHeaders").value = (state.profile?.headerOrder || []).join("\t");
  byId("statusAliases").value = formatStatusAliasLines(state.profile?.statusAliases || {});
  if (state.profile) await send({ type: "ECN_SET_ACTIVE_PROFILE", profile: state.profile }).catch(() => undefined);
  renderProfileSummary();
  renderChangeTypes();
  renderSnapshot();
}

async function captureDom() {
  setBusy(true);
  try {
    state.snapshot = await domAdapter.capture();
    state.analysis = null;
    byId("analysisView").classList.add("hidden");
    renderSnapshot();
    showNotice(t("rowCaptured"), "success");
  } finally {
    setBusy(false);
  }
}

async function capturePaste() {
  const context = await send({ type: "ECN_GET_ACTIVE_TAB_CONTEXT" });
  const adapter = new PasteRowSheetContextAdapter({
    profile: state.profile,
    input: byId("pasteInput").value,
    pageUrl: context.pageUrl,
    sheetTitle: context.sheetTitle || "Pasted Smartsheet row",
  });
  state.snapshot = await adapter.capture();
  state.analysis = null;
  byId("analysisView").classList.add("hidden");
  renderSnapshot();
  showNotice(t("rowCaptured"), "success");
}

async function analyze() {
  setBusy(true);
  try {
    if (!state.snapshot) {
      if (state.mode === "paste") await capturePaste();
      else state.snapshot = await domAdapter.capture();
    }
    const response = await send({
      type: "ECN_ANALYZE",
      snapshot: state.snapshot,
      selectedTypes: Array.from(state.selectedTypes),
      language: state.language,
    });
    state.analysis = enforceReadinessGuard(response.data || {}, state.snapshot);
    renderAnalysis();
    showNotice(t("analyzed"), "success");
  } finally {
    setBusy(false);
  }
}

function updatePasteCount() {
  const expected = expectedColumnCount();
  try {
    const cells = parseSingleTsvRow(byId("pasteInput").value);
    byId("pasteCount").textContent = t(cells.length === expected ? "pasteExact" : "pasteMismatch", {
      actual: cells.length,
      expected: expected || "?",
    });
    byId("validatePasteButton").disabled = !expected || cells.length !== expected;
  } catch {
    byId("pasteCount").textContent = t("pasteMismatch", { actual: "?", expected: expected || "?" });
    byId("validatePasteButton").disabled = true;
  }
}

function setMode(mode) {
  state.mode = mode === "paste" ? "paste" : "dom";
  byId("domCapture").classList.toggle("hidden", state.mode !== "dom");
  byId("pasteCapture").classList.toggle("hidden", state.mode !== "paste");
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  updatePasteCount();
}

async function copyDiagnostics() {
  const diagnostics = await domAdapter.diagnostics();
  // Content adapter guarantees this object contains counts/ARIA signals only.
  await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
  showNotice(t("diagnosticsCopied"), "success");
}

async function saveProfile() {
  if (!state.mappedHeaders || !byId("confirmProfile").checked) return;
  const bindings = {};
  for (const select of byId("bindingEditor").querySelectorAll("select[data-canonical]")) {
    const ordinal = Number(select.value);
    if (!ordinal) continue;
    bindings[select.dataset.canonical] = `${state.mappedHeaders[ordinal - 1]}#${ordinal}`;
  }
  const primaryKeys = state.profile?.primaryKeys?.length ? state.profile.primaryKeys : ["ecnNumber"];
  const missingPrimary = primaryKeys.filter((canonical) => !bindings[canonical]);
  if (missingPrimary.length) throw new Error(`${t("requiredPrimary")}: ${missingPrimary.join(", ")}`);
  let statusAliases;
  try {
    statusAliases = parseStatusAliasLines(byId("statusAliases").value);
  } catch {
    throw new Error(t("invalidStatusAliases"));
  }
  const profile = {
    version: `ecn-sheet-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23)}`,
    headerFingerprint: await fingerprint(state.mappedHeaders),
    expectedHeaders: [...state.mappedHeaders],
    headerOrder: [...state.mappedHeaders],
    bindings,
    aliases: state.profile?.aliases || {},
    primaryKeys,
    statusAliases,
    locale: state.language,
  };
  setBusy(true);
  try {
    const response = await send({ type: "ECN_SAVE_SHEET_PROFILE", profile, confirmed: true });
    state.profile = response.data?.profile || { ...profile, confirmed: true, mappingState: "ready" };
    byId("statusAliases").value = formatStatusAliasLines(state.profile.statusAliases || {});
    await send({ type: "ECN_SET_ACTIVE_PROFILE", profile: state.profile }).catch(() => undefined);
    state.snapshot = null;
    state.analysis = null;
    renderProfileSummary();
    renderSnapshot();
    showNotice(t("profileSaved"), "success");
  } finally {
    setBusy(false);
  }
}

async function initialize() {
  renderLifecycle();
  try {
    const session = await chrome.runtime.sendMessage({ type: "ECN_GET_SESSION" });
    state.language = session?.language === "en" ? "en" : "ru";
    state.authenticated = Boolean(session?.authenticated);
    byId("email").value = session?.lastEmail || "";
    applyTranslations();
    renderSession();
    if (state.authenticated) {
      setBusy(true);
      await bootstrap();
    }
  } catch (error) {
    showNotice(error.message || t("unknownError"), "error");
  } finally {
    setBusy(false);
  }
}

byId("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  showNotice("");
  try {
    await send({
      type: "ECN_LOGIN",
      payload: { email: byId("email").value, password: byId("password").value },
    });
    byId("password").value = "";
    state.authenticated = true;
    renderSession();
    await bootstrap();
  } catch (error) {
    showNotice(error.message || t("unknownError"), "error");
  } finally {
    setBusy(false);
  }
});

for (const button of document.querySelectorAll("[data-lang]")) {
  button.addEventListener("click", async () => {
    state.language = button.dataset.lang === "en" ? "en" : "ru";
    await chrome.runtime.sendMessage({ type: "ECN_SET_LANGUAGE", language: state.language });
    applyTranslations();
  });
}

for (const button of document.querySelectorAll("[data-mode]")) {
  button.addEventListener("click", () => setMode(button.dataset.mode));
}

byId("captureButton").addEventListener("click", () => captureDom().catch((error) => showNotice(error.message, "error")));
byId("validatePasteButton").addEventListener("click", () => capturePaste().catch((error) => showNotice(error.message, "error")));
byId("pasteInput").addEventListener("input", updatePasteCount);
byId("analyzeButton").addEventListener("click", () => analyze().catch((error) => showNotice(error.message, "error")));
byId("diagnosticsButton").addEventListener("click", () => copyDiagnostics().catch((error) => showNotice(error.message, "error")));
byId("loadHeadersButton").addEventListener("click", () => {
  try {
    const headers = parseSingleTsvRow(byId("profileHeaders").value).map((header) => header.trim());
    if (!headers.length || headers.some((header) => !header)) throw new Error(t("headerRow"));
    renderBindingEditor(headers);
  } catch (error) {
    showNotice(error.message || t("unknownError"), "error");
  }
});
byId("confirmProfile").addEventListener("change", () => {
  byId("saveProfileButton").disabled = !byId("confirmProfile").checked;
});
byId("saveProfileButton").addEventListener("click", () => saveProfile().catch((error) => showNotice(error.message, "error")));
byId("logoutButton").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "ECN_LOGOUT" });
  state.authenticated = false;
  state.snapshot = null;
  state.analysis = null;
  renderSession();
});

initialize();
