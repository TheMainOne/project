(function () {
  let currentPage = 1;
  let currentFilters = { status: "all", dateFrom: "", dateTo: "" };

  const STATUS_BADGE = {
    new: "badge-indigo",
    in_progress: "badge-amber",
    pending_supplier: "badge-violet",
    resolved: "badge-green",
    closed: "badge-gray",
  };

  const STATUS_LABEL = {
    new: "New",
    in_progress: "In Progress",
    pending_supplier: "Pending Supplier",
    resolved: "Resolved",
    closed: "Closed",
  };

  function buildHTML() {
    return `
      <div class="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label class="block text-xs text-gray-500 mb-1">Status</label>
          <select id="cases-status" class="filter-select">
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="pending_supplier">Pending Supplier</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" id="cases-date-from" class="filter-input" />
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" id="cases-date-to" class="filter-input" />
        </div>
        <button id="cases-reset" class="text-xs text-gray-400 hover:text-gray-600 underline self-end pb-1">Reset</button>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div id="cases-table-wrap"></div>
      </div>
      <div id="cases-pagination" class="flex items-center justify-between mt-4 text-sm text-gray-500"></div>
    `;
  }

  function renderTableSkeleton() {
    const wrap = document.getElementById("cases-table-wrap");
    const skelRow = () => `
      <tr>
        <td class="px-4 py-3"><div class="skel-line" style="width:5rem"></div></td>
        <td class="px-4 py-3"><div class="skel-line" style="width:75%"></div></td>
        <td class="px-4 py-3"><div class="skel-badge"></div></td>
        <td class="px-4 py-3"><div class="skel-line" style="width:1.5rem"></div></td>
        <td class="px-4 py-3"><div class="skel-line" style="width:1.5rem"></div></td>
        <td class="px-4 py-3"><div class="skel-line" style="width:4rem"></div></td>
        <td class="px-4 py-3"><div class="skel-line" style="width:5rem"></div></td>
      </tr>
    `;
    wrap.innerHTML = `
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr class="text-left text-xs text-gray-500">
            <th class="px-4 py-3 font-medium">SF Case ID</th>
            <th class="px-4 py-3 font-medium">Subject</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Materials</th>
            <th class="px-4 py-3 font-medium">Regulations</th>
            <th class="px-4 py-3 font-medium">Assignee</th>
            <th class="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${Array(5).fill(0).map(skelRow).join("")}
        </tbody>
      </table>
    `;
  }

  function renderTable(cases) {
    const wrap = document.getElementById("cases-table-wrap");
    if (!cases.length) {
      wrap.innerHTML = '<p class="text-gray-400 text-sm text-center py-10">No cases found.</p>';
      return;
    }
    wrap.innerHTML = `
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr class="text-left text-xs text-gray-500">
            <th class="px-4 py-3 font-medium">SF Case ID</th>
            <th class="px-4 py-3 font-medium">Subject</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Materials</th>
            <th class="px-4 py-3 font-medium">Regulations</th>
            <th class="px-4 py-3 font-medium">Assignee</th>
            <th class="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          ${cases.map(c => `
            <tr class="hover:bg-gray-50 transition">
              <td class="px-4 py-3 font-mono text-xs text-indigo-600">${c.sfCaseId}</td>
              <td class="px-4 py-3 text-gray-800 max-w-xs truncate" title="${esc(c.subject)}">${esc(c.subject)}</td>
              <td class="px-4 py-3"><span class="status-badge ${STATUS_BADGE[c.status] || "badge-gray"}">${STATUS_LABEL[c.status] || c.status}</span></td>
              <td class="px-4 py-3 text-gray-500">${c.requestedMaterials?.length ?? 0}</td>
              <td class="px-4 py-3 text-gray-500">${c.detectedRegulations?.length ?? 0}</td>
              <td class="px-4 py-3 text-gray-500">${c.assignee || "—"}</td>
              <td class="px-4 py-3 text-gray-400 text-xs">${formatDate(c.createdAt)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderPagination(total, page, pages) {
    const el = document.getElementById("cases-pagination");
    if (!el) return;
    el.innerHTML = `
      <span>${total} case${total !== 1 ? "s" : ""}</span>
      <div class="flex gap-2">
        <button id="cases-prev" class="pagination-btn" ${page <= 1 ? "disabled" : ""}>← Prev</button>
        <span class="px-2 py-1 text-xs">Page ${page} / ${pages || 1}</span>
        <button id="cases-next" class="pagination-btn" ${page >= pages ? "disabled" : ""}>Next →</button>
      </div>
    `;
    el.querySelector("#cases-prev")?.addEventListener("click", () => { currentPage--; load(); });
    el.querySelector("#cases-next")?.addEventListener("click", () => { currentPage++; load(); });
  }

  async function load() {
    renderTableSkeleton();
    const params = { page: currentPage, limit: 25, ...currentFilters };
    try {
      const data = await API.get("/api/compliance-dashboard/cases" + API.buildQuery(params));
      renderTable(data.cases || []);
      renderPagination(data.total, data.page, data.pages);
    } catch (e) {
      document.getElementById("cases-table-wrap").innerHTML =
        `<p class="text-red-500 text-sm p-4">Error: ${e.message}</p>`;
    }
  }

  function bindFilters() {
    const status = document.getElementById("cases-status");
    const from = document.getElementById("cases-date-from");
    const to = document.getElementById("cases-date-to");
    const reset = document.getElementById("cases-reset");

    status?.addEventListener("change", () => {
      currentFilters.status = status.value;
      currentPage = 1;
      load();
    });
    from?.addEventListener("change", () => {
      currentFilters.dateFrom = from.value;
      currentPage = 1;
      load();
    });
    to?.addEventListener("change", () => {
      currentFilters.dateTo = to.value;
      currentPage = 1;
      load();
    });
    reset?.addEventListener("click", () => {
      currentFilters = { status: "all", dateFrom: "", dateTo: "" };
      currentPage = 1;
      status.value = "all";
      from.value = "";
      to.value = "";
      load();
    });
  }

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function formatDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  window.initCases = function () {
    const section = document.getElementById("section-cases");
    section.innerHTML = buildHTML();
    bindFilters();
    currentPage = 1;
    load();
  };
})();
