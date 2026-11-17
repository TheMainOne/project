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
  if (cell.displayValue !== undefined) return String(cell.displayValue);
  if (cell.value !== undefined) return String(cell.value);
  const object = cell.objectValue;
  if (Array.isArray(object?.values)) return object.values.map(String).join(", ");
  if (Array.isArray(object?.contacts)) {
    return object.contacts.map(contact => contact.name || contact.email || "").join(", ");
  }
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
  const columnIds = new Set(sheet.columns.map(column => idString(column.id)));
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
  const rows = sheet.rows.map(row => {
    const cells = new Map(row.cells.map(cell => [idString(cell.columnId), cell]));
    const fields = Object.fromEntries(
      Object.entries(FIELDS).map(([name, id]) => [name, cellText(cells.get(id))]),
    );
    return {
      id: idString(row.id),
      rowNumber: row.rowNumber,
      ...fields,
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
    unavailableApprovals,
    rows,
  };
}

export function createSmartsheetReader({ sheetId, token, fetchImpl = fetch, wait = delay }) {
  idString(sheetId);
  const pageSize = 500;

  async function readPage(page, signal) {
    const url = new URL("https://api.smartsheet.com/2.0/sheets/" + sheetId);
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("page", String(page));
    url.searchParams.set("level", "2");
    url.searchParams.set("include", "objectValue");
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
        const seconds = retryAfter && /^\d+(\.\d+)?$/.test(retryAfter)
          ? Number(retryAfter)
          : 2 ** attempt * 2;
        await response.body?.cancel();
        if (seconds > 60) {
          throw new SmartsheetError("rate_limited", "Smartsheet ограничил запросы. Повтор будет на следующем цикле.");
        }
        await wait(seconds * 1000, undefined, { signal });
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        const messages = {
          401: "Smartsheet отклонил токен. Проверь SMARTSHEET_API_TOKEN в .env.",
          403: "У аккаунта токена нет доступа к ECF.",
          404: "Smartsheet не нашёл ECF для этого аккаунта.",
          429: "Smartsheet ограничил запросы. Повтор будет на следующем цикле.",
        };
        throw new SmartsheetError(
          "http_" + response.status,
          messages[response.status] || "Smartsheet временно недоступен. HTTP " + response.status,
        );
      }
      const sheet = await response.json();
      if (
        idString(sheet.id) !== sheetId ||
        !Number.isSafeInteger(sheet.totalRowCount) ||
        sheet.totalRowCount < 0 ||
        !Number.isSafeInteger(sheet.version) ||
        !Array.isArray(sheet.rows) ||
        !Array.isArray(sheet.columns)
      ) {
        throw new SmartsheetError("invalid_response", "Неожиданный формат ответа Smartsheet.");
      }
      return sheet;
    }
  }

  return {
    async read() {
      if (!token) {
        throw new SmartsheetError("missing_token", "Заполни SMARTSHEET_API_TOKEN в .env и перезапусти агента.");
      }
      const signal = AbortSignal.timeout(90_000);
      let first;
      try {
        first = await readPage(1, signal);
        const rows = [...first.rows];
        const pages = Math.ceil(first.totalRowCount / pageSize);
        for (let page = 2; page <= pages; page += 1) {
          const part = await readPage(page, signal);
          if (part.version !== first.version || part.totalRowCount !== first.totalRowCount) {
            throw new SmartsheetError("sheet_changed", "ECF изменилась во время чтения. Полный снимок будет повторён.");
          }
          rows.push(...part.rows);
        }
        if (pages > 1) {
          const verify = await readPage(1, signal);
          if (verify.version !== first.version || verify.totalRowCount !== first.totalRowCount) {
            throw new SmartsheetError("sheet_changed", "ECF изменилась во время чтения. Полный снимок будет повторён.");
          }
        }
        const uniqueIds = new Set(rows.map(row => idString(row.id)));
        if (uniqueIds.size !== first.totalRowCount || rows.length !== first.totalRowCount) {
          throw new SmartsheetError("incomplete_read", "Получена неполная ECF. Сохранён предыдущий снимок.");
        }
        return normalizeSheet({ ...first, rows });
      } catch (error) {
        if (error instanceof SmartsheetError) throw error;
        throw new SmartsheetError("connection_failed", "Не удалось прочитать ECF. Проверь интернет, VPN и доступ к Smartsheet.");
      }
    },
  };
}
