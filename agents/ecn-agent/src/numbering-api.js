import { FIELDS, idString, SmartsheetError } from "./smartsheet.js";
import { parseEcnNumber } from "./numbering-rules.js";

const API = "https://api.smartsheet.com/2.0/sheets/";
const EDITORS = new Set(["ADMIN", "OWNER", "EDITOR", "EDITOR_SHARE"]);
const ADMIN = new Set(["ADMIN", "OWNER"]);
const filled = value => value !== undefined && value !== null && value !== "";
const cellText = cell => String(cell?.value ?? cell?.displayValue ?? "");

function numericId(value) {
  const number = Number(idString(value));
  if (!Number.isSafeInteger(number)) throw new SmartsheetError("unsafe_id", "Некорректный идентификатор Smartsheet. Запись остановлена.");
  return number;
}

function normalizeRow(row, sheet) {
  if (!row || !Array.isArray(row.cells)) throw new SmartsheetError("numbering_response", "Не удалось прочитать ячейки ECN для автонумерации.");
  const columns = sheet.columns;
  const column = columns.find(item => idString(item.id) === FIELDS.ecnNumber);
  const statusColumn = columns.find(item => idString(item.id) === FIELDS.status);
  if (!column || !statusColumn) throw new SmartsheetError("numbering_schema", "Не найдены колонки ECN Number и Status. Автонумерация остановлена.");
  const cells = new Map(row.cells.map(cell => [idString(cell.columnId), cell]));
  const cell = cells.get(FIELDS.ecnNumber);
  const access = row.accessLevel || sheet.accessLevel;
  const protectedCell = Boolean(cell?.formula || cell?.linkInFromCell || cell?.image || cell?.objectValue);
  const numberOccupied = protectedCell || filled(cell?.value) || filled(cell?.displayValue);
  let reason = null;
  if (column.type !== "TEXT_NUMBER" || column.systemColumnType || column.formula) reason = "Колонка ECN Number имеет неподдерживаемый тип или формулу. Запись остановлена.";
  else if (!EDITORS.has(access) || row.lockedForUser || column.lockedForUser || ((row.locked || column.locked) && !ADMIN.has(access))) reason = "Нет прав на запись в ECN Number. Для заблокированной колонки нужен Admin или Owner.";
  else if (protectedCell) reason = "В ECN Number обнаружена формула, ссылка или другой защищённый тип данных. Запись остановлена.";
  return {
    id: idString(row.id), rowNumber: row.rowNumber, createdAt: row.createdAt || null,
    ecnNumber: cellText(cell), status: cellText(cells.get(FIELDS.status)),
    numberOccupied, numberWritable: reason === null, numberBlockedReason: reason,
    sheetVersion: sheet.version,
  };
}

export function createNumberingApi({ sheetId, token, fetchImpl = fetch }) {
  sheetId = idString(sheetId);
  const headers = { Authorization: "Bearer " + token, Accept: "application/json", "smartsheet-integration-source": "SCRIPT,DWK,ECNNumbering" };

  async function readJson(url, signal) {
    if (!token) throw new SmartsheetError("missing_token", "Для автонумерации нужен SMARTSHEET_API_TOKEN.");
    try {
      const response = await fetchImpl(url, { method: "GET", headers, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]) });
      if (!response.ok) {
        await response.body?.cancel();
        throw new SmartsheetError("numbering_read_" + response.status, "Не удалось сверить ECF или архив для нумерации. HTTP " + response.status + ". Запись не выполнена.");
      }
      return await response.json();
    } catch (error) {
      if (error instanceof SmartsheetError) throw error;
      throw new SmartsheetError("numbering_connection", "Не удалось прочитать данные для нумерации. Проверка повторится на следующем цикле.");
    }
  }

  async function fullSheet(targetId, columnIds) {
    targetId = idString(targetId);
    const signal = AbortSignal.timeout(90_000);
    async function page(number) {
      const url = new URL(API + targetId);
      url.searchParams.set("pageSize", "500");
      url.searchParams.set("page", String(number));
      url.searchParams.set("columnIds", columnIds.join(","));
      const value = await readJson(url, signal);
      if (!value || idString(value.id) !== targetId || !Array.isArray(value.rows) || !Array.isArray(value.columns) ||
          !Number.isSafeInteger(value.totalRowCount) || value.totalRowCount < 0 || !Number.isSafeInteger(value.version) ||
          columnIds.some(id => !value.columns.some(column => idString(column.id) === id))) {
        throw new SmartsheetError("numbering_incomplete", "Получены неполные данные ECF или архива. Номера не присвоены.");
      }
      return value;
    }
    const first = await page(1);
    const rows = [...first.rows];
    for (let number = 2; number <= Math.ceil(first.totalRowCount / 500); number++) {
      const part = await page(number);
      if (part.version !== first.version || part.totalRowCount !== first.totalRowCount) throw new SmartsheetError("numbering_changed", "Таблица изменилась во время чтения номеров. Проверка повторится.");
      rows.push(...part.rows);
    }
    if (rows.length !== first.totalRowCount || new Set(rows.map(row => idString(row.id))).size !== rows.length) {
      throw new SmartsheetError("numbering_incomplete", "Получен неполный список строк для нумерации. Запись остановлена.");
    }
    const verify = await page(1);
    if (verify.version !== first.version || verify.totalRowCount !== first.totalRowCount) throw new SmartsheetError("numbering_changed", "Таблица изменилась во время чтения номеров. Проверка повторится.");
    return { ...first, rows };
  }

  return {
    async readSheet() {
      const sheet = await fullSheet(sheetId, [FIELDS.ecnNumber, FIELDS.status]);
      return { id: sheetId, version: sheet.version, rows: sheet.rows.map(row => normalizeRow(row, sheet)) };
    },
    async readInventory(targetId, columnId) {
      columnId = idString(columnId);
      const sheet = await fullSheet(targetId, [columnId]);
      return { sheetId: idString(sheet.id), version: sheet.version, rows: sheet.rows.map(row => {
        if (!Array.isArray(row.cells)) throw new SmartsheetError("numbering_incomplete", "Нет ячеек в архивном снимке. Запись остановлена.");
        return { id: idString(row.id), ecnNumber: cellText(row.cells.find(cell => idString(cell.columnId) === columnId)) };
      }) };
    },
    async readRow(rowId) {
      rowId = idString(rowId);
      const url = new URL(API + sheetId + "/rows/" + rowId);
      url.searchParams.set("include", "columns,columnType,objectValue");
      url.searchParams.set("level", "2");
      const row = await readJson(url, AbortSignal.timeout(30_000));
      if (!row || idString(row.id) !== rowId || idString(row.sheetId) !== sheetId || !Array.isArray(row.columns) || !Number.isSafeInteger(row.version)) {
        throw new SmartsheetError("numbering_response", "Не удалось проверить выбранную строку ECN. Запись остановлена.");
      }
      return normalizeRow(row, row);
    },
    async assignNumber(rowId, number) {
      if (!token) throw new SmartsheetError("write_failed", "Для записи номера нужен SMARTSHEET_API_TOKEN.");
      if (!parseEcnNumber(number)) throw new SmartsheetError("write_failed", "Номер ECN не соответствует формату YYYYMMDD-NN.");
      const id = numericId(rowId);
      const body = [{ id, cells: [{ columnId: numericId(FIELDS.ecnNumber), value: number, strict: true }] }];
      try {
        // Never retry a mutation: an interrupted response does not establish that the write failed.
        const response = await fetchImpl(new URL(API + sheetId + "/rows"), {
          method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body),
          redirect: "error", signal: AbortSignal.timeout(25_000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          const definite = [400, 401, 403, 404, 405, 409, 422, 429].includes(response.status);
          throw new SmartsheetError(definite ? "write_failed" : "write_uncertain", "Smartsheet " + (definite ? "отклонил запись номера" : "не подтвердил запись номера") + ". HTTP " + response.status + ".");
        }
        const result = await response.json();
        const updated = Array.isArray(result.result) ? result.result : [result.result];
        if (result.resultCode !== 0 || !updated.some(row => row && String(row.id) === String(id) &&
            row.cells?.some(cell => String(cell.columnId) === FIELDS.ecnNumber && cell.value === number))) {
          throw new SmartsheetError("write_uncertain", "Ответ Smartsheet не подтвердил номер. Требуется проверка результата записи.");
        }
        return { rowId: String(id), number };
      } catch (error) {
        if (error instanceof SmartsheetError) throw error;
        throw new SmartsheetError("write_uncertain", "Связь прервалась при записи номера. Результат будет проверен без повторной записи.");
      }
    },
  };
}
