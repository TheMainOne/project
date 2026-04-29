(function () {
  const TOKEN_KEY = "accessToken";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  async function request(method, path, body) {
    const token = getToken();
    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(path, opts);

    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.reload();
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }

    return res.json();
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function buildQuery(params) {
    const q = Object.entries(params)
      .filter(([, v]) => v !== "" && v !== null && v !== undefined)
      .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
      .join("&");
    return q ? "?" + q : "";
  }

  function loader(show) {
    const el = document.getElementById("global-loader");
    if (el) el.classList.toggle("hidden", !show);
  }

  window.API = {
    TOKEN_KEY,
    getToken,
    isAuthenticated: () => !!getToken(),
    saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
    clearToken: () => localStorage.removeItem(TOKEN_KEY),
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    debounce,
    buildQuery,
    loader,
  };
})();
