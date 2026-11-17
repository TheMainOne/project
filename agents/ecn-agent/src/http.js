import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function createPanelServer({ config, store, monitor }) {
  const files = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
    ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ]);
  const assets = new Map([...files].map(([url, [file, type]]) => [
    url, { type, body: readFileSync(join(config.publicDirectory, file)) },
  ]));

  function sendJson(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  }

  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try {
      const port = req.socket.localPort;
      const allowedHosts = new Set(["127.0.0.1:" + port, "localhost:" + port]);
      if (!allowedHosts.has(req.headers.host)) {
        return sendJson(res, 403, { error: "Открой панель по локальному адресу." });
      }
      const origin = "http://" + req.headers.host;
      if (
        (req.headers.origin && req.headers.origin !== origin) ||
        req.headers["sec-fetch-site"] === "cross-site"
      ) {
        return sendJson(res, 403, { error: "Запрос разрешён только из локальной панели." });
      }
      const url = new URL(req.url, origin);
      if (req.method === "GET" && assets.has(url.pathname)) {
        const asset = assets.get(url.pathname);
        res.writeHead(200, { "Content-Type": asset.type });
        res.end(asset.body);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/state") {
        return sendJson(res, 200, {
          sheetId: config.sheetId,
          tokenConfigured: Boolean(config.token),
          pollSeconds: config.pollSeconds,
          mode: "observe",
          ...store.state(),
          monitor: monitor.status(),
        });
      }
      if (req.method === "GET" && /^\/api\/rows\/[1-9]\d*$/.test(url.pathname)) {
        const row = store.row(url.pathname.split("/").at(-1));
        return sendJson(res, row ? 200 : 404, row || { error: "Строка отсутствует в последнем снимке ECF." });
      }
      if (req.method === "POST" && ["/api/sync", "/api/pause", "/api/resume"].includes(url.pathname)) {
        if (req.headers.origin !== origin || req.headers["x-ecn-ui"] !== "1") {
          return sendJson(res, 403, { error: "Используй кнопки локальной панели." });
        }
        if (!config.token) {
          return sendJson(res, 409, { error: "Заполни SMARTSHEET_API_TOKEN в .env и перезапусти приложение." });
        }
        if (url.pathname === "/api/sync") void monitor.sync();
        else monitor.setPaused(url.pathname === "/api/pause");
        return sendJson(res, 202, { ok: true });
      }
      return sendJson(res, 404, { error: "Маршрут не найден." });
    } catch {
      return sendJson(res, 500, { error: "Ошибка локальной панели. Проверь доступ к папке data." });
    }
  });
}
