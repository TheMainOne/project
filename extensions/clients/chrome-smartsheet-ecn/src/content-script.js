(function startEcnContentScript() {
  "use strict";

  if (!globalThis.EcnCaptureCore || typeof chrome === "undefined" || !chrome.runtime) return;

  const adapter = new globalThis.EcnCaptureCore.DomRowAccumulator(document, { window });
  adapter.start();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender?.id !== chrome.runtime.id) return false;
    switch (message?.type) {
      case "ECN_SET_SHEET_PROFILE":
        adapter.setProfile(message.profile || null);
        sendResponse({ ok: true });
        return false;
      case "ECN_CAPTURE_SELECTED_ROW":
        sendResponse({ ok: true, snapshot: adapter.captureVisibleRow() });
        return false;
      case "ECN_SELECTOR_DIAGNOSTICS":
        sendResponse({ ok: true, diagnostics: adapter.diagnostics() });
        return false;
      case "ECN_CONTENT_PING":
        sendResponse({ ok: true, adapterVersion: globalThis.EcnCaptureCore.ADAPTER_VERSION });
        return false;
      default:
        return false;
    }
  });
})();
