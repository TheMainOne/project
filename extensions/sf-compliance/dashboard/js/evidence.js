(function () {
  let currentPage = 1;
  let currentFilters = { supplierCode: "", regulation: "", status: "all" };

  function expiryClass(validTo, status) {
    if (status === "expired") return "expiry-badge expiry-red";
    if (!validTo) return "";
    const diff = new Date(validTo) - Date.now();
    const days = diff / (1000 * 60 * 60 * 24);
    if (days < 0) return "expiry-badge expiry-red";
    if (days <= 30) return "expiry-badge expiry-amber";
    return "expiry-badge expiry-green";
  }

  function buildHTML(regulations) {
    const regOptions = regulations.map(r =>
      `<option value="${esc(r.code)}">${esc(r.code)} — ${esc(r.name)}</option>`
    ).join("");

    return `
      <div class="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label class="block text-xs text-gray-500 mb-1">Supplier Code</label>
          <input type="text" id="ev-supplier" class="filter-input" placeholder="e.g. SUPP001" />
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Regulation</label>
          <select id="ev-regulation" class="filter-select">
            <option value="">All regulations</option>
            ${regOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Status</label>
          <select id="ev-status" class="filter-select">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="superseded">Superseded</option>
          </select>
        </div>
        <button id="ev-reset" class="text-xs text-gray-400 hover:text-gray-600 underline self-end pb-1">Reset</button>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div id="ev-table-wrap"></div>
      </div>
      <div id="ev-pagination" class="flex items-center justify-between mt-4 text-sm text-gray-500"></div>
    `;
  }

  function renderTable(evidence) {
    const wrap = document.getElementById("ev-table-wrap");
    if (!evidence.length) {
      wrap.innerHTML = '<p class="text-gray-400 text-sm text-center py-10">No evidence records found.</p>';
      return;
    }
    wrap.innerHTML = `
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr class="text-left text-xs text-gray-500">
            <th class="px-4 py-3 font-medium">Supplier</th>
            <th class="px-4 py-3 font-medium">Regulation</th>
            <th class="px-4 py-3 font-medium">Evidence Type</th>
            <th class="px-4 py-3 font-medium">Material</th>
            <th class="px-4 py-3 font-medium">Valid From</th>
            <th class="px-4 py-3 font-medium">Expires</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Jurisdiction</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          ${evidence.map(e => `
            <tr class="hover:bg-gray-50 transition">
              <td class="px-4 py-2.5 font-mono text-xs text-gray-700">${esc(e.supplierCode) || "—"}</td>
              <td class="px-4 py-2.5 text-gray-800">${esc(e.regulation) || "—"}</td>
              <td class="px-4 py-2.5 text-gray-500 text-xs">${esc(e.evidenceType) || "—"}</td>
              <td class="px-4 py-2.5 text-gray-500 font-mono text-xs">${esc(e.materialCode) || "—"}</td>
              <td class="px-4 py-2.5 text-gray-400 text-xs">${formatDate(e.validFrom)}</td>
              <td class="px-4 py-2.5"><span class="${expiryClass(e.validTo, e.status)}">${formatDate(e.validTo)}</span></td>
              <td class="px-4 py-2.5"><span class="status-badge ${e.status === 'active' ? 'badge-green' : e.status === 'expired' ? 'badge-red' : 'badge-gray'}">${e.status}</span></td>
              <td class="px-4 py-2.5 text-gray-400 text-xs">${esc(e.jurisdiction) || "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderPagination(total, page, pages) {
    const el = document.getElementById("ev-pagination");
    if (!el) return;
    el.innerHTML = `
      <span>${total} record${total !== 1 ? "s" : ""}</span>
      <div class="flex gap-2">
        <button id="ev-prev" class="pagination-btn" ${page <= 1 ? "disabled" : ""}>← Prev</button>
        <span class="px-2 py-1 text-xs">Page ${page} / ${pages || 1}</span>
        <button id="ev-next" class="pagination-btn" ${page >= pages ? "disabled" : ""}>Next →</button>
      </div>
    `;
    el.querySelector("#ev-prev")?.addEventListener("click", () => { currentPage--; load(); });
    el.querySelector("#ev-next")?.addEventListener("click", () => { currentPage++; load(); });
  }

  async function load() {
    const params = { page: currentPage, limit: 25 };
    if (currentFilters.supplierCode) params.supplierCode = currentFilters.supplierCode;
    if (currentFilters.regulation) params.regulation = currentFilters.regulation;
    if (currentFilters.status && currentFilters.status !== "all") params.status = currentFilters.status;

    API.loader(true);
    try {
      const data = await API.get("/api/compliance-dashboard/evidence" + API.buildQuery(params));
      renderTable(data.evidence || []);
      renderPagination(data.total, data.page, data.pages);
    } catch (e) {
      document.getElementById("ev-table-wrap").innerHTML =
        `<p class="text-red-500 text-sm p-4">Error: ${e.message}</p>`;
    } finally {
      API.loader(false);
    }
  }

  function bindFilters() {
    const supplierInput = document.getElementById("ev-supplier");
    const regSelect = document.getElementById("ev-regulation");
    const statusSelect = document.getElementById("ev-status");
    const reset = document.getElementById("ev-reset");

    supplierInput?.addEventListener("input", API.debounce((e) => {
      currentFilters.supplierCode = e.target.value.trim();
      currentPage = 1;
      load();
    }, 300));

    regSelect?.addEventListener("change", () => {
      currentFilters.regulation = regSelect.value;
      currentPage = 1;
      load();
    });

    statusSelect?.addEventListener("change", () => {
      currentFilters.status = statusSelect.value;
      currentPage = 1;
      load();
    });

    reset?.addEventListener("click", () => {
      currentFilters = { supplierCode: "", regulation: "", status: "all" };
      currentPage = 1;
      supplierInput.value = "";
      regSelect.value = "";
      statusSelect.value = "all";
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

  window.initEvidence = async function () {
    const section = document.getElementById("section-evidence");
    section.innerHTML = '<div class="text-gray-400 text-sm py-4">Loading…</div>';
    currentPage = 1;
    currentFilters = { supplierCode: "", regulation: "", status: "all" };

    let regulations = [];
    try {
      const data = await API.get("/api/compliance-dashboard/regulations");
      regulations = data.regulations || [];
    } catch (_) {}

    section.innerHTML = buildHTML(regulations);
    bindFilters();
    load();
  };
})();
