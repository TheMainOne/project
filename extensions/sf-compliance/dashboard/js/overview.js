(function () {
  let caseChart = null;
  let assertionChart = null;

  const STATUS_COLORS = {
    new: "#6366f1",
    in_progress: "#f59e0b",
    pending_supplier: "#8b5cf6",
    resolved: "#10b981",
    closed: "#6b7280",
  };

  const STATUS_LABELS = {
    new: "New",
    in_progress: "In Progress",
    pending_supplier: "Pending Supplier",
    resolved: "Resolved",
    closed: "Closed",
  };

  const ASSERTION_COLORS = {
    compliant: "#10b981",
    free_from: "#06b6d4",
    contains: "#f59e0b",
    non_compliant: "#ef4444",
    partial: "#f97316",
    informational: "#6b7280",
  };

  function renderStatCards(stats, el) {
    el.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        ${statCard("Total Cases", stats.cases.total, "indigo")}
        ${statCard("Active Evidence", stats.evidence.active, "emerald")}
        ${statCard("Expiring ≤30d", stats.evidence.expiringSoon, "amber", stats.evidence.expiringSoon > 0 ? "warn" : "")}
        ${statCard("Overdue Outreach", stats.outreach.overdue, "red", stats.outreach.overdue > 0 ? "warn" : "")}
        ${statCard("Suppliers", stats.suppliers.total, "violet")}
      </div>
    `;
  }

  function statCard(label, value, color, modifier) {
    const colors = {
      indigo: "bg-indigo-50 text-indigo-700",
      emerald: "bg-emerald-50 text-emerald-700",
      amber: modifier === "warn" ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-700",
      red: modifier === "warn" ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-700",
      violet: "bg-violet-50 text-violet-700",
    };
    return `
      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <div class="text-2xl font-bold ${colors[color]}">${value}</div>
        <div class="text-xs text-gray-500 mt-1">${label}</div>
      </div>
    `;
  }

  function renderCaseChart(stats, container) {
    const canvas = container.querySelector("#chart-cases");
    const entries = Object.entries(stats.cases.byStatus).filter(([, v]) => v > 0);
    if (!entries.length) {
      canvas.parentElement.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">No case data</p>';
      return;
    }
    if (caseChart) { caseChart.destroy(); caseChart = null; }
    caseChart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: entries.map(([k]) => STATUS_LABELS[k] || k),
        datasets: [{
          data: entries.map(([, v]) => v),
          backgroundColor: entries.map(([k]) => STATUS_COLORS[k] || "#94a3b8"),
          borderWidth: 2,
          borderColor: "#fff",
        }],
      },
      options: {
        cutout: "65%",
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
        maintainAspectRatio: true,
      },
    });
  }

  function renderAssertionChart(stats, container) {
    const canvas = container.querySelector("#chart-assertions");
    const entries = Object.entries(stats.assertions.byType).filter(([, v]) => v > 0);
    if (!entries.length) {
      canvas.parentElement.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">No assertion data</p>';
      return;
    }
    if (assertionChart) { assertionChart.destroy(); assertionChart = null; }
    assertionChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: entries.map(([k]) => k.replace(/_/g, " ")),
        datasets: [{
          label: "Assertions",
          data: entries.map(([, v]) => v),
          backgroundColor: entries.map(([k]) => ASSERTION_COLORS[k] || "#94a3b8"),
          borderRadius: 4,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
          x: { ticks: { font: { size: 11 } } },
        },
        maintainAspectRatio: true,
      },
    });
  }

  function renderExpiringTable(evidence, container) {
    const el = container.querySelector("#expiring-list");
    if (!evidence.length) {
      el.innerHTML = '<p class="text-sm text-gray-400 py-4 text-center">No evidence expiring within 30 days.</p>';
      return;
    }
    el.innerHTML = `
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-400 text-xs border-b border-gray-100">
            <th class="pb-2 font-medium">Supplier</th>
            <th class="pb-2 font-medium">Regulation</th>
            <th class="pb-2 font-medium">Type</th>
            <th class="pb-2 font-medium">Expires</th>
          </tr>
        </thead>
        <tbody>
          ${evidence.map(e => `
            <tr class="border-b border-gray-50 hover:bg-gray-50">
              <td class="py-2 pr-3 font-mono text-xs">${e.supplierCode || "—"}</td>
              <td class="py-2 pr-3">${e.regulation || "—"}</td>
              <td class="py-2 pr-3 text-gray-500">${e.evidenceType || "—"}</td>
              <td class="py-2"><span class="expiry-badge expiry-amber">${formatDate(e.validTo)}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function formatDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function buildHTML() {
    return `
      <div id="overview-stats"></div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h3 class="text-sm font-medium text-gray-700 mb-4">Cases by Status</h3>
          <div class="relative h-52"><canvas id="chart-cases"></canvas></div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h3 class="text-sm font-medium text-gray-700 mb-4">Assertions by Type</h3>
          <div class="relative h-52"><canvas id="chart-assertions"></canvas></div>
        </div>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <h3 class="text-sm font-medium text-gray-700 mb-4">Evidence Expiring Within 30 Days</h3>
        <div id="expiring-list"></div>
      </div>
    `;
  }

  window.initOverview = async function () {
    const section = document.getElementById("section-overview");
    section.innerHTML = buildHTML();

    API.loader(true);
    try {
      const [stats, expiring] = await Promise.all([
        API.get("/api/compliance-dashboard/stats"),
        API.get("/api/compliance-dashboard/evidence?expiringDays=30&limit=10"),
      ]);
      renderStatCards(stats, section);
      // re-render charts after stat cards replaced the grid
      section.innerHTML = buildHTML();
      renderStatCards(stats, section);
      renderCaseChart(stats, section);
      renderAssertionChart(stats, section);
      renderExpiringTable(expiring.evidence || [], section);
    } catch (e) {
      section.innerHTML = `<p class="text-red-500 text-sm">Failed to load overview: ${e.message}</p>`;
    } finally {
      API.loader(false);
    }
  };
})();
