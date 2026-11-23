import { createHash } from "node:crypto";
import { SmartsheetError } from "../smartsheet.js";
import { extname } from "node:path";

export class AiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function connectionError(stage, error) {
  const reasons = {
    ENOTFOUND:"DNS не нашёл сервер", EAI_AGAIN:"DNS временно недоступен",
    ECONNRESET:"соединение сброшено", ECONNREFUSED:"подключение отклонено",
    ETIMEDOUT:"истекло время подключения", UND_ERR_CONNECT_TIMEOUT:"истекло время подключения",
    SELF_SIGNED_CERT_IN_CHAIN:"не удалось проверить сертификат TLS",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE:"не удалось проверить сертификат TLS",
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY:"не найден доверенный центр сертификации TLS",
    CERT_HAS_EXPIRED:"истёк срок действия сертификата TLS",
  };
  const code = error?.cause?.code || error?.code;
  const detail = Object.hasOwn(reasons, code) ? reasons[code] + " (" + code + ")" : "проверь соединение, VPN и прокси";
  return new AiError(502,stage + " — " + detail + ".");
}
export const fileLimits = Object.freeze({ count: 5, perFile: 12 * 1024 ** 2, total: 20 * 1024 ** 2 });
const formats = new Map(Object.entries({
  ".pdf": "application/pdf", ".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt":"text/plain", ".csv":"text/csv", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp",
}));
export function attachmentOption(item) {
  const mime = formats.get(extname(item.name || "").toLowerCase());
  let reason = "";
  if (item.attachmentType !== "FILE" || !["ROW","COMMENT"].includes(item.parentType)) reason = "Доступны только файлы строки или её комментария";
  else if (!mime) reason = "Формат не поддерживается";
  else if (item.sizeInKb * 1024 > fileLimits.perFile) reason = "Больше 12 МиБ";
  return { id:item.id, name:item.name, sizeInKb:item.sizeInKb ?? null, mime: mime || "", reason };
}
export function attachmentIdentity(item) {
  return [item.id, item.parentType, item.parentId, item.name, item.attachmentType, item.mimeType || "", item.sizeInKb ?? null, item.createdAt || ""];
}
function trustedUrl(value) {
  let url;
  try { url = new URL(value); } catch {}
  if (url?.protocol === "https:" && !url.port && !url.username && !url.password &&
      (/(^|\.)(smartsheet\.com|smartsheetusercontent\.com|smartsheetattachments\.com)$/i.test(url.hostname) ||
       /^(?:[a-z0-9.-]+\.)?s3(?:[.-][a-z0-9-]+)*\.amazonaws\.com$/i.test(url.hostname))) return url;
  throw new AiError(422,"Хранилище вложения не распознано. Открой файл вручную в Smartsheet.");
}
async function download(url, remaining, fetchImpl, signal) {
  let target = trustedUrl(url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetchImpl(target, { method:"GET", redirect:"manual", credentials:"omit", referrerPolicy:"no-referrer", signal });
    if ([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) break;
      target = trustedUrl(new URL(location, target).href);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new AiError(502,"Хранилище вложения вернуло HTTP " + response.status + ". Проверь доступ к файлу в Smartsheet.");
    }
    const limit = Math.min(fileLimits.perFile, remaining);
    if (Number(response.headers.get("content-length")) > limit) {
      await response.body.cancel();
      throw new AiError(413,"Выбранные вложения превышают лимит размера.");
    }
    const parts = []; let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > limit) throw new AiError(413,"Выбранные вложения превышают лимит размера.");
      parts.push(chunk);
    }
    if (!length) throw new AiError(422,"Выбран пустой файл.");
    return Buffer.concat(parts, length);
  }
  throw new AiError(502,"Не удалось перейти к файлу Smartsheet.");
}
function compatible(bytes, mime) {
  const magic = bytes.subarray(0,12);
  if (mime === "application/pdf") return bytes.subarray(0,1024).includes(Buffer.from("%PDF-"));
  if (mime.includes("openxmlformats")) return magic.subarray(0,4).equals(Buffer.from("504b0304","hex"));
  if (mime === "image/png") return magic.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex"));
  if (mime === "image/jpeg") return magic.subarray(0,3).equals(Buffer.from("ffd8ff","hex"));
  if (mime === "image/webp") return magic.toString("ascii",0,4) === "RIFF" && magic.toString("ascii",8,12) === "WEBP";
  return !bytes.subarray(0,1024).includes(0);
}

export async function readSelectedFiles(items, { reader, fetchImpl, signal, ensureCurrent }) {
  let remaining = fileLimits.total;
  const files = [];
  for (const saved of items) {
    let meta;
    try { meta = await reader.getAttachment(saved.id, signal); }
    catch (error) {
      signal.throwIfAborted();
      if (error instanceof SmartsheetError) throw new AiError(502, "Получение ссылки Smartsheet. " + error.message);
      throw connectionError("Получение ссылки Smartsheet",error);
    }
    ensureCurrent();
    if (JSON.stringify(attachmentIdentity(meta)) !== JSON.stringify(attachmentIdentity(saved)))
      throw new AiError(409,"Вложение изменилось в Smartsheet. Обнови снимок и открой разбор ещё раз.");
    let bytes;
    try { bytes = await download(meta.url, remaining, fetchImpl, signal); }
    catch (error) {
      signal.throwIfAborted();
      if (error instanceof AiError) throw error;
      throw connectionError("Скачивание файла из хранилища Smartsheet",error);
    }
    const { mime } = attachmentOption(saved);
    if (!compatible(bytes, mime)) throw new AiError(422,"Содержимое файла не соответствует формату: " + saved.name);
    remaining -= bytes.length;
    const data = "data:" + mime + ";base64," + bytes.toString("base64");
    files.push({ id: "file:" + saved.id, hash:createHash("sha256").update(bytes).digest("hex"),
      input: mime.startsWith("image/") ? { type:"input_image", image_url:data, detail:"auto" } :
        { type:"input_file", filename:saved.name, file_data:data } });
  }
  return files;
}
