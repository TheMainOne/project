import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { idString, SmartsheetError } from "./smartsheet.js";
import { commentVerification, MAX_ATTACHMENT_BYTES } from "./smartsheet-write.js";

export const OPERATION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export class CommentRequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// All writes to the same sheet share this queue, including automatic numbering.
export function createWriteQueue() {
  let tail = Promise.resolve();
  return work => {
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  };
}

export function validateComment({ operationId, rowId, discussionId = null, text, file = null }) {
  if (!OPERATION_ID.test(operationId || "")) throw new CommentRequestError(400, "Некорректный идентификатор отправки.");
  if (!/^[1-9]\d*$/.test(rowId || "") || (discussionId !== null && !/^[1-9]\d*$/.test(discussionId))) {
    throw new CommentRequestError(400, "Некорректный ECN или обсуждение.");
  }
  if (typeof text !== "string" || !text.trim() || text.length > 10000) {
    throw new CommentRequestError(400, "Введи комментарий длиной от 1 до 10 000 символов.");
  }
  if (file) {
    if (!Buffer.isBuffer(file.bytes) || file.bytes.length > MAX_ATTACHMENT_BYTES) throw new CommentRequestError(413, "Максимальный размер файла — 30 МБ.");
    if (typeof file.name !== "string" || !file.name.trim() || file.name.length > 255 || /[\x00-\x1f\x7f/\\]/.test(file.name)) {
      throw new CommentRequestError(400, "Недопустимое имя файла.");
    }
    if (typeof file.mimeType !== "string" || !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(file.mimeType)) {
      throw new CommentRequestError(400, "Недопустимый тип файла.");
    }
  }
  return { operationId: operationId.toLowerCase(), rowId, discussionId, text: text.trim(), file };
}

export function createCommentService({ filename, sheetId, store, writer, refresh, runExclusive = createWriteQueue() }) {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS comment_operations (" +
    "sheet_id TEXT NOT NULL, id TEXT NOT NULL, row_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(sheet_id,id));");
  db.exec("CREATE INDEX IF NOT EXISTS comment_followups_by_row ON comment_operations(sheet_id,row_id) WHERE json_type(result,'$.followup')='object'");
  const rowFollowups = db.prepare("SELECT result FROM comment_operations WHERE sheet_id=? AND row_id=? " +
    "AND json_type(result,'$.followup')='object' AND json_extract(result,'$.status')<>'rejected'");
  const inFlight = new Map();
  const checks = new Map();
  let stopped = false;
  const find = id => db.prepare("SELECT row_id AS rowId, fingerprint, result FROM comment_operations WHERE sheet_id = ? AND id = ?").get(sheetId, id);
  function save(operation) {
    const saved = db.prepare("UPDATE comment_operations SET result = ? WHERE sheet_id = ? AND id = ? AND json_extract(result, '$.status') <> 'sent'")
      .run(JSON.stringify(operation), sheetId, operation.id);
    return saved.changes ? operation : JSON.parse(find(operation.id).result);
  }
  function operationFrom(record) {
    const operation = JSON.parse(record.result);
    // A process may have exited after Smartsheet accepted the POST. Never replay it.
    if (operation.status === "pending" && !inFlight.has(operation.id)) {
      return { ...operation, status: "uncertain", error: "Отправка была прервана. Проверь обсуждение в Smartsheet перед повторной отправкой." };
    }
    return operation;
  }
  function forPanel({ expected, followup, ...operation }) { return operation; }
  function followupIds(row,ownerEmail) {
    const ids = new Set();
    for (const record of rowFollowups.all(sheetId,row.id)) {
      const operation = JSON.parse(record.result);
      const mark = operation.followup;
      if (operation.commentId && operation.discussionId===mark.threadId) {
        ids.add(operation.commentId);
        continue;
      }
      // A POST can succeed and lose its receipt. Only match a new identical comment by
      // the owner in this thread near the write. A later hand-written repeat is a new request.
      if (!mark.startedAt) continue;
      const thread = row.discussions?.find(t => t.id===mark.threadId);
      const match = thread?.comments.find(c => c.author?.email?.trim().toLowerCase()===ownerEmail &&
        !mark.previousMatches.includes(c.id) && Math.abs(Date.parse(c.createdAt)-mark.startedAt)<=5*60_000 &&
        commentVerification({text:c.text,discussionId:mark.threadId}).textHash===operation.expected.textHash);
      if (match) ids.add(match.id);
    }
    return ids;
  }
  function get(rowId, id) {
    const record = find(String(id).toLowerCase());
    return record?.rowId === rowId ? forPanel(operationFrom(record)) : null;
  }
  function receiptIds(receipt) {
    const ids = {};
    for (const key of ["discussionId", "commentId"]) {
      if (receipt?.[key] !== undefined) ids[key] = idString(receipt[key]);
    }
    return ids;
  }
  function recordEvent(kind, message, rowId) {
    try { store.addEvent(kind, message, rowId); } catch { /* The durable operation remains authoritative. */ }
  }
  function refreshSnapshot() {
    try { Promise.resolve(refresh()).catch(() => {}); } catch { /* Normal polling can retry the read. */ }
  }
  async function verify(rowId, id) {
    const record = find(String(id).toLowerCase());
    if (record?.rowId !== rowId) return null;
    const operation = operationFrom(record);
    if (operation.status !== "uncertain") return forPanel(operation);
    if (!operation.expected || !operation.discussionId || (!operation.commentId && !operation.expected.newDiscussion)) {
      return forPanel({ ...operation, error: "Для этой отправки недостаточно сохранённых данных. Проверь обсуждение вручную в Smartsheet." });
    }
    if (stopped) throw new CommentRequestError(503, "Агент завершает работу. Повтори проверку после перезапуска.");
    if (checks.has(operation.id)) return checks.get(operation.id);
    const work = (async () => {
      let next;
      try {
        const receipt = await writer.verifyComment(operation);
        next = { ...operation, ...receipt, status: "sent" };
        delete next.error;
      } catch (error) {
        next = { ...operation, ...receiptIds(error.receipt), status: "uncertain",
          error: error.code === "write_uncertain" ? error.message : "Не удалось сверить обсуждение с этой строкой ECF. Проверь его в Smartsheet." };
      }
      // A second process may have confirmed or checkpointed the operation during the GET.
      const updated = db.prepare("UPDATE comment_operations SET result = ? WHERE sheet_id = ? AND id = ? AND result = ?")
        .run(JSON.stringify(next), sheetId, operation.id, record.result);
      if (!updated.changes) return get(rowId, operation.id);
      if (next.status === "sent") {
        recordEvent("comment_verified", "Отправка комментария подтверждена сверкой со Smartsheet.", rowId);
        refreshSnapshot();
      }
      return forPanel(next);
    })();
    checks.set(operation.id, work);
    try { return await work; } finally { checks.delete(operation.id); }
  }
  function checkRow(input) {
    const row = store.row(input.rowId);
    if (!row) throw new CommentRequestError(404, "ECN отсутствует в последнем снимке ECF. Обнови данные.");
    if (input.discussionId && !row.discussions?.some(thread => thread.id === input.discussionId)) {
      throw new CommentRequestError(409, "Обсуждение больше не принадлежит этому ECN. Обнови данные.");
    }
    return row;
  }
  return {
    get,
    verify,
    followupIds,
    async submit(value, beforeReply, {followup = false} = {}) {
      const input = validateComment(value);
      const fingerprint = createHash("sha256").update(JSON.stringify({
        rowId: input.rowId, discussionId: input.discussionId, text: input.text,
        file: input.file ? { name: input.file.name, type: input.file.mimeType, hash: createHash("sha256").update(input.file.bytes).digest("hex") } : null,
      })).digest("hex");
      const existing = find(input.operationId);
      if (existing) {
        if (existing.rowId !== input.rowId || existing.fingerprint !== fingerprint) throw new CommentRequestError(409, "Эта отправка уже использована для другого комментария. Обнови карточку.");
        return get(input.rowId, input.operationId);
      }
      if (stopped) throw new CommentRequestError(503, "Агент завершает работу. Дождись перезапуска.");
      if (followup && (!input.discussionId || typeof beforeReply!=="function")) {
        throw new CommentRequestError(409,"Для напоминания нужна проверка исходного обсуждения.");
      }
      const row = checkRow(input);
      const pending = { id: input.operationId, rowId: input.rowId, status: "pending", createdAt: new Date().toISOString(),
        expected: commentVerification(input) };
      if (followup) {
        const thread = row.discussions.find(t=>t.id===input.discussionId);
        pending.followup = {threadId:thread.id, previousMatches:thread.comments.filter(c=>c.text===input.text).map(c=>c.id)};
      }
      // Commit intent before the remote call. File bytes and comment text are not stored here.
      const inserted = db.prepare("INSERT OR IGNORE INTO comment_operations (sheet_id,id,row_id,fingerprint,result) VALUES (?,?,?,?,?)")
        .run(sheetId, input.operationId, input.rowId, fingerprint, JSON.stringify(pending));
      if (!inserted.changes) throw new CommentRequestError(409, "Эта отправка уже обрабатывается. Проверь её результат.");
      const work = runExclusive(async () => {
        let operation;
        try {
          checkRow(input);
          const beforePost = followup ? async (liveRow,liveThread) => {
            await beforeReply(liveRow,liveThread);
            pending.followup.startedAt = Date.now();
            save(pending);
          } : beforeReply;
          const result = await writer.postComment(input, receipt => {
            Object.assign(pending, receiptIds(receipt));
            save(pending);
          }, beforePost);
          operation = save({ ...pending, ...result, status: "sent" });
        } catch (error) {
          const known = error instanceof SmartsheetError || error instanceof CommentRequestError;
          operation = save({ ...pending, ...receiptIds(error.receipt), status: known && error.code !== "write_uncertain" ? "rejected" : "uncertain",
            error: known ? error.message : "Не удалось подтвердить отправку. Проверь обсуждение в Smartsheet перед повторной отправкой." });
        }
        recordEvent(operation.status === "sent" ? "comment_sent" : "comment_send_error",
          operation.status === "sent" ? "Комментарий" + (input.file ? " с файлом" : "") + " отправлен в Smartsheet." : operation.error, input.rowId);
        if (operation.status !== "rejected") refreshSnapshot();
        return forPanel(operation);
      });
      inFlight.set(input.operationId, work);
      try { return await work; } finally { inFlight.delete(input.operationId); }
    },
    async close() {
      stopped = true;
      await Promise.allSettled([...inFlight.values(), ...checks.values()]);
      db.close();
    },
  };
}
