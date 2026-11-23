import { createHash, randomUUID } from "node:crypto";
import { idString, SmartsheetError } from "./smartsheet.js";

// Smartsheet permits one file per multipart comment request, up to 30 MB.
// https://developers.smartsheet.com/api/smartsheet/openapi/discussions/row-discussions-create
// https://developers.smartsheet.com/api/smartsheet/openapi/comments/comments-create
export const MAX_ATTACHMENT_BYTES = 30_000_000;
export const MAX_COMMENT_LENGTH = 10_000;

export function validateCommentInput({ rowId, discussionId = null, text, file = null }) {
  rowId = idString(rowId);
  discussionId = discussionId == null ? null : idString(discussionId);
  if (typeof text !== "string" || !text.trim() || text.length > MAX_COMMENT_LENGTH || text.includes("\0")) {
    throw new SmartsheetError("invalid_comment", "Введи комментарий от 1 до 10 000 символов.");
  }
  if (file != null) {
    if (typeof file !== "object" || typeof file.name !== "string" || !file.name.trim() ||
        file.name.length > 255 || /[\u0000-\u001f\u007f/\\]/u.test(file.name) || [".", ".."].includes(file.name) ||
        !(file.bytes instanceof Uint8Array)) {
      throw new SmartsheetError("invalid_file", "Не удалось прочитать файл или его имя.");
    }
    if (file.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new SmartsheetError("file_too_large", "Размер файла не должен превышать 30 МБ.");
    }
    const mimeType = file.mimeType || "application/octet-stream";
    if (typeof mimeType !== "string" || mimeType.length > 200 || !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(mimeType)) {
      throw new SmartsheetError("invalid_file", "Неподдерживаемый тип файла.");
    }
    file = { name: file.name, mimeType, bytes: file.bytes };
  }
  return { rowId, discussionId, text, file };
}

function multipart(partName, json, file) {
  // A fresh random boundary cannot be injected by a user-controlled filename or text.
  const boundary = "ecn-" + randomUUID();
  const filename = file.name.replaceAll('"', "%22");
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${partName}"\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify(json) +
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
  );
  const body = Buffer.concat([prefix, file.bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return { body, type: "multipart/form-data; boundary=" + boundary };
}

const digest = text => createHash("sha256").update(text).digest("hex");

export function commentVerification({ text, file, discussionId }) {
  return { textHash: digest(text), fileNameHash: file ? digest(file.name) : null, newDiscussion: discussionId == null };
}

function checkedAttachmentIds(attachments, commentId) {
  return attachments.map(attachment => {
    if (attachment.parentType !== undefined && attachment.parentType !== "COMMENT") throw uncertain();
    if (attachment.parentId !== undefined && idString(attachment.parentId) !== commentId) throw uncertain();
    return idString(attachment.id);
  });
}

function uncertain(receipt = {}, message = "Не удалось подтвердить результат отправки. Проверь обсуждение в Smartsheet перед повторной отправкой.") {
  const error = new SmartsheetError("write_uncertain", message);
  error.uncertain = true;
  error.receipt = receipt;
  return error;
}

function rejected(status) {
  const messages = {
    400: "Smartsheet отклонил комментарий или файл. Проверь текст и выбранный файл.",
    401: "Токен Smartsheet недействителен. Проверь настройки агента.",
    403: "Smartsheet запретил добавление комментария или файла. Проверь права доступа к ECF.",
    404: "ECN или обсуждение больше не доступны в Smartsheet. Обнови панель.",
    409: "Smartsheet сейчас обрабатывает другое изменение. Обнови ECN перед повторной отправкой.",
    413: "Smartsheet отклонил файл из-за его размера. Максимум — 30 МБ.",
    429: "Smartsheet ограничил частоту запросов. Подожди минуту перед повторной отправкой.",
  };
  return new SmartsheetError("http_" + status, messages[status] || "Smartsheet отклонил запрос. Обнови ECN и проверь права доступа.");
}

export function createSmartsheetWriter({ sheetId, token, fetchImpl = fetch }) {
  const base = "https://api.smartsheet.com/2.0/sheets/" + idString(sheetId);

  async function request(path, { method = "GET", body, type, signal, upload = false } = {}) {
    const deadline = AbortSignal.timeout(upload ? 120_000 : 30_000);
    const headers = {
      Authorization: "Bearer " + token,
      Accept: "application/json",
      "smartsheet-integration-source": "APPLICATION,DWK,ECNPanel",
    };
    if (body !== undefined) {
      headers["Content-Type"] = type;
      headers["Content-Length"] = String(Buffer.byteLength(body));
    }
    let response;
    try {
      response = await fetchImpl(new URL(base + path), {
        method, redirect: "error", headers, body,
        signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      });
    } catch {
      if (method === "POST") throw uncertain();
      throw new SmartsheetError("read_failed", "Не удалось проверить обсуждение в Smartsheet. Попробуй обновить ECN.");
    }
    if (!response.ok) {
      await response.body?.cancel();
      // A gateway or timeout can fail after Smartsheet has already committed the write.
      if (method === "POST" && ![400, 401, 403, 404, 405, 409, 413, 415, 422, 429].includes(response.status)) throw uncertain();
      throw rejected(response.status);
    }
    try {
      return await response.json();
    } catch {
      if (method === "POST") throw uncertain();
      throw new SmartsheetError("invalid_response", "Smartsheet вернул неполные сведения об обсуждении.");
    }
  }

  function checkParent(discussion, rowId, discussionId) {
    if (idString(discussion.id) !== discussionId || discussion.parentType !== "ROW" || idString(discussion.parentId) !== rowId) {
      throw new SmartsheetError("discussion_changed", "Обсуждение больше не относится к этому ECN. Обнови панель.");
    }
  }

  return {
    // Exactly one POST: the comment and optional file are submitted together.
    // Callers must persist their own operation key before invoking this method.
    async postComment(input, onReceipt) {
      const { rowId, discussionId, text, file } = validateCommentInput(input);
      const signal = input.signal;
      if (!token) throw new SmartsheetError("http_401", "Для отправки нужен токен Smartsheet. Проверь настройки агента.");
      if (signal?.aborted) throw new SmartsheetError("request_aborted", "Отправка отменена до передачи в Smartsheet.");
      if (discussionId) {
        const existing = await request(`/discussions/${discussionId}?include=comments`, { signal });
        checkParent(existing, rowId, discussionId);
        if (existing.readOnly || existing.accessLevel === "VIEWER") {
          throw new SmartsheetError("http_403", "У этого обсуждения нет доступа для добавления комментариев.");
        }
      }
      const payload = discussionId ? { text } : { comment: { text } };
      const encoded = file ? multipart(discussionId ? "comment" : "discussion", payload, file) : {
        body: Buffer.from(JSON.stringify(payload)), type: "application/json",
      };
      const path = discussionId ? `/discussions/${discussionId}/comments` : `/rows/${rowId}/discussions`;
      const result = await request(path, { method: "POST", ...encoded, signal, upload: Boolean(file) });
      let receipt = {};
      try {
        if (result.resultCode !== 0 || result.message !== "SUCCESS" || !result.result) throw uncertain();
        const created = result.result;
        const newDiscussionId = discussionId || idString(created.id);
        if (!discussionId && (
          (created.parentType !== undefined && created.parentType !== "ROW") ||
          (created.parentId !== undefined && idString(created.parentId) !== rowId)
        )) throw uncertain();
        receipt = { discussionId: newDiscussionId };
        onReceipt?.(receipt);
        const returnedMatches = created.comments?.filter(item => item.text === text) || [];
        let comment = discussionId ? created : returnedMatches.length === 1 ? returnedMatches[0] : null;
        let discussion = discussionId ? null : created;
        if (!discussionId && (!comment || !Array.isArray(created.comments))) {
          discussion = await request(`/discussions/${newDiscussionId}?include=comments,attachments`, { signal });
          checkParent(discussion, rowId, newDiscussionId);
          const matches = discussion.comments?.filter(item => item.text === text) || [];
          if (matches.length !== 1) throw uncertain(receipt);
          [comment] = matches;
        }
        const commentId = idString(comment?.id);
        receipt = { ...receipt, commentId };
        onReceipt?.(receipt);
        if (comment.text !== text) throw uncertain(receipt);
        if (comment.discussionId !== undefined && idString(comment.discussionId) !== newDiscussionId) throw uncertain(receipt);
        let attachments = comment.attachments || discussion?.commentAttachments?.filter(item => String(item.parentId) === commentId) || [];
        if (file && !attachments.length) {
          comment = await request(`/comments/${commentId}`, { signal });
          if (idString(comment.id) !== commentId || idString(comment.discussionId) !== newDiscussionId) throw uncertain(receipt);
          attachments = comment.attachments || [];
        }
        if (file && attachments.length !== 1) throw uncertain(receipt);
        const attachmentIds = checkedAttachmentIds(attachments, commentId);
        return { discussionId: newDiscussionId, commentId, attachmentIds };
      } catch {
        // The POST has completed; a failed readback must never invite a blind retry.
        throw uncertain(receipt);
      }
    },
    async verifyComment({ rowId, discussionId, commentId, expected }) {
      if (!token) throw new SmartsheetError("missing_token", "Для сверки комментария нужен токен Smartsheet.");
      discussionId = idString(discussionId);
      const receipt = { discussionId };
      if (commentId) receipt.commentId = idString(commentId);
      // Only a thread created by this POST can identify a comment when its ID is missing.
      if (!receipt.commentId && !expected.newDiscussion) throw uncertain(receipt);
      const signal = AbortSignal.timeout(45_000);
      const thread = await request(`/discussions/${discussionId}?include=comments,attachments`, { signal });
      checkParent(thread, idString(rowId), discussionId);
      if (!receipt.commentId) {
        const replies = thread.comments;
        if (!Array.isArray(replies) || replies.length !== 1 || (thread.commentCount != null && thread.commentCount !== 1) ||
            !thread.createdAt || replies[0]?.createdAt !== thread.createdAt || typeof replies[0].text !== "string" ||
            digest(replies[0].text) !== expected.textHash) {
          throw uncertain(receipt, "Не удалось однозначно определить комментарий в созданном обсуждении. Проверь его в Smartsheet.");
        }
        receipt.commentId = idString(replies[0].id);
      }
      try {
        const comment = await request(`/comments/${receipt.commentId}`, { signal });
        if (idString(comment.id) !== receipt.commentId || idString(comment.discussionId) !== discussionId ||
            typeof comment.text !== "string" || digest(comment.text) !== expected.textHash) throw uncertain(receipt);
        let attachmentIds = [];
        if (expected.fileNameHash !== null) {
          const owned = thread.commentAttachments?.filter(item => String(item.parentId) === receipt.commentId);
          const attachments = comment.attachments?.length ? comment.attachments : owned;
          if (attachments?.length !== 1 || typeof attachments[0].name !== "string" ||
              digest(attachments[0].name) !== expected.fileNameHash) {
            throw uncertain(receipt, "Комментарий найден, но исходное вложение пока не подтверждено. Можно повторить проверку результата.");
          }
          attachmentIds = checkedAttachmentIds(attachments, receipt.commentId);
        }
        return { ...receipt, attachmentIds };
      } catch (error) {
        throw uncertain(receipt, error.code === "write_uncertain" ? error.message : "Не удалось подтвердить комментарий по его ID. Можно повторить проверку результата.");
      }
    },
  };
}
