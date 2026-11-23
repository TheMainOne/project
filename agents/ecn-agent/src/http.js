import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SmartsheetError } from "./smartsheet.js";
import { CommentRequestError, OPERATION_ID } from "./comment-service.js";
import { MAX_ATTACHMENT_BYTES } from "./smartsheet-write.js";

import { AiError } from "./ai/reviews.js";

export function createPanelServer({ config, store, monitor, reader, comments, reviews }) {
  const files = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
    ["/review.js", ["review.js", "text/javascript; charset=utf-8"]],
    ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ]);
  const assets = new Map([...files].map(([url, [file, type]]) => [
    url, { type, body: readFileSync(join(config.publicDirectory, file)) },
  ]));

  function sendJson(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  }

  function attachmentError(res, status, message) {
    const escaped = message.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Вложение ECN</title><h1>Не удалось открыть вложение</h1><p>' + escaped + '</p><p><a href="/">Вернуться к панели ECN</a></p></html>');
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
        const status = monitor.status();
        return sendJson(res, 200, {
          sheetId: config.sheetId,
          tokenConfigured: Boolean(config.token),
          pollSeconds: config.pollSeconds,
          mode: status.numbering?.enabled ? "auto_number" : "observe",
          numbering: status.numbering || { enabled: false },
          commentsWritable: Boolean(config.token && comments),
          ...store.state(),
          monitor: status,
        });
      }
      if (req.method === "GET" && /^\/api\/rows\/[1-9]\d*$/.test(url.pathname)) {
        const row = store.row(url.pathname.split("/").at(-1));
        return sendJson(res, row ? 200 : 404, row || { error: "Строка отсутствует в последнем снимке ECF." });
      }
      const reviewMatch = /^\/api\/rows\/([1-9]\d*)\/ai-review$/.exec(url.pathname);
      if (reviewMatch && reviews) {
        const rowId = reviewMatch[1];
        if (req.method === "GET") return sendJson(res, 200, reviews.status(rowId));
        if (req.method === "POST") {
          if (req.headers.origin !== origin || req.headers["x-ecn-ui"] !== "1") return sendJson(res, 403, { error: "Используй локальную панель." });
          if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) return sendJson(res, 415, { error: "Ожидается JSON." });
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 2048) return sendJson(res, 413, { error: "Список вложений слишком длинный." });
            chunks.push(chunk);
          }
          let input;
          try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
          catch { return sendJson(res, 400, { error: "Некорректный JSON." }); }
          return sendJson(res, 200, await reviews.analyze(rowId, input));
        }
      }
      const operationMatch = /^\/api\/rows\/([1-9]\d*)\/comment-operations\/([^/]+)(\/verify)?$/.exec(url.pathname);
      if (operationMatch && req.method === (operationMatch[3] ? "POST" : "GET")) {
        const [, rowId, operationId, verify] = operationMatch;
        if (!OPERATION_ID.test(operationId)) return sendJson(res, 400, { error: "Некорректный идентификатор отправки." });
        if (verify && (req.headers.origin !== origin || req.headers["x-ecn-ui"] !== "1")) {
          return sendJson(res, 403, { error: "Используй локальную панель." });
        }
        const operation = verify ? await comments?.verify(rowId, operationId) : comments?.get(rowId, operationId);
        return sendJson(res, operation ? 200 : 404, operation ? { ok: operation.status === "sent", operation } : { error: "Отправка не найдена." });
      }
      const commentMatch = /^\/api\/rows\/([1-9]\d*)\/comments$/.exec(url.pathname);
      if (req.method === "POST" && commentMatch && comments) {
        if (req.headers.origin !== origin || req.headers["x-ecn-ui"] !== "1") return sendJson(res, 403, { error: "Используй локальную панель." });
        if (!config.token) return sendJson(res, 409, { error: "Для отправки нужен SMARTSHEET_API_TOKEN. Перезапусти агент после настройки." });
        const contentType = String(req.headers["content-type"] || "");
        if (!/^multipart\/form-data;/i.test(contentType)) return sendJson(res, 415, { error: "Ожидается комментарий с файлом в формате FormData." });
        const limit = MAX_ATTACHMENT_BYTES + 65536;
        if (Number(req.headers["content-length"]) > limit) return sendJson(res, 413, { error: "Максимальный размер файла — 30 МБ." });
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > limit) return sendJson(res, 413, { error: "Максимальный размер файла — 30 МБ." });
          chunks.push(chunk);
        }
        let form;
        try {
          form = await new Request(origin, { method: "POST", headers: { "Content-Type": contentType }, body: Buffer.concat(chunks) }).formData();
        } catch { return sendJson(res, 400, { error: "Не удалось прочитать комментарий или файл." }); }
        const allowed = new Set(["text", "file", "operationId", "discussionId"]);
        for (const key of form.keys()) {
          if (!allowed.has(key) || form.getAll(key).length !== 1) return sendJson(res, 400, { error: "Некорректные поля отправки. Разрешён один файл на комментарий." });
        }
        const upload = form.get("file");
        if (upload !== null && typeof upload === "string") return sendJson(res, 400, { error: "Не удалось прочитать файл." });
        const text = form.get("text");
        const operationId = form.get("operationId");
        const discussionId = form.get("discussionId");
        if (typeof text !== "string" || typeof operationId !== "string" || (discussionId !== null && typeof discussionId !== "string")) return sendJson(res, 400, { error: "Некорректные поля комментария." });
        const operation = await comments.submit({ rowId: commentMatch[1], operationId, text, discussionId,
          file: upload ? { name: upload.name, mimeType: upload.type || "application/octet-stream", bytes: Buffer.from(await upload.arrayBuffer()) } : null });
        return sendJson(res, operation.status === "sent" ? 200 : operation.status === "pending" ? 202 : 409, {
          ok: operation.status === "sent", operation, ...(operation.error ? { error: operation.error } : {}), refreshPending: operation.status === "sent",
        });
      }
      const attachmentMatch = /^\/api\/rows\/([1-9]\d*)\/attachments\/([1-9]\d*)\/open$/.exec(url.pathname);
      if (req.method === "GET" && attachmentMatch) {
        const [, rowId, attachmentId] = attachmentMatch;
        const findAttachment = () => store.row(rowId)?.attachments?.find(item => item.id === attachmentId);
        if (!findAttachment()) return attachmentError(res, 404, "Вложения нет в последнем снимке этого ECN. Обнови панель.");
        if (!config.token || !reader) return attachmentError(res, 409, "Для открытия вложений нужен токен Smartsheet. Проверь настройки агента.");
        try {
          const attachment = await reader.getAttachment(attachmentId);
          // Recheck membership after the API call: a sync can replace the snapshot while it is in flight.
          const saved = findAttachment();
          if (!saved || attachment.id !== attachmentId || attachment.parentId !== saved.parentId || attachment.parentType !== saved.parentType) {
            return attachmentError(res, 409, "Вложение изменило привязку или больше не доступно в этом ECN. Обнови панель.");
          }
          const target = new URL(attachment.url);
          if (!["https:", "http:"].includes(target.protocol) || target.username || target.password || (attachment.attachmentType === "FILE" && target.protocol !== "https:")) {
            return attachmentError(res, 502, "Smartsheet вернул неподдерживаемую ссылку на вложение.");
          }
          res.writeHead(302, { Location: target.href });
          res.end();
          return;
        } catch (error) {
          const status = error instanceof SmartsheetError && ["http_401", "http_403", "http_404", "http_429"].includes(error.code) ? Number(error.code.slice(5)) : 502;
          return attachmentError(res, status, error instanceof SmartsheetError ? error.message : "Не удалось получить ссылку на вложение. Попробуй снова после проверки ECF.");
        }
      }
      if (req.method === "POST" && /^\/api\/rows\/[1-9]\d*\/comments\/seen$/.test(url.pathname)) {
        if (req.headers.origin !== origin || req.headers["x-ecn-ui"] !== "1") {
          return sendJson(res, 403, { error: "Используй локальную панель." });
        }
        if (!String(req.headers["content-type"] || "").startsWith("application/json")) {
          return sendJson(res, 415, { error: "Ожидается JSON." });
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 1024) return sendJson(res, 413, { error: "Слишком большой запрос." });
        }
        let revision;
        try { revision = JSON.parse(body).revision; } catch { return sendJson(res, 400, { error: "Некорректный JSON." }); }
        if (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision)) {
          return sendJson(res, 400, { error: "Некорректная версия комментариев." });
        }
        const result = store.markCommentsSeen(url.pathname.split("/")[3], revision);
        if (result === "missing") return sendJson(res, 404, { error: "Строка уже отсутствует в ECF." });
        if (result === "stale") return sendJson(res, 409, { error: "Появились изменения. Обнови комментарии." });
        return sendJson(res, 200, { ok: true });
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
    } catch (error) {
      if (error instanceof CommentRequestError || error instanceof AiError) return sendJson(res, error.status, { error: error.message });
      return sendJson(res, 500, { error: "Ошибка локальной панели. Проверь доступ к папке data." });
    }
  });
}
