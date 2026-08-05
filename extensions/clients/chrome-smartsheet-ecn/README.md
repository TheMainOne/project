# ECN Assistant for Smartsheet

Personal Chrome 116+ MV3 pilot for coordinating the ECN lifecycle from a selected Smartsheet row. It is a standalone extension; it does not share code or behavior with the Salesforce Compliance Assistant.

## Safety boundary

- Content scripts run only on the four exact Smartsheet application hosts declared in `manifest.json`.
- Page access is read-only. The content script adds event listeners and a `MutationObserver`; it never clicks, scrolls, edits, or injects UI into Smartsheet.
- The selected row snapshot is held transiently in memory and sent only when the user clicks Analyze. It is never written to Chrome storage.
- Authentication tokens and backend requests are owned by the background service worker. The refresh token uses `chrome.storage.session`, which is cleared when the browser session ends.
- The pilot contains no write scope and no controls for Status updates, Smartsheet comments, SAP actions, Salesforce campaigns, email, or notifications.
- Selector diagnostics contain ARIA/count metadata only (`containsCellValues: false`), not cell values, the sheet title, or the URL path.

## Install the unpacked pilot

1. Confirm the backend account has the `ecn_user` role.
2. In Chrome 116 or newer, open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select this directory: `extensions/clients/chrome-smartsheet-ecn`.
4. Open a sheet on an allowlisted Smartsheet app host and click the extension action. The panel will not open on other sites.
5. Sign in. The background requests only `ecn:read` and `ecn:analyze`.

The production API base is set in `src/background.js`. For local backend work, temporarily switch it to `http://localhost:3000/api/ecn/ext`; localhost is explicitly allowlisted by the manifest and no other backend hosts are permitted.

## First-time sheet mapping

The bundled backend profile is intentionally `needs_remap`. Until an anonymized export is checked and its column profile is confirmed, DOM and Paste captures cannot become `complete`.

In **Sheet profile & diagnostics**:

1. Paste exactly one exported TSV header row.
2. Click **Map headers**.
3. Verify the required primary key and every applicable canonical-field dropdown. Optional fields may remain unmapped; aliases suggest only unique exact matches. Duplicate display names remain distinct because bindings include their one-based ordinal (`Header#ordinal`).
4. Add explicit `live Status = lifecycle stage` lines for any Status values that differ from the ten internal lifecycle stages. This mapping never changes the original Smartsheet values.
5. Check the confirmation box and save.

Changing header order or adding an unknown column makes DOM capture `ambiguous` and prevents final readiness/closure output. A pasted row must contain exactly the same number of cells as `headerOrder`; otherwise analysis is blocked before any request is sent.

## DOM capture behavior

The adapter uses `role`, `aria-rowindex`, `aria-colindex`, `aria-labelledby`, `headers`, and accessible labels. It does not depend on Smartsheet CSS class names. Focus or click selects a row. Visible cells are accumulated while the user manually scrolls horizontally. Selecting a different `aria-rowindex` clears the accumulator.

`SheetContextAdapter` is the replaceable boundary. The current implementations are:

- `DomMessageSheetContextAdapter` for the read-only content-script bridge.
- `PasteRowSheetContextAdapter` for exact-order TSV fallback.

An official Smartsheet API adapter can be added later without changing Side Panel analysis/rendering.

## Developer checks

From the repository root:

```powershell
node --test test/ecnExtension.test.js
node --check extensions/clients/chrome-smartsheet-ecn/src/background.js
node --check extensions/clients/chrome-smartsheet-ecn/sidepanel/app.js
node extensions/clients/chrome-smartsheet-ecn/e2e/run.mjs
```

The synthetic ARIA grid used by tests is in `fixtures/synthetic-grid.html`. It covers partial visibility, horizontal accumulation, row changes, hidden columns, and duplicate-safe ordinals without using the real confidential sheet. The Playwright runner loads the unpacked extension, serves this fixture at an allowlisted Smartsheet URL, uses a local mocked ECN API, verifies RU/EN, DOM and TSV analysis, draft copying, and asserts that capture did not mutate the grid. Playwright cannot reliably click Chrome's toolbar action, so the runner opens the panel document directly and separately verifies `openPanelOnActionClick` plus the tab-specific enabled path through the service worker.

For headless-compatible Chromium builds, set `ECN_E2E_HEADLESS=1`; the default headed run is the most reliable way to exercise MV3 extensions locally.
