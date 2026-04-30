(function () {
  let currentPage = 1;
  let currentQ = "";
  let currentSort = { by: "name", dir: "asc" };

  const OUTREACH_BADGE = {
    sent: "badge-indigo",
    awaiting: "badge-amber",
    responded: "badge-green",
    overdue: "badge-red",
    closed: "badge-gray",
  };

  const OUTREACH_TOOLTIP = {
    sent:      "Email sent, waiting for supplier to respond",
    awaiting:  "Follow-up due — supplier has not responded yet",
    responded: "Supplier has replied",
    overdue:   "Follow-up deadline passed with no response",
    closed:    "Outreach closed",
  };

  const SORT_OPTIONS = [
    { value: "name",     label: "Name" },
    { value: "active",   label: "Active assertions" },
    { value: "outreach", label: "Last outreach" },
  ];

  function sortSuppliers(suppliers) {
    return [...suppliers].sort((a, b) => {
      let av, bv;
      if (currentSort.by === "name") {
        av = (a.supplierName || "").toLowerCase();
        bv = (b.supplierName || "").toLowerCase();
      } else if (currentSort.by === "active") {
        av = a.assertionCounts?.active ?? 0;
        bv = b.assertionCounts?.active ?? 0;
      } else if (currentSort.by === "outreach") {
        av = a.latestOutreach?.sentAt ? new Date(a.latestOutreach.sentAt).getTime() : 0;
        bv = b.latestOutreach?.sentAt ? new Date(b.latestOutreach.sentAt).getTime() : 0;
      }
      if (av < bv) return currentSort.dir === "asc" ? -1 : 1;
      if (av > bv) return currentSort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }

  function buildHTML() {
    return `
      <div class="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="search"
          id="suppliers-search"
          class="filter-input w-full max-w-sm"
          placeholder="Search by name or code…"
        />
        <div class="flex items-center gap-2 ml-auto">
          <label class="text-xs text-gray-500">Sort:</label>
          <select id="suppliers-sort" class="filter-select">
            ${SORT_OPTIONS.map(o => `<option value="${o.value}"${o.value === currentSort.by ? " selected" : ""}>${o.label}</option>`).join("")}
          </select>
          <button id="suppliers-sort-dir" class="pagination-btn text-xs" title="Toggle direction">
            ${currentSort.dir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mb-4 text-xs text-gray-400">
        <span class="font-medium text-gray-500">Outreach:</span>
        ${Object.entries(OUTREACH_TOOLTIP).map(([status, tip]) =>
          `<span class="status-badge ${OUTREACH_BADGE[status]} cursor-default" title="${tip}">${status}</span>`
        ).join("")}
      </div>
      <div id="suppliers-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>
      <div id="suppliers-pagination" class="flex items-center justify-between mt-6 text-sm text-gray-500"></div>
    `;
  }

  function renderGridSkeleton() {
    const grid = document.getElementById("suppliers-grid");
    grid.innerHTML = Array(6).fill(0).map(() => `
      <div class="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
        <div class="flex items-start justify-between gap-2">
          <div class="flex flex-col gap-1.5 flex-1">
            <div class="skel-line" style="width:65%"></div>
            <div class="skel-line" style="width:40%"></div>
          </div>
        </div>
        <div class="flex gap-2">
          <div class="skel-badge"></div>
          <div class="skel-badge"></div>
        </div>
        <div class="skel-line" style="width:55%"></div>
      </div>
    `).join("");
  }

  function renderGrid(suppliers) {
    const grid = document.getElementById("suppliers-grid");
    if (!suppliers.length) {
      grid.innerHTML = '<p class="text-gray-400 text-sm col-span-3 text-center py-10">No suppliers found.</p>';
      return;
    }
    grid.innerHTML = suppliers.map(s => {
      const active = s.assertionCounts?.active ?? 0;
      const expired = s.assertionCounts?.expired ?? 0;
      const total = s.assertionCounts?.total ?? 0;
      const outreach = s.latestOutreach;

      return `
        <div class="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="font-semibold text-gray-800 text-sm">${esc(s.supplierName)}</div>
              <div class="text-xs font-mono text-gray-400 mt-0.5">${esc(s.supplierCode)}</div>
            </div>
            ${outreach
              ? `<span class="status-badge ${OUTREACH_BADGE[outreach.status] || "badge-gray"} shrink-0 cursor-default" title="${OUTREACH_TOOLTIP[outreach.status] || outreach.status}">${outreach.status}</span>`
              : ""}
          </div>
          <div class="flex gap-2 flex-wrap">
            <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              ${active} active
            </span>
            ${expired > 0 ? `<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">${expired} expired</span>` : ""}
            ${total > 0 ? `<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">${total} total</span>` : ""}
          </div>
          <div class="text-xs text-gray-400">
            ${s.contactCount ?? 0} contact${s.contactCount !== 1 ? "s" : ""}
            ${outreach ? ` · Last outreach ${formatDate(outreach.sentAt)}` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  function renderPagination(total, page, pages) {
    const el = document.getElementById("suppliers-pagination");
    if (!el) return;
    el.innerHTML = `
      <span>${total} supplier${total !== 1 ? "s" : ""}</span>
      <div class="flex gap-2">
        <button id="sup-prev" class="pagination-btn" ${page <= 1 ? "disabled" : ""}>← Prev</button>
        <span class="px-2 py-1 text-xs">Page ${page} / ${pages || 1}</span>
        <button id="sup-next" class="pagination-btn" ${page >= pages ? "disabled" : ""}>Next →</button>
      </div>
    `;
    el.querySelector("#sup-prev")?.addEventListener("click", () => { currentPage--; load(); });
    el.querySelector("#sup-next")?.addEventListener("click", () => { currentPage++; load(); });
  }

  async function load() {
    renderGridSkeleton();
    const params = { page: currentPage, limit: 24 };
    if (currentQ) params.q = currentQ;
    try {
      const data = await API.get("/api/compliance-dashboard/suppliers" + API.buildQuery(params));
      const sorted = sortSuppliers(data.suppliers || []);
      renderGrid(sorted);
      renderPagination(data.total, data.page, Math.ceil(data.total / 24));
    } catch (e) {
      document.getElementById("suppliers-grid").innerHTML =
        `<p class="text-red-500 text-sm col-span-3 text-center py-10">Error: ${e.message}</p>`;
    }
  }

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function formatDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  window.initSuppliers = function () {
    const section = document.getElementById("section-suppliers");
    section.innerHTML = buildHTML();
    currentPage = 1;
    currentQ = "";

    document.getElementById("suppliers-search")?.addEventListener(
      "input",
      API.debounce((e) => {
        currentQ = e.target.value.trim();
        currentPage = 1;
        load();
      }, 300)
    );

    document.getElementById("suppliers-sort")?.addEventListener("change", (e) => {
      currentSort.by = e.target.value;
      currentPage = 1;
      load();
    });

    document.getElementById("suppliers-sort-dir")?.addEventListener("click", () => {
      currentSort.dir = currentSort.dir === "asc" ? "desc" : "asc";
      document.getElementById("suppliers-sort-dir").textContent =
        currentSort.dir === "asc" ? "↑ Asc" : "↓ Desc";
      load();
    });

    load();
  };
})();
