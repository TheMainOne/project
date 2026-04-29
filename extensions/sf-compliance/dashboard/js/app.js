(function () {
  const ROUTES = {
    "#overview":   { section: "overview",   init: () => window.initOverview() },
    "#cases":      { section: "cases",      init: () => window.initCases() },
    "#suppliers":  { section: "suppliers",  init: () => window.initSuppliers() },
    "#evidence":   { section: "evidence",   init: () => window.initEvidence() },
  };

  const ALL_SECTIONS = ["overview", "cases", "suppliers", "evidence"];

  function showSection(name) {
    ALL_SECTIONS.forEach(s => {
      document.getElementById("section-" + s)?.classList.toggle("hidden", s !== name);
    });
  }

  function updateNavTabs(hash) {
    document.querySelectorAll(".nav-tab").forEach(tab => {
      const active = tab.getAttribute("href") === hash;
      tab.classList.toggle("nav-tab-active", active);
    });
  }

  function navigate() {
    const hash = location.hash || "#overview";
    const route = ROUTES[hash] || ROUTES["#overview"];
    showSection(route.section);
    updateNavTabs(hash === "#overview" || !ROUTES[hash] ? "#overview" : hash);
    route.init();
  }

  function setupAuth() {
    const overlay = document.getElementById("auth-overlay");
    const input = document.getElementById("token-input");
    const btn = document.getElementById("token-submit");
    const err = document.getElementById("token-error");
    const logout = document.getElementById("logout-btn");

    if (!API.isAuthenticated()) {
      overlay.classList.remove("hidden");
    }

    btn?.addEventListener("click", () => {
      const val = input?.value.trim();
      if (!val) {
        err.classList.remove("hidden");
        return;
      }
      err.classList.add("hidden");
      API.saveToken(val);
      overlay.classList.add("hidden");
      navigate();
    });

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") btn?.click();
    });

    logout?.addEventListener("click", () => {
      API.clearToken();
      window.location.reload();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupAuth();
    if (API.isAuthenticated()) navigate();
  });

  window.addEventListener("hashchange", () => {
    if (API.isAuthenticated()) navigate();
  });
})();
