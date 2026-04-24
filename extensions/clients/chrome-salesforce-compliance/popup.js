document.getElementById("openBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("status");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      statusEl.textContent = "Could not detect current tab.";
      statusEl.className = "status error";
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" });
    } catch {
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

// ── Dashboard ──────────────────────────────────────────────

function formatReminderTime(remindAt) {
  const now = Date.now();
  const ts = typeof remindAt === "number" ? remindAt : new Date(remindAt).getTime();
  const delta = ts - now;
  const abs = Math.abs(delta);
  const mins = Math.floor(abs / 60000);
  const hours = Math.floor(abs / 3600000);
  const days = Math.floor(abs / 86400000);

  if (delta < 0) return { label: "overdue", cls: "overdue" };
  if (hours < 2) return { label: `${mins}m`, cls: "soon" };
  if (hours < 24) return { label: `${hours}h`, cls: "soon" };
  if (days === 1) return { label: "tomorrow", cls: "" };
  return { label: `${days}d`, cls: "" };
}

function renderReminders(reminders) {
  const el = document.getElementById("remindersBody");
  const entries = Object.entries(reminders || {});

  if (entries.length === 0) {
    el.innerHTML = '<div class="empty-note">No active reminders</div>';
    return;
  }

  const sorted = entries
    .map(([id, r]) => ({ id, ...r, ts: typeof r.remindAt === "number" ? r.remindAt : new Date(r.remindAt).getTime() }))
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 4);

  el.innerHTML = "";
  sorted.forEach(({ supplierName, subject, ts }) => {
    const { label, cls } = formatReminderTime(ts);
    const row = document.createElement("div");
    row.className = "reminder-row";

    const name = document.createElement("div");
    name.className = "reminder-name";
    name.title = subject || supplierName;
    name.textContent = supplierName || subject || "—";

    const time = document.createElement("div");
    time.className = `reminder-time${cls ? " " + cls : ""}`;
    time.textContent = label;

    row.appendChild(name);
    row.appendChild(time);
    el.appendChild(row);
  });
}

function progressClass(pct) {
  if (pct < 50) return "danger";
  if (pct < 75) return "warn";
  return "";
}

function renderMetrics(snapshots) {
  const el = document.getElementById("metricsBody");

  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    el.innerHTML = '<div class="empty-note">No data yet — open a case</div>';
    return;
  }

  const latest = snapshots[0];
  const compliance = Math.round(latest.compliancePercent ?? 0);
  const coverage = Math.round(latest.coveragePercent ?? 0);
  const total = latest.totalSuppliers ?? 0;

  const rows = [
    { label: "Suppliers", value: total, bar: null },
    { label: "Compliant", value: compliance + "%", bar: compliance },
    { label: "Coverage", value: coverage + "%", bar: coverage },
  ];

  el.innerHTML = "";
  rows.forEach(({ label, value, bar }) => {
    const row = document.createElement("div");
    row.className = "metric-row";

    const lbl = document.createElement("div");
    lbl.className = "metric-label";
    lbl.textContent = label;

    const right = document.createElement("div");
    right.className = "metric-right";

    const val = document.createElement("div");
    val.className = "metric-value";
    val.textContent = value;
    right.appendChild(val);

    if (bar !== null) {
      const track = document.createElement("div");
      track.className = "progress-bar";
      const fill = document.createElement("div");
      fill.className = `progress-fill${progressClass(bar) ? " " + progressClass(bar) : ""}`;
      fill.style.width = bar + "%";
      track.appendChild(fill);
      right.appendChild(track);
    }

    row.appendChild(lbl);
    row.appendChild(right);
    el.appendChild(row);
  });
}

async function loadDashboard() {
  const authBadge = document.getElementById("authBadge");
  const dashboard = document.getElementById("dashboard");

  try {
    const auth = await chrome.runtime.sendMessage({ type: "AUTH_GET_STATE" });

    if (!auth?.authenticated) {
      authBadge.textContent = "Not signed in";
      authBadge.className = "auth-badge";
      return;
    }

    authBadge.textContent = auth.lastEmail || "Connected";
    authBadge.className = "auth-badge connected";
    dashboard.style.display = "block";

    const [remindersRes, snapshotsRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: "EXT_GET_REMINDERS" }),
      chrome.runtime.sendMessage({ type: "EXT_GET_COMPLIANCE_SNAPSHOTS" }),
    ]);

    renderReminders(remindersRes?.reminders || {});
    renderMetrics(snapshotsRes?.snapshots || []);
  } catch {
    authBadge.textContent = "—";
  }
}

loadDashboard();
