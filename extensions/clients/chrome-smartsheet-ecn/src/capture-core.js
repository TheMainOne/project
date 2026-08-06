(function installEcnCaptureCore(root) {
  "use strict";

  const ADAPTER_VERSION = "dom-semantic-v2";
  const CELL_SELECTOR = '[role="gridcell"], [role="cell"], [aria-colindex], td';
  const HEADER_SELECTOR = '[role="columnheader"], [aria-colindex][data-column-name], thead th, th[scope="col"], tr:first-child th';
  const ROW_TOKEN_ATTRIBUTES = Object.freeze([
    "data-row-index",
    "data-rowindex",
    "data-row-id",
    "data-rowid",
    "data-rid",
    "row-index",
    "row-id",
  ]);
  const COLUMN_TOKEN_ATTRIBUTES = Object.freeze([
    "data-column-index",
    "data-col-index",
    "data-column-id",
    "data-col-id",
    "data-columnid",
    "data-colid",
    "data-cid",
    "col-index",
    "col-id",
  ]);
  const COLUMN_TOKEN_SELECTOR = COLUMN_TOKEN_ATTRIBUTES.map((name) => `[${name}]`).join(", ");

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

  function parseNonNegativeInteger(value) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  function visible(element) {
    if (!element) return false;
    for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
      if (current.hidden || current.getAttribute?.("aria-hidden") === "true") return false;
      const style = current.ownerDocument?.defaultView?.getComputedStyle?.(current);
      if (style && (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse")) {
        return false;
      }
    }
    return true;
  }

  function visibleText(element) {
    if (!element) return "";
    if (typeof element.innerText === "string") return cleanText(element.innerText);
    const documentRef = element.ownerDocument;
    const NodeFilterRef = documentRef?.defaultView?.NodeFilter;
    if (!documentRef?.createTreeWalker || !NodeFilterRef) return cleanText(element.textContent);
    const walker = documentRef.createTreeWalker(element, NodeFilterRef.SHOW_TEXT);
    const parts = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (visible(node.parentElement)) parts.push(node.nodeValue || "");
    }
    return cleanText(parts.join(" "));
  }

  function textFromHeaderElement(element) {
    if (!element) return "";
    return cleanText(
      element.getAttribute("data-column-name") ||
      visibleText(element) ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      ""
    );
  }

  function valueFromElement(element) {
    if (!element) return "";
    const editors = [];
    if (element.matches?.("input, textarea, select")) editors.push(element);
    editors.push(...(element.querySelectorAll?.("input, textarea, select") || []));
    const editor = editors.find((candidate) =>
      visible(candidate) && !(candidate.tagName === "INPUT" && candidate.type === "hidden")
    );
    const editorValue = editor && "value" in editor ? editor.value : "";
    return cleanText(
      editorValue ||
      element.getAttribute("aria-valuetext") ||
      element.getAttribute("data-cell-value") ||
      visibleText(element) ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      ""
    );
  }

  function textFromElement(element) {
    return valueFromElement(element);
  }

  function attributeToken(element, names) {
    for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
      for (const name of names) {
        if (!current.hasAttribute?.(name)) continue;
        const value = cleanText(current.getAttribute(name));
        if (value) return { name, value, element: current };
      }
    }
    return null;
  }

  function elementColumnIndex(element) {
    if (!element) return null;
    const direct = parsePositiveInteger(element.getAttribute("aria-colindex"));
    if (direct) return direct;
    const indexed = element.closest?.("[aria-colindex]");
    const inherited = parsePositiveInteger(indexed?.getAttribute("aria-colindex"));
    if (inherited) return inherited;
    const nativeCell = element.closest?.("td, th");
    return Number.isInteger(nativeCell?.cellIndex) && nativeCell.cellIndex >= 0
      ? nativeCell.cellIndex + 1
      : null;
  }

  function elementRowIndex(element) {
    if (!element) return null;
    const direct = parsePositiveInteger(element.getAttribute("aria-rowindex"));
    if (direct) return direct;
    const row = element.closest?.('[role="row"], [aria-rowindex]');
    const inherited = parsePositiveInteger(row?.getAttribute("aria-rowindex"));
    if (inherited) return inherited;
    const indexed = attributeToken(element, ["data-row-index", "data-rowindex", "row-index"]);
    if (indexed) {
      const parsed = parseNonNegativeInteger(indexed.value);
      if (parsed !== null) return parsed === 0 ? 1 : parsed;
    }
    const nativeRow = element.closest?.("tr");
    return Number.isInteger(nativeRow?.rowIndex) && nativeRow.rowIndex >= 0
      ? nativeRow.rowIndex + 1
      : null;
  }

  function elementRowIdentity(element) {
    if (!element) return null;
    const ariaIndex = parsePositiveInteger(
      element.getAttribute?.("aria-rowindex") || element.closest?.("[aria-rowindex]")?.getAttribute("aria-rowindex")
    );
    if (ariaIndex) return { key: `aria:${ariaIndex}`, rowIndex: ariaIndex, source: "aria" };

    const token = attributeToken(element, ROW_TOKEN_ATTRIBUTES);
    if (token) {
      const parsed = parseNonNegativeInteger(token.value);
      return {
        key: `${token.name}:${token.value}`,
        rowIndex: parsed === null ? null : (parsed === 0 ? 1 : parsed),
        source: "dataset",
        attributeName: token.name,
      };
    }

    const nativeRow = element.closest?.("tr");
    if (nativeRow) {
      return {
        key: nativeRow,
        rowIndex: Number.isInteger(nativeRow.rowIndex) ? nativeRow.rowIndex + 1 : null,
        source: "native-table",
        rowElement: nativeRow,
      };
    }
    return null;
  }

  function selectionRoot(element) {
    const sharedGrid = element?.closest?.(
      '[role="grid"], [role="treegrid"], [data-grid-id], [data-sheet-id], [data-view-id]'
    );
    return sharedGrid || element?.closest?.("table") || null;
  }

  function matchesSelectedRow(identity, selection) {
    if (!identity || !selection) return false;
    if (selection.matchNativeRowIndex && identity.source === "native-table") {
      return identity.rowIndex !== null && identity.rowIndex === selection.rowIndex;
    }
    return identity.key === selection.key;
  }

  function primaryHeaderNames(profile) {
    const names = new Set();
    for (const key of Array.isArray(profile?.primaryKeys) ? profile.primaryKeys : []) {
      const binding = cleanText(profile?.bindings?.[key]);
      const match = binding.match(/^(.*?)(?:#|::)\d+$/);
      const header = cleanText(match?.[1] || binding);
      if (header) names.add(normalizeHeader(header));
    }
    if (!names.size) {
      const first = expectedColumns(profile)[0]?.header;
      if (first) names.add(normalizeHeader(first));
    }
    return names;
  }

  function trustedSelectionRoot(rootElement, profile) {
    const expected = expectedColumns(profile);
    if (!rootElement?.querySelectorAll || !expected.length) return false;
    const expectedNames = new Set(expected.map((field) => normalizeHeader(field.header)));
    const matchedNames = new Set();
    for (const header of rootElement.querySelectorAll(HEADER_SELECTOR)) {
      if (selectionRoot(header) !== rootElement) continue;
      if (!visible(header)) continue;
      const name = normalizeHeader(textFromHeaderElement(header));
      if (expectedNames.has(name)) matchedNames.add(name);
    }
    const hasPrimaryAnchor = Array.from(primaryHeaderNames(profile)).some((name) => matchedNames.has(name));
    const minimumMatches = expected.length === 1 ? 1 : 2;
    return hasPrimaryAnchor && matchedNames.size >= minimumMatches;
  }

  function closestCell(target) {
    if (!target || typeof target.closest !== "function") return null;
    let candidate = target.closest(CELL_SELECTOR);
    if (!candidate && COLUMN_TOKEN_SELECTOR) candidate = target.closest(COLUMN_TOKEN_SELECTOR);
    if (!candidate || !visible(candidate)) return null;
    if (candidate.tagName === "TH" || candidate.getAttribute("role") === "columnheader") return null;
    const hasColumnIdentity = Boolean(
      elementColumnIndex(candidate) ||
      attributeToken(candidate, COLUMN_TOKEN_ATTRIBUTES) ||
      cleanText(candidate.getAttribute("data-column-name"))
    );
    if (!hasColumnIdentity || !elementRowIdentity(candidate)) return null;
    return candidate;
  }

  function selectionEventCandidates(event, documentRef) {
    const candidates = [];
    if (typeof event?.composedPath === "function") candidates.push(...event.composedPath());
    if (event?.target) candidates.push(event.target);
    if (
      Number.isFinite(event?.clientX) &&
      Number.isFinite(event?.clientY) &&
      typeof documentRef?.elementsFromPoint === "function"
    ) {
      candidates.push(...documentRef.elementsFromPoint(event.clientX, event.clientY));
    }
    return candidates;
  }

  function cellFromSelectionEvent(event, documentRef, candidates = selectionEventCandidates(event, documentRef)) {
    for (const candidate of candidates) {
      const cell = closestCell(candidate);
      if (cell) return cell;
    }
    return null;
  }

  function headerFromReferences(documentRef, cell) {
    const ids = cleanText(cell.getAttribute("aria-labelledby") || cell.getAttribute("headers"));
    if (!ids) return "";
    for (const id of ids.split(/\s+/)) {
      const rootNode = cell.getRootNode?.();
      const referenced = rootNode?.getElementById?.(id) || documentRef.getElementById(id);
      if (!referenced) continue;
      const role = referenced.getAttribute("role");
      if (role === "columnheader" || referenced.tagName === "TH" || referenced.hasAttribute("aria-colindex")) {
        const label = textFromHeaderElement(referenced);
        if (label) return label;
      }
    }
    return "";
  }

  function profileOrdinalForHeader(profile, label) {
    const normalized = normalizeHeader(label);
    if (!normalized) return null;
    const matches = expectedColumns(profile).filter((field) => normalizeHeader(field.header) === normalized);
    return matches.length === 1 ? matches[0].ordinal : null;
  }

  function collectHeaderMap(documentRef, profile = null, scope = documentRef) {
    const map = new Map();
    const conflicts = new Set();
    const nativeByTable = new Map();
    const byColumnToken = new Map();
    const byColumnTokenValue = new Map();
    for (const header of scope.querySelectorAll(HEADER_SELECTOR)) {
      if (scope !== documentRef && selectionRoot(header) !== scope) continue;
      if (!visible(header)) continue;
      const physicalOrdinal = elementColumnIndex(header);
      const label = textFromHeaderElement(header);
      const ordinal = profileOrdinalForHeader(profile, label) || physicalOrdinal;
      if (!ordinal || !label) continue;
      const existing = map.get(ordinal);
      if (existing && normalizeHeader(existing) !== normalizeHeader(label)) conflicts.add(ordinal);
      else map.set(ordinal, label);

      const table = header.closest?.("table");
      if (table && physicalOrdinal) {
        if (!nativeByTable.has(table)) nativeByTable.set(table, new Map());
        nativeByTable.get(table).set(physicalOrdinal, { header: label, ordinal });
      }
      const token = attributeToken(header, COLUMN_TOKEN_ATTRIBUTES);
      if (token) {
        const mapped = { header: label, ordinal };
        byColumnToken.set(`${token.name}:${token.value}`, mapped);
        if (!byColumnTokenValue.has(token.value)) byColumnTokenValue.set(token.value, mapped);
        else byColumnTokenValue.set(token.value, null);
      }
    }
    return { map, conflicts, nativeByTable, byColumnToken, byColumnTokenValue };
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

  function resolveCellColumn(documentRef, cell, headers, profile) {
    const physicalOrdinal = elementColumnIndex(cell);
    const nativeTable = cell.closest?.("table");
    const nativeHeader = nativeTable && physicalOrdinal
      ? headers.nativeByTable.get(nativeTable)?.get(physicalOrdinal)
      : null;
    const columnToken = attributeToken(cell, COLUMN_TOKEN_ATTRIBUTES);
    const tokenHeader = columnToken
      ? headers.byColumnToken.get(`${columnToken.name}:${columnToken.value}`) ||
        headers.byColumnTokenValue.get(columnToken.value)
      : null;
    const explicitHeader = cleanText(cell.getAttribute("data-column-name")) ||
      headerFromReferences(documentRef, cell);
    let header = explicitHeader ||
      nativeHeader?.header ||
      tokenHeader?.header ||
      (!nativeTable ? headers.map.get(physicalOrdinal) : "") ||
      "";
    let ordinal = profileOrdinalForHeader(profile, header);

    if (!ordinal && nativeHeader?.ordinal) ordinal = nativeHeader.ordinal;
    if (!ordinal && tokenHeader?.ordinal) ordinal = tokenHeader.ordinal;
    if (!ordinal && physicalOrdinal) {
      const expected = expectedColumns(profile)[physicalOrdinal - 1];
      if (!expected || !header || normalizeHeader(expected.header) === normalizeHeader(header)) {
        ordinal = physicalOrdinal;
      }
    }
    if (!header && ordinal) header = headers.map.get(ordinal) || expectedColumns(profile)[ordinal - 1]?.header || "";
    return {
      header,
      ordinal,
      ignoredUtilityColumn: Boolean(nativeTable && !explicitHeader && !nativeHeader && !tokenHeader),
    };
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
      .find((element) => visible(element) && textFromHeaderElement(element));
    return textFromHeaderElement(heading) || cleanText(documentRef.title).replace(/\s*[-|]\s*Smartsheet.*$/i, "");
  }

  class DomRowAccumulator {
    constructor(documentRef, options = {}) {
      if (!documentRef) throw new Error("document is required");
      this.document = documentRef;
      this.window = options.window || documentRef.defaultView || root;
      this.profile = options.profile || null;
      this.selection = null;
      this.rowIndex = null;
      this.lastSelectionFailure = "no_active_row";
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
      if (this.selection && !trustedSelectionRoot(this.selection.root, this.profile)) {
        this.reset(null, "untrusted_semantic_root");
      }
      this.recalculate();
    }

    start() {
      if (this.started) return;
      this.started = true;
      this.document.addEventListener("pointerdown", this.onSelectionEvent, true);
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
      this.document.removeEventListener("pointerdown", this.onSelectionEvent, true);
      this.document.removeEventListener("focusin", this.onSelectionEvent, true);
      this.document.removeEventListener("click", this.onSelectionEvent, true);
      this.document.removeEventListener("scroll", this.onScroll, true);
      this.mutationObserver?.disconnect();
      this.mutationObserver = null;
      if (this.captureTimer) this.window.clearTimeout(this.captureTimer);
      this.captureTimer = null;
    }

    reset(selection = null, reason = "no_active_row") {
      this.selection = selection;
      this.rowIndex = selection?.rowIndex || null;
      this.lastSelectionFailure = selection ? null : reason;
      this.fields.clear();
      this.observedHeaders.clear();
      this.ambiguousReasons.clear();
      this.lastEvaluation = {
        state: selection ? "partial" : "ambiguous",
        missingColumns: expectedColumns(this.profile).map((field) => field.header),
        reasons: selection ? [] : [reason],
      };
    }

    selectCell(cell) {
      const row = elementRowIdentity(cell);
      const gridRoot = selectionRoot(cell);
      if (!row || !gridRoot) return false;
      if (!trustedSelectionRoot(gridRoot, this.profile)) {
        this.reset(null, "untrusted_semantic_root");
        return false;
      }
      const selection = {
        key: row.key,
        rowIndex: row.rowIndex,
        source: row.source,
        root: gridRoot,
        rowElement: row.rowElement || cell.closest?.('tr, [role="row"]') || null,
        rowAttributeName: row.attributeName || null,
        matchNativeRowIndex: row.source === "native-table" && row.rowIndex !== null,
      };
      if (selection.matchNativeRowIndex) selection.key = `native:${row.rowIndex}`;
      const changed = !this.selection || this.selection.key !== selection.key || this.selection.root !== selection.root;
      if (changed) this.reset(selection);
      else {
        this.selection = selection;
        this.rowIndex = selection.rowIndex || null;
        this.lastSelectionFailure = null;
      }
      this.captureVisibleRow();
      return true;
    }

    onSelectionEvent(event) {
      const candidates = selectionEventCandidates(event, this.document);
      const cell = cellFromSelectionEvent(event, this.document, candidates);
      if (cell) {
        this.selectCell(cell);
        return;
      }
      if (
        event?.type === "pointerdown" &&
        candidates.some((element) => element?.tagName === "CANVAS")
      ) {
        this.reset(null, "unsupported_canvas_grid");
      }
    }

    onScroll() {
      // A scroll event is only observed. The adapter never scrolls or clicks the page.
      this.scheduleCapture();
    }

    scheduleCapture() {
      if (!this.selection || this.captureTimer) return;
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
      const selectedNodes = this.document.querySelectorAll(
        '[aria-selected="true"], [aria-current="true"], [data-selected="true"]'
      );
      for (const selected of selectedNodes) {
        const cell = closestCell(selected) || closestCell(selected.querySelector?.(CELL_SELECTOR));
        if (cell) return this.selectCell(cell);
      }
      return false;
    }

    captureVisibleRow() {
      if (!this.selection && !this.discoverSelection()) return this.snapshot();

      const scope = this.selection?.root?.querySelectorAll ? this.selection.root : this.document;
      const headers = collectHeaderMap(this.document, this.profile, scope);
      const { conflicts } = headers;
      for (const ordinal of conflicts) this.ambiguousReasons.add(`header_conflict:${ordinal}`);

      const currentNativeRow = this.selection?.source === "native-table" && this.selection.root?.tagName === "TABLE"
        ? this.selection.root.rows?.[this.selection.rowIndex - 1]
        : null;
      const rawElements = currentNativeRow?.cells
        ? Array.from(currentNativeRow.cells)
        : Array.from(scope.querySelectorAll(`${CELL_SELECTOR}, ${COLUMN_TOKEN_SELECTOR}`));
      const elements = Array.from(new Set(rawElements.map((element) => closestCell(element) || element)));
      for (const element of elements) {
        if (!visible(element) || element.tagName === "TH" || element.getAttribute("role") === "columnheader") continue;
        if (selectionRoot(element) !== this.selection.root) continue;
        const identity = elementRowIdentity(element);
        if (!matchesSelectedRow(identity, this.selection)) continue;
        const location = resolveCellColumn(this.document, element, headers, this.profile);
        if (location.ignoredUtilityColumn) continue;
        const ordinal = location.ordinal;
        const header = location.header;
        const reasonKey = `unknown_header:${ordinal || "unmapped"}`;
        if (!header || !ordinal) {
          this.ambiguousReasons.add(reasonKey);
          continue;
        }
        this.ambiguousReasons.delete(reasonKey);
        for (const [existingKey, existingField] of this.fields.entries()) {
          if (existingField.ordinal === ordinal && normalizeHeader(existingField.header) !== normalizeHeader(header)) {
            this.fields.delete(existingKey);
          }
        }
        const value = valueFromElement(element);
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
      if (this.selection && this.rowIndex) rowHint.rowIndex = this.rowIndex;
      const primaryValue = findPrimaryValue(fields, this.profile);
      const ecnNumber = findEcnNumber(fields);
      if (primaryValue) rowHint.primaryValue = primaryValue;
      if (ecnNumber) rowHint.ecnNumber = ecnNumber;

      return {
        pageUrl: String(this.window?.location?.href || ""),
        sheetTitle: sheetTitle(this.document),
        rowHint,
        captureMode: "dom",
        captureState: this.selection ? this.lastEvaluation.state : "ambiguous",
        observedHeaders: Array.from(this.observedHeaders.entries())
          .sort((a, b) => a[0] - b[0])
          .map((entry) => entry[1]),
        fields,
        capturedAt: new Date().toISOString(),
        captureMeta: {
          missingColumns: this.lastEvaluation.missingColumns || [],
          unexpectedColumns: this.lastEvaluation.unexpectedColumns || [],
          reasons: this.selection
            ? (this.lastEvaluation.reasons || [])
            : [this.lastSelectionFailure || "no_active_row"],
        },
      };
    }

    diagnostics() {
      const scope = this.selection?.root?.querySelectorAll ? this.selection.root : this.document;
      const headers = collectHeaderMap(this.document, this.profile, scope);
      const allCells = Array.from(new Set(
        Array.from(scope.querySelectorAll(`${CELL_SELECTOR}, ${COLUMN_TOKEN_SELECTOR}`))
          .map((element) => closestCell(element) || element)
          .filter((element) => !this.selection || selectionRoot(element) === this.selection.root)
      ));
      const indexedCells = allCells.filter((element) => elementRowIdentity(element) && (
        elementColumnIndex(element) || attributeToken(element, COLUMN_TOKEN_ATTRIBUTES)
      ));
      const visibleSelectedCells = indexedCells.filter((element) => {
        const identity = elementRowIdentity(element);
        return visible(element) && matchesSelectedRow(identity, this.selection);
      });
      const datasetCells = allCells.filter((element) => attributeToken(element, COLUMN_TOKEN_ATTRIBUTES));
      const rowAttributeNames = new Set();
      const columnAttributeNames = new Set();
      for (const element of datasetCells) {
        const rowToken = attributeToken(element, ROW_TOKEN_ATTRIBUTES);
        const columnToken = attributeToken(element, COLUMN_TOKEN_ATTRIBUTES);
        if (rowToken) rowAttributeNames.add(rowToken.name);
        if (columnToken) columnAttributeNames.add(columnToken.name);
      }
      return {
        adapterVersion: ADAPTER_VERSION,
        generatedAt: new Date().toISOString(),
        host: String(this.window?.location?.host || ""),
        captureState: this.selection ? this.lastEvaluation.state : "ambiguous",
        selectedRowAvailable: Boolean(this.selection),
        selectedRowIndexAvailable: Boolean(this.rowIndex),
        aria: {
          columnHeaderCount: headers.map.size,
          conflictingHeaderIndexCount: headers.conflicts.size,
          indexedCellCount: indexedCells.length,
          selectedRowVisibleCellCount: visibleSelectedCells.length,
          selectedRowUnknownHeaderCount: visibleSelectedCells.filter((element) => {
            const location = resolveCellColumn(this.document, element, headers, this.profile);
            return !location.header || !location.ordinal;
          }).length,
        },
        semantic: {
          nativeTableCount: scope.querySelectorAll("table").length + (scope.tagName === "TABLE" ? 1 : 0),
          nativeHeaderCount: scope.querySelectorAll("th").length,
          nativeCellCount: scope.querySelectorAll("td").length,
          datasetCellCount: datasetCells.length,
          canvasCount: scope.querySelectorAll("canvas").length,
          lastSelectionSource: this.selection?.source || null,
          observedRowAttributeNames: Array.from(rowAttributeNames).sort(),
          observedColumnAttributeNames: Array.from(columnAttributeNames).sort(),
        },
        capturedColumnCount: this.fields.size,
        missingColumnCount: this.lastEvaluation.missingColumns?.length || 0,
        unexpectedColumnCount: this.lastEvaluation.unexpectedColumns?.length || 0,
        profileVersion: cleanText(this.profile?.version) || null,
        reasons: this.selection
          ? (this.lastEvaluation.reasons || [])
          : [this.lastSelectionFailure || "no_active_row"],
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
