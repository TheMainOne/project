import { setTimeout as delay } from "node:timers/promises";

export class SmartsheetError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const FIELDS = Object.freeze({
  ecnNumber: "8435397906720644",
  status: "5620648139614084",
  site: "8692681917894532",
  itemNumber: "6746548046456708",
  itemDescription: "4494748232771460",
  description: "8998347860141956",
  requestedBy: "2242948419086212",
});

export const APPROVALS = Object.freeze([
  ["Marketing & Project Management", "1284174279665540", "7931368193714052"],
  ["Engineering", "7617361255655300", "4498143135983492"],
  ["Quality", "5224823953614724", "1450977656104836"],
  ["Materials", "3679409894909828", "2527436046919556"],
  ["Production Auto-Pack", "7071095435618180", "4819295621932932"],
  ["Production", "1847124233086852", "7031035674290052"],
  ["Operations", "1115047661463428", "2159755506542468"],
  ["Customer Service", "4239661535127428", "2789652390274948"],
  ["Pricing", "4661874000193412", "4812882634401668"],
  ["Finance", "2124266661537668", "1401536140076932"],
]);

export function idString(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new SmartsheetError("unsafe_id", "API вернул идентификатор с потерей точности.");
  }
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw new SmartsheetError("invalid_id", "API вернул некорректный идентификатор.");
  }
  return String(value);
}

function cellText(cell) {
  if (!cell) return "";
  if (cell.displayValue != null) return String(cell.displayValue);
  if (cell.value != null) return String(cell.value);
  const object = cell.objectValue;
  if (["string", "number", "boolean"].includes(typeof object)) return String(object);
  if (Array.isArray(object?.values)) return object.values.map(String).join(", ");
  if (Array.isArray(object?.contacts)) {
    return object.contacts.map(contact => contact.name || contact.email || "").join(", ");
  }
  if (object?.name || object?.email) return String(object.name || object.email);
  return "";
}

function contactsFrom(cell) {
  const object = cell?.objectValue;
  const contacts = Array.isArray(object?.contacts) ? object.contacts : [];
  if (contacts.length) {
    return contacts.map(contact => ({
      name: String(contact.name || ""),
      email: String(contact.email || ""),
    }));
  }
  const value = cell?.value === undefined ? "" : String(cell.value);
  const email = object?.email || (value.includes("@") ? value : "");
  const name = cell?.displayValue || object?.name || (email ? "" : value);
  return name || email ? [{ name: String(name), email: String(email) }] : [];
}

export function normalizeSheet(sheet) {
  const columns = sheet.columns.map((column, position) => ({ column, position }))
    .sort((a, b) => (a.column.index ?? a.position) - (b.column.index ?? b.position))
    .map(({ column }) => ({
      columnId: idString(column.id),
      title: String(column.title || ""),
      type: String(column.type || "TEXT_NUMBER"),
      locked: column.locked === true,
      ...(Array.isArray(column.options) ? { options: column.options.map(String) } : {}),
    }));
  const columnIds = new Set(columns.map(column => column.columnId));
  const missing = Object.entries(FIELDS).filter(([, id]) => !columnIds.has(id));
  if (missing.length) {
    throw new SmartsheetError(
      "schema_changed",
      "В ECF отсутствуют ожидаемые поля по Column ID: " + missing.map(([name]) => name).join(", "),
    );
  }
  const unavailableApprovals = APPROVALS
    .filter(([, contactId, statusId]) => !columnIds.has(contactId) || !columnIds.has(statusId))
    .map(([department]) => department);
  const optionalColumns = Object.fromEntries(Object.entries({
    ecnType: "ecn type", priority: "priority", implementation: "effective when",
  }).map(([name, title]) => [name, columns.find(column => column.title.trim().toLowerCase() === title)?.columnId]));
  const rows = sheet.rows.map(row => {
    const cells = new Map(row.cells.map(cell => [idString(cell.columnId), cell]));
    const fields = Object.fromEntries(
      Object.entries(FIELDS).map(([name, id]) => [name, cellText(cells.get(id))]),
    );
    return {
      id: idString(row.id),
      rowNumber: row.rowNumber,
      ...fields,
      ...Object.fromEntries(Object.entries(optionalColumns).map(([name, id]) => [name, cellText(cells.get(id))])),
      fields: columns.map(column => ({
        ...column,
        locked: column.locked || row.locked === true,
        value: cellText(cells.get(column.columnId)),
      })),
      createdAt: row.createdAt || null,
      modifiedAt: row.modifiedAt || null,
      approvals: APPROVALS.map(([department, contactId, statusId]) => ({
        department,
        available: columnIds.has(contactId) && columnIds.has(statusId),
        contacts: contactsFrom(cells.get(contactId)),
        status: cellText(cells.get(statusId)),
      })),
    };
  });
  return {
    id: idString(sheet.id),
    name: String(sheet.name || "ENGINEERING CHANGE FORM"),
    version: sheet.version,
    columnCount: sheet.columns.length,
    columns,
    unavailableApprovals,
    rows,
  };
}

// List Discussions must include=comments; Get Sheet's discussions flag omits bodies.
export function normalizeDiscussions(discussions) {
  const commentIds = new Set();
  return discussions.map(discussion => {
    const id = idString(discussion.id);
    const parentId = idString(discussion.parentId);
    if (!["ROW", "SHEET"].includes(discussion.parentType) || !Array.isArray(discussion.comments)) {
      throw new SmartsheetError("incomplete_comments", "Smartsheet вернул обсуждения без полного списка комментариев.");
    }
    if (discussion.commentCount !== undefined && discussion.commentCount !== discussion.comments.length) {
      throw new SmartsheetError("incomplete_comments", "Получены не все комментарии обсуждения. Сохранён предыдущий снимок.");
    }
    const comments = discussion.comments.map(comment => {
      const commentId = idString(comment.id);
      if (commentIds.has(commentId) || (comment.discussionId !== undefined && idString(comment.discussionId) !== id)) {
        throw new SmartsheetError("incomplete_comments", "Получены повторяющиеся или несогласованные комментарии.");
      }
      commentIds.add(commentId);
      if (comment.text !== undefined && typeof comment.text !== "string") {
        throw new SmartsheetError("invalid_response", "Неожиданный формат текста комментария.");
      }
      return {
        id: commentId,
        discussionId: id,
        text: comment.text || "",
        createdAt: comment.createdAt || null,
        modifiedAt: comment.modifiedAt || comment.createdAt || null,
        author: { name: String(comment.createdBy?.name || ""), email: String(comment.createdBy?.email || "") },
      };
    }).sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || a.id.localeCompare(b.id));
    return { id, parentId, parentType: discussion.parentType, title: String(discussion.title || ""), comments };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

// Keep temporary download URLs out of snapshots, hashes, and event history.
export function normalizeAttachment(attachment) {
  if (!attachment || typeof attachment !== "object" ||
      !["ROW", "COMMENT", "SHEET", "PROOF"].includes(attachment.parentType) ||
      typeof attachment.attachmentType !== "string" || !attachment.attachmentType ||
      (attachment.sizeInKb != null && (!Number.isFinite(attachment.sizeInKb) || attachment.sizeInKb < 0))) {
    throw new SmartsheetError("incomplete_attachments", "Smartsheet вернул неполные сведения о вложении. Сохранён предыдущий снимок.");
  }
  return {
    id: idString(attachment.id),
    parentId: idString(attachment.parentId),
    parentType: attachment.parentType,
    attachmentType: attachment.attachmentType,
    attachmentSubType: String(attachment.attachmentSubType || ""),
    mimeType: String(attachment.mimeType || ""),
    name: String(attachment.name || ""),
    sizeInKb: attachment.sizeInKb ?? null,
    createdAt: attachment.createdAt || null,
    author: { name: String(attachment.createdBy?.name || ""), email: String(attachment.createdBy?.email || "") },
  };
}

function attachmentUrl(value, attachmentType) {
  try {
    if (typeof value !== "string" || !value) throw new Error();
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
        (attachmentType === "FILE" && url.protocol !== "https:")) throw new Error();
    return url.href;
  } catch {
    throw new SmartsheetError("invalid_attachment_url", "Smartsheet не предоставил безопасную ссылку на вложение. Попробуй открыть его в Smartsheet.");
  }
}

export function createSmartsheetReader({ sheetId, token, fetchImpl = fetch, wait = delay }) {
  sheetId = idString(sheetId);
  const pageSize = 500;
  const sheetPath = "https://api.smartsheet.com/2.0/sheets/" + sheetId;

  async function readJson(url, signal) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
          "smartsheet-integration-source": "SCRIPT,DWK,ECNObserver",
        },
      });
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = retryAfter && /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) : 2 ** attempt * 2;
        await response.body?.cancel();
        if (seconds > 60) throw new SmartsheetError("rate_limited", "Smartsheet ограничил запросы. Повтор будет на следующем цикле.");
        await wait(seconds * 1000, undefined, { signal });
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        const messages = {
          401: "Smartsheet отклонил токен. Проверь SMARTSHEET_API_TOKEN в .env.",
          403: "У аккаунта токена нет доступа к ECF, её обсуждениям или вложениям.",
          404: "Smartsheet не нашёл ECF, обсуждение или вложение для этого аккаунта. Возможно, объект удалён.",
          429: "Smartsheet ограничил запросы. Повтор будет на следующем цикле.",
        };
        throw new SmartsheetError("http_" + response.status, messages[response.status] || "Smartsheet временно недоступен. HTTP " + response.status);
      }
      return response.json();
    }
  }

  async function readPage(page, signal) {
    const url = new URL(sheetPath);
    for (const [key, value] of Object.entries({ pageSize, page, level: 2, include: "objectValue" })) url.searchParams.set(key, String(value));
    const sheet = await readJson(url, signal);
    if (idString(sheet.id) !== sheetId || !Number.isSafeInteger(sheet.totalRowCount) || sheet.totalRowCount < 0 ||
        !Number.isSafeInteger(sheet.version) || !Array.isArray(sheet.rows) || !Array.isArray(sheet.columns)) {
      throw new SmartsheetError("invalid_response", "Неожиданный формат ответа Smartsheet.");
    }
    return sheet;
  }

  async function discussionPage(page, signal) {
    const url = new URL(sheetPath + "/discussions");
    url.searchParams.set("include", "comments");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("page", String(page));
    const data = await readJson(url, signal);
    if (!Array.isArray(data.data) || data.pageNumber !== page || !Number.isSafeInteger(data.totalCount) || data.totalCount < 0 ||
        !Number.isSafeInteger(data.totalPages) || data.totalPages < 0 || data.totalPages > 1000 ||
        (data.totalCount > 0 && data.totalPages < 1)) {
      throw new SmartsheetError("incomplete_comments", "Не удалось получить полный список обсуждений ECF.");
    }
    return data;
  }

  async function readDiscussions(signal) {
    const first = await discussionPage(1, signal);
    const data = [...first.data];
    for (let page = 2; page <= first.totalPages; page += 1) {
      const part = await discussionPage(page, signal);
      if (part.totalCount !== first.totalCount || part.totalPages !== first.totalPages) {
        throw new SmartsheetError("comments_changed", "Обсуждения изменились во время чтения. Проверка повторится на следующем цикле.");
      }
      data.push(...part.data);
    }
    const ids = new Set(data.map(item => idString(item.id)));
    if (data.length !== first.totalCount || ids.size !== first.totalCount) {
      throw new SmartsheetError("incomplete_comments", "Получен неполный список обсуждений. Сохранён предыдущий снимок.");
    }
    if (first.totalPages > 1) {
      const verify = await discussionPage(1, signal);
      if (verify.totalCount !== first.totalCount || verify.totalPages !== first.totalPages ||
          JSON.stringify(normalizeDiscussions(verify.data)) !== JSON.stringify(normalizeDiscussions(first.data))) {
        throw new SmartsheetError("comments_changed", "Обсуждения изменились во время чтения. Проверка повторится на следующем цикле.");
      }
    }
    return normalizeDiscussions(data);
  }

  async function attachmentPage(page, signal) {
    const url = new URL(sheetPath + "/attachments");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("page", String(page));
    const data = await readJson(url, signal);
    if (!data || !Array.isArray(data.data) || data.pageNumber !== page ||
        !Number.isSafeInteger(data.totalCount) || data.totalCount < 0 ||
        !Number.isSafeInteger(data.totalPages) || data.totalPages < 0 || data.totalPages > 1000 ||
        (data.totalCount > 0 && (data.totalPages < 1 || !data.data.length)) ||
        (data.totalCount === 0 && data.totalPages > 1)) {
      throw new SmartsheetError("incomplete_attachments", "Не удалось получить полный список вложений ECF. Сохранён предыдущий снимок.");
    }
    return { ...data, data: data.data.map(normalizeAttachment).sort((a, b) => a.id.localeCompare(b.id)) };
  }

  async function readAttachments(signal) {
    const first = await attachmentPage(1, signal);
    const attachments = [...first.data];
    for (let page = 2; page <= first.totalPages; page += 1) {
      const part = await attachmentPage(page, signal);
      if (part.totalCount !== first.totalCount || part.totalPages !== first.totalPages) {
        throw new SmartsheetError("attachments_changed", "Вложения изменились во время чтения. Проверка повторится на следующем цикле.");
      }
      attachments.push(...part.data);
    }
    if (attachments.length !== first.totalCount || new Set(attachments.map(item => item.id)).size !== first.totalCount) {
      throw new SmartsheetError("incomplete_attachments", "Получен неполный список вложений. Сохранён предыдущий снимок.");
    }
    if (first.totalPages > 1) {
      const verify = await attachmentPage(1, signal);
      if (verify.totalCount !== first.totalCount || verify.totalPages !== first.totalPages ||
          JSON.stringify(verify.data) !== JSON.stringify(first.data)) {
        throw new SmartsheetError("attachments_changed", "Вложения изменились во время чтения. Проверка повторится на следующем цикле.");
      }
    }
    return attachments.sort((a, b) => a.id.localeCompare(b.id));
  }

  return {
    async getAttachment(attachmentId) {
      const id = idString(attachmentId);
      if (!token) throw new SmartsheetError("missing_token", "Заполни SMARTSHEET_API_TOKEN в .env и перезапусти агента.");
      try {
        const raw = await readJson(new URL(sheetPath + "/attachments/" + id), AbortSignal.timeout(90_000));
        const attachment = normalizeAttachment(raw);
        if (attachment.id !== id) {
          throw new SmartsheetError("attachment_changed", "Smartsheet вернул другое вложение. Обнови список и попробуй снова.");
        }
        return { ...attachment, url: attachmentUrl(raw.url, attachment.attachmentType) };
      } catch (error) {
        if (error instanceof SmartsheetError) throw error;
        throw new SmartsheetError("connection_failed", "Не удалось получить ссылку на вложение. Проверь интернет, VPN и доступ к Smartsheet.");
      }
    },
    async read() {
      if (!token) throw new SmartsheetError("missing_token", "Заполни SMARTSHEET_API_TOKEN в .env и перезапусти агента.");
      const signal = AbortSignal.timeout(90_000);
      try {
        const first = await readPage(1, signal);
        const rows = [...first.rows];
        const pages = Math.ceil(first.totalRowCount / pageSize);
        for (let page = 2; page <= pages; page += 1) {
          const part = await readPage(page, signal);
          if (part.version !== first.version || part.totalRowCount !== first.totalRowCount) {
            throw new SmartsheetError("sheet_changed", "ECF изменилась во время чтения. Полный снимок будет повторён.");
          }
          rows.push(...part.rows);
        }
        const uniqueIds = new Set(rows.map(row => idString(row.id)));
        if (uniqueIds.size !== first.totalRowCount || rows.length !== first.totalRowCount) {
          throw new SmartsheetError("incomplete_read", "Получена неполная ECF. Сохранён предыдущий снимок.");
        }
        // Poll comments and attachments even when row timestamps and sheet version did not change.
        const discussions = await readDiscussions(signal);
        const attachments = await readAttachments(signal);
        const verify = await readPage(1, signal);
        if (verify.version !== first.version || verify.totalRowCount !== first.totalRowCount) {
          throw new SmartsheetError("sheet_changed", "ECF изменилась во время чтения строк, комментариев и вложений. Проверка повторится.");
        }
        const sheet = normalizeSheet({ ...first, rows });
        const rowsById = new Map(sheet.rows.map(row => { row.discussions = []; row.attachments = []; return [row.id, row]; }));
        const commentRows = new Map();
        let sheetDiscussionCount = 0;
        for (const discussion of discussions) {
          if (discussion.parentType === "SHEET") {
            if (discussion.parentId !== sheet.id) throw new SmartsheetError("sheet_changed", "Обсуждение не совпало с ECF. Проверка повторится на следующем цикле.");
            sheetDiscussionCount += 1;
            for (const comment of discussion.comments) commentRows.set(comment.id, null);
            continue;
          }
          const row = rowsById.get(discussion.parentId);
          if (!row) throw new SmartsheetError("sheet_changed", "Обсуждения не совпали со строками ECF. Проверка повторится на следующем цикле.");
          row.discussions.push(discussion);
          for (const comment of discussion.comments) commentRows.set(comment.id, row);
        }
        let sheetAttachmentCount = 0;
        let proofAttachmentCount = 0;
        for (const attachment of attachments) {
          // A proof parent is not a row ID; mapping it requires the separate proofs API.
          if (attachment.parentType === "PROOF") { proofAttachmentCount += 1; continue; }
          if (attachment.parentType === "SHEET") {
            if (attachment.parentId !== sheet.id) throw new SmartsheetError("attachments_changed", "Вложение не совпало с ECF. Проверка повторится на следующем цикле.");
            sheetAttachmentCount += 1;
            continue;
          }
          const row = attachment.parentType === "ROW" ? rowsById.get(attachment.parentId) : commentRows.get(attachment.parentId);
          if (row === null) { sheetAttachmentCount += 1; continue; }
          if (!row) throw new SmartsheetError("attachments_changed", "Вложения не совпали со строками или комментариями ECF. Сохранён предыдущий снимок; проверка повторится.");
          row.attachments.push(attachment);
        }
        return { ...sheet, commentsLoaded: true, attachmentsLoaded: true, sheetDiscussionCount, sheetAttachmentCount, proofAttachmentCount };
      } catch (error) {
        if (error instanceof SmartsheetError) throw error;
        throw new SmartsheetError("connection_failed", "Не удалось прочитать ECF, комментарии и вложения. Проверь интернет, VPN и доступ к Smartsheet.");
      }
    },
  };
}
