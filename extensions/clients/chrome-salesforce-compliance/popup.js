document.getElementById("openBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("status");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      statusEl.textContent = "Could not detect current tab.";
      statusEl.className = "status error";
      return;
    }

    // Try sending message to already-injected content script
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" });
    } catch {
      // Content script not yet on this page — inject it first, then retry
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content-script.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" });
    }

    window.close();
  } catch (e) {
    statusEl.textContent = "Could not open on this page (e.g. chrome:// pages are restricted).";
    statusEl.className = "status error";
  }
});
