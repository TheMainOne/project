(function installEcnCaptureCore(root) {
  "use strict";

  const ADAPTER_VERSION = "dom-aria-v1";
  const CELL_SELECTOR = '[role="gridcell"], [role="cell"], [aria-colindex]';
  const HEADER_SELECTOR = '[role="columnheader"], [aria-colindex][data-column-name]';

  function cleanText(value) {
    return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function normalizeHeader(value) {
    return cleanText(value).normalize("NFKC").toLocaleLowerCase("en-US");
  }

  function parsePositiveInteger(value) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function visible(element) {
    if (!element || element.hidden || element.getAttribute("aria-hidden") === "true") return false;
    return true;
  }

  function textFromElement(element) {
    if (!element) return "";
    return cleanText(
      element.getAttribute("aria-label") ||
      element.getAttribute("data-column-name") ||
      element.getAttribute("title") ||
      element.innerText ||
      element.textContent
    );
  }

  function elementColumnIndex(element) {
    if (!element) return null;
    const direct = parsePositiveInteger(element.getAttribute("aria-colindex"));
    if (direct) return direct;
    const indexed = element.closest?.("[aria-colindex]");
    return parsePositiveInteger(indexed?.getAttribute("aria-colindex"));
  }

  function elementRowIndex(element) {
    if (!element) return null;
    const direct = parsePositiveInteger(element.getAttribute("aria-rowindex"));
    if (direct) return direct;
    const row = element.closest?.('[role="row"], [aria-rowindex]');
    return parsePositiveInteger(row?.getAttribute("aria-rowindex"));
  }

  function closestCell(target) {
    if (!target || typeof target.closest !== "function") return null;
    const candidate = target.closest(CELL_SELECTOR);
    if (!candidate || !visible(candidate)) return null;
    if (!elementColumnIndex(candidate) || !elementRowIndex(candidate)) return null;
    return candidate;
  }

  function headerFromReferences(documentRef, cell) {
    const ids = cleanText(cell.getAttribute("aria-labelledby") || cell.getAttribute("headers"));
    if (!ids) return "";
    for (const id of ids.split(/\s+/)) {
      const referenced = documentRef.getElementById(id);
      if (!referenced) continue;
      const role = referenced.getAttribute("role");
      if (role === "columnheader" || referenced.hasAttribute("aria-colindex")) {
        const label = textFromElement(referenced);
        if (label) return label;
      }
    }
    return "";
  }

  function collectHeaderMap(documentRef) {
    const map = new Map();
    const conflicts = new Set();
    for (const header of documentRef.querySelectorAll(HEADER_SELECTOR)) {
      if (!visible(header)) continue;
      const ordinal = elementColumnIndex(header);
      const label = textFromElement(header);
      if (!ordinal || !label) continue;
      const existing = map.get(ordinal);
      if (existing && normalizeHeader(existing) !== normalizeHeader(label)) conflicts.add(ordinal);
      else map.set(ordinal, label);
    }
    return { map, conflicts };
  }

  function fieldKey(header, ordinal) {
    return `${normalizeHeader(header)}::${ordinal}`;
  }

  function expectedColumns(profile) {
    const order = Array.isArray(profile?.headerOrder) && profile.headerOrder.length
      ? profile.headerOrder
      : Array.isArray(profile?.expectedHeaders) ? profile.expectedHeaders : [];
    return order.map((header, index) => ({ header: cleanText(header), ordinal: index + 1 }));
  }

  function isProfileRemapRequired(profile) {
    const state = cleanText(profile?.mappingState || profile?.state || profile?.status).toLowerCase();
    return state === "needs_remap" || state === "draft" || profile?.confirmed === false;
  }

  function evaluateCapture(fields, profile, ambiguousReasons) {
    const reasons = new Set(ambiguousReasons || []);
    const expected = expectedColumns(profile);
    const capturedKeys = new Set(fields.map((field) => fieldKey(field.header, field.ordinal)));
    const expectedKeys = new Set(expected.map((field) => fieldKey(field.header, field.ordinal)));
    const missingColumns = expected
      .filter((field) => !capturedKeys.has(fieldKey(field.header, field.ordinal)))
      .map((field) => field.header);
    const unexpected = fields.filter((field) => expected.length && !expectedKeys.has(fieldKey(field.header, field.ordinal)));

    if (!profile || expected.length === 0) reasons.add("profile_unavailable");
    if (isProfileRemapRequired(profile)) reasons.add("profile_needs_remap");
    if (unexpected.length) reasons.add("header_fingerprint_mismatch");

    let state = "partial";
    if (reasons.size > 0 && !reasons.has("profile_unavailable")) state = "ambiguous";
    else if (expected.length > 0 && missingColumns.length === 0 && fields.length === expected.length) state = "complete";

    return {
      state,
      missingColumns: Array.from(new Set(missingColumns)),
      unexpectedColumns: unexpected.map((field) => field.header),
      reasons: Array.from(reasons),
    };
  }

  function findPrimaryValue(fields, profile) {
    const primaryKeys = Array.isArray(profile?.primaryKeys) ? profile.primaryKeys : [];
    for (const canonical of primaryKeys) {
      const binding = profile?.bindings?.[canonical];
      let header = "";
      let ordinal = null;
      if (typeof binding === "string") {
        const match = binding.match(/^(.*?)(?:#|::)(\d+)$/);
        header = cleanText(match?.[1] || binding);
        ordinal = parsePositiveInteger(match?.[2]);
      } else if (binding && typeof binding === "object") {
        header = cleanText(binding.header);
        ordinal = parsePositiveInteger(binding.ordinal);
      }
      const preferred = fields.find((field) => (
        cleanText(field.value) &&
        (!header || normalizeHeader(field.header) === normalizeHeader(header)) &&
        (!ordinal || field.ordinal === ordinal)
      ));
      if (preferred) return cleanText(preferred.value);
    }
    const literalKeys = primaryKeys.map(normalizeHeader);
    const literal = fields.find((field) => literalKeys.includes(normalizeHeader(field.header)) && cleanText(field.value));
    if (literal) return cleanText(literal.value);
    return "";
  }

  function findEcnNumber(fields) {
    const match = fields.find((field) => /(^|\b)(ecn|engineering change)(\b|\s*#)/i.test(field.header));
    return match ? cleanText(match.value) : "";
  }

  function sheetTitle(documentRef) {
    const heading = Array.from(documentRef.querySelectorAll('[role="heading"], h1'))
      .find((element) => visible(element) && textFromElement(element));
    return textFromElement(heading) || cleanText(documentRef.title).replace(/\s*[-|]\s*Smartsheet.*$/i, "");
  }

  class DomRowAccumulator {
    constructor(documentRef, options = {}) {
      if (!documentRef) throw new Error("document is required");
      this.document = documentRef;
      this.window = options.window || documentRef.defaultView || root;
      this.profile = options.profile || null;
      this.rowIndex = null;
      this.fields = new Map();
      this.observedHeaders = new Map();
      this.ambiguousReasons = new Set();
      this.lastEvaluation = { state: "ambiguous", missingColumns: [], reasons: ["no_active_row"] };
      this.started = false;
      this.captureTimer = null;
      this.mutationObserver = null;
      this.onSelectionEvent = this.onSelectionEvent.bind(this);
      this.onScroll = this.onScroll.bind(this);
    }

    setProfile(profile) {
      this.profile = profile && typeof profile === "object" ? profile : null;
      this.recalculate();
    }

    start() {
      if (this.started) return;
      this.started = true;
      this.document.addEventListener("focusin", this.onSelectionEvent, true);
      this.document.addEventListener("click", this.onSelectionEvent, true);
      this.document.addEventListener("scroll", this.onScroll, true);
      const Observer = this.window?.MutationObserver || root.MutationObserver;
      if (Observer && this.document.documentElement) {
        this.mutationObserver = new Observer(() => this.scheduleCapture());
        this.mutationObserver.observe(this.document.documentElement, { childList: true, subtree: true });
      }
      this.discoverSelection();
    }

    stop() {
      if (!this.started) return;
      this.started = false;
      this.document.removeEventListener("focusin", this.onSelectionEvent, true);
      this.document.removeEventListener("click", this.onSelectionEvent, true);
      this.document.removeEventListener("scroll", this.onScroll, true);
      this.mutationObserver?.disconnect();
      this.mutationObserver = null;
      if (this.captureTimer) this.window.clearTimeout(this.captureTimer);
      this.captureTimer = null;
    }

    reset(rowIndex = null) {
      this.rowIndex = rowIndex;
      this.fields.clear();
      this.observedHeaders.clear();
      this.ambiguousReasons.clear();
      this.lastEvaluation = {
        state: rowIndex ? "partial" : "ambiguous",
        missingColumns: expectedColumns(this.profile).map((field) => field.header),
        reasons: rowIndex ? [] : ["no_active_row"],
      };
    }

    selectCell(cell) {
      const rowIndex = elementRowIndex(cell);
      if (!rowIndex) return false;
      if (this.rowIndex !== rowIndex) this.reset(rowIndex);
      this.captureVisibleRow();
      return true;
    }

    onSelectionEvent(event) {
      const cell = closestCell(event.target);
      if (cell) this.selectCell(cell);
    }

    onScroll() {
      // A scroll event is only observed. The adapter never scrolls or clicks the page.
      this.scheduleCapture();
    }

    scheduleCapture() {
      if (!this.rowIndex || this.captureTimer) return;
      this.captureTimer = this.window.setTimeout(() => {
        this.captureTimer = null;
        this.captureVisibleRow();
      }, 60);
    }

    discoverSelection() {
      const active = closestCell(this.document.activeElement);
      if (active) return this.selectCell(active);
      const activeDescendantId = cleanText(this.document.activeElement?.getAttribute?.("aria-activedescendant"));
      const activeDescendant = activeDescendantId
        ? closestCell(this.document.getElementById(activeDescendantId))
        : null;
      if (activeDescendant) return this.selectCell(activeDescendant);
      const selected = this.document.querySelector(
        '[aria-selected="true"][aria-colindex], [aria-current="true"][aria-colindex]'
      );
      if (selected) return this.selectCell(selected);
      return false;
    }

    captureVisibleRow() {
      if (!this.rowIndex && !this.discoverSelection()) return this.snapshot();

      const { map: headers, conflicts } = collectHeaderMap(this.document);
      for (const ordinal of conflicts) this.ambiguousReasons.add(`header_conflict:${ordinal}`);

      for (const element of this.document.querySelectorAll(CELL_SELECTOR)) {
        if (!visible(element) || element.getAttribute("role") === "columnheader") continue;
        if (elementRowIndex(element) !== this.rowIndex) continue;
        const ordinal = elementColumnIndex(element);
        if (!ordinal) continue;
        const header = headerFromReferences(this.document, element) || headers.get(ordinal) || "";
        if (!header) {
          this.ambiguousReasons.add(`unknown_header:${ordinal}`);
          continue;
        }
        this.ambiguousReasons.delete(`unknown_header:${ordinal}`);
        for (const [existingKey, existingField] of this.fields.entries()) {
          if (existingField.ordinal === ordinal && normalizeHeader(existingField.header) !== normalizeHeader(header)) {
            this.fields.delete(existingKey);
          }
        }
        const value = textFromElement(element);
        const key = fieldKey(header, ordinal);
        const previous = this.fields.get(key);
        if (previous && cleanText(previous.value) !== cleanText(value)) {
          this.ambiguousReasons.add(`conflicting_cell:${ordinal}`);
        }
        this.fields.set(key, { header, ordinal, value });
        this.observedHeaders.set(ordinal, header);
      }

      this.recalculate();
      return this.snapshot();
    }

    recalculate() {
      const fields = Array.from(this.fields.values()).sort((a, b) => a.ordinal - b.ordinal);
      this.lastEvaluation = evaluateCapture(fields, this.profile, this.ambiguousReasons);
    }

    snapshot() {
      const fields = Array.from(this.fields.values())
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((field) => ({ ...field }));
      const rowHint = {};
      if (this.rowIndex) rowHint.rowIndex = this.rowIndex;
      const primaryValue = findPrimaryValue(fields, this.profile);
      const ecnNumber = findEcnNumber(fields);
      if (primaryValue) rowHint.primaryValue = primaryValue;
      if (ecnNumber) rowHint.ecnNumber = ecnNumber;

      return {
        pageUrl: String(this.window?.location?.href || ""),
        sheetTitle: sheetTitle(this.document),
        rowHint,
        captureMode: "dom",
        captureState: this.rowIndex ? this.lastEvaluation.state : "ambiguous",
        observedHeaders: Array.from(this.observedHeaders.entries())
          .sort((a, b) => a[0] - b[0])
          .map((entry) => entry[1]),
        fields,
        capturedAt: new Date().toISOString(),
        captureMeta: {
          missingColumns: this.lastEvaluation.missingColumns || [],
          unexpectedColumns: this.lastEvaluation.unexpectedColumns || [],
          reasons: this.rowIndex ? (this.lastEvaluation.reasons || []) : ["no_active_row"],
        },
      };
    }

    diagnostics() {
      const headers = collectHeaderMap(this.document);
      const allCells = Array.from(this.document.querySelectorAll(CELL_SELECTOR));
      const indexedCells = allCells.filter((element) => elementColumnIndex(element) && elementRowIndex(element));
      const visibleSelectedCells = indexedCells.filter((element) => visible(element) && elementRowIndex(element) === this.rowIndex);
      return {
        adapterVersion: ADAPTER_VERSION,
        generatedAt: new Date().toISOString(),
        host: String(this.window?.location?.host || ""),
        captureState: this.rowIndex ? this.lastEvaluation.state : "ambiguous",
        selectedRowIndexAvailable: Boolean(this.rowIndex),
        aria: {
          columnHeaderCount: headers.map.size,
          conflictingHeaderIndexCount: headers.conflicts.size,
          indexedCellCount: indexedCells.length,
          selectedRowVisibleCellCount: visibleSelectedCells.length,
          selectedRowUnknownHeaderCount: visibleSelectedCells.filter((element) => {
            const ordinal = elementColumnIndex(element);
            return !headerFromReferences(this.document, element) && !headers.map.has(ordinal);
          }).length,
        },
        capturedColumnCount: this.fields.size,
        missingColumnCount: this.lastEvaluation.missingColumns?.length || 0,
        unexpectedColumnCount: this.lastEvaluation.unexpectedColumns?.length || 0,
        profileVersion: cleanText(this.profile?.version) || null,
        reasons: this.rowIndex ? (this.lastEvaluation.reasons || []) : ["no_active_row"],
        containsCellValues: false,
      };
    }
  }

  root.EcnCaptureCore = Object.freeze({
    ADAPTER_VERSION,
    DomRowAccumulator,
    cleanText,
    closestCell,
    collectHeaderMap,
    elementColumnIndex,
    elementRowIndex,
    evaluateCapture,
    expectedColumns,
    fieldKey,
    normalizeHeader,
  });
})(globalThis);
