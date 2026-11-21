import { SmartsheetError } from "./smartsheet.js";
import { creationDay, isNumberingCandidate } from "./numbering-rules.js";

const PENDING = new Set(["reserved", "attempted", "uncertain"]);
const messageOf = error => error instanceof SmartsheetError ? error.message : "Ошибка автонумерации. Проверь локальный журнал номеров и доступ к Smartsheet.";

export function createNumberer({ api, ledger, addEvent, enabled = false, timeZone = "America/New_York", archiveSheetId, archiveColumnId, maxPerCycle = 5 }) {
  let running = null;
  let error = null;
  let lastRun = null;
  let lastReportedError = null;
  let stopped = false;

  function fail(message) { throw new SmartsheetError("numbering_blocked", message); }
  function conflict(job, reason) {
    if (job.state !== "conflict") {
      ledger.markConflict(job.rowId, reason);
      addEvent("numbering_conflict", reason, job.rowId);
    }
    fail(reason);
  }

  async function inventory() {
    const before = await api.readSheet();
    const archive = await api.readInventory(archiveSheetId, archiveColumnId);
    const current = await api.readSheet();
    if (before.version !== current.version) fail("ECF изменилась во время сверки с архивом. Автонумерация повторится на следующем цикле.");
    const items = [...current.rows, ...archive.rows];
    ledger.observeNumbers(items.map(row => row.ecnNumber));
    return { sheet: current, items };
  }

  function usedElsewhere(items, job) {
    return items.some(row => String(row.ecnNumber || "").trim() === job.number && row.id !== job.rowId);
  }

  async function reconcile(job, items) {
    const matches = items.filter(row => row.id === job.rowId);
    const sameNumber = matches.some(row => String(row.ecnNumber || "").trim() === job.number);
    if (usedElsewhere(items, job)) conflict(job, "Номер " + job.number + " уже найден у другой заявки. Требуется сверка; новый номер автоматически не выдан.");
    if (sameNumber) {
      ledger.markAssigned(job.rowId);
      addEvent("numbering_assigned", "Подтверждён номер ECN " + job.number + ".", job.rowId);
      return true;
    }
    if (matches.some(row => String(row.ecnNumber || "").trim())) {
      conflict(job, "У заявки уже другой номер вместо зарезервированного " + job.number + ". Существующий номер сохранён.");
    }
    if (job.state === "attempted" || job.state === "uncertain") {
      const reason = "Не подтверждена запись номера " + job.number + ". Повторная запись остановлена; агент продолжает проверять результат.";
      ledger.markUncertain(job.rowId, reason);
      fail(reason);
    }
    return false;
  }

  async function perform() {
    const result = { assigned: 0, checked: 0, writes: 0, error: null };
    try {
      // Skip the archive when there is nothing to number or recover.
      const first = await api.readSheet();
      ledger.observeNumbers(first.rows.map(row => row.ecnNumber));
      const pending = ledger.assignments().filter(job => PENDING.has(job.state));
      const candidates = first.rows.filter(isNumberingCandidate).sort((a, b) =>
        String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || a.rowNumber - b.rowNumber || a.id.localeCompare(b.id));
      const rowIds = [...new Set([...pending.map(job => job.rowId), ...candidates.map(row => row.id)])];
      for (const rowId of rowIds.slice(0, maxPerCycle)) {
        if (stopped) break;
        result.checked += 1;
        const { sheet, items } = await inventory();
        if (stopped) break;
        let job = ledger.assignment(rowId);
        if (job && PENDING.has(job.state) && await reconcile(job, items)) {
          result.assigned += 1;
          continue;
        }
        const snapshot = sheet.rows.find(row => row.id === rowId);
        if (!snapshot || !isNumberingCandidate(snapshot)) {
          if (job?.state === "reserved") ledger.cancel(rowId, "Строка больше не соответствует условиям автонумерации.");
          continue;
        }
        if (job?.state === "cancelled") job = ledger.resume(rowId);
        if (job && !PENDING.has(job.state)) {
          fail("Для этой строки уже есть запись в журнале номеров (" + job.number + "). Повторное присвоение остановлено для сверки.");
        }
        if (!snapshot.numberWritable) fail(snapshot.numberBlockedReason || "Нет доступа к записи ECN Number. Проверь права аккаунта токена.");
        let day;
        try { day = creationDay(snapshot.createdAt, timeZone); }
        catch { fail("У строки " + snapshot.rowNumber + " нет корректной даты создания. Номер не присвоен."); }
        job = ledger.reserve(rowId, day);
        if (job.day !== day) conflict(job, "Дата создания заявки отличается от даты зарезервированного номера " + job.number + ". Нужна сверка.");
        if (usedElsewhere(items, job)) conflict(job, "Номер " + job.number + " уже используется другой заявкой. Запись остановлена.");

        // No documented compare-and-swap exists in Smartsheet: only one writer may number this sheet.
        const fresh = await api.readRow(rowId);
        if (String(fresh.ecnNumber || "").trim() === job.number) {
          ledger.markAssigned(rowId);
          addEvent("numbering_assigned", "Подтверждён номер ECN " + job.number + ".", rowId);
          result.assigned += 1;
          continue;
        }
        if (!isNumberingCandidate(fresh)) {
          ledger.cancel(rowId, "Номер или статус изменился перед записью. Строка пропущена.");
          continue;
        }
        if (!fresh.numberWritable) fail(fresh.numberBlockedReason || "ECN Number недоступен для записи.");
        if (creationDay(fresh.createdAt, timeZone) !== job.day) conflict(job, "Дата создания заявки изменилась перед присвоением номера. Запись остановлена.");
        // Also catches other rows being numbered after inventory and before this fresh GET.
        if (fresh.sheetVersion !== undefined && fresh.sheetVersion !== sheet.version) {
          fail("ECF изменилась перед записью номера. Автонумерация повторится после новой сверки.");
        }
        if (stopped) break;
        const attempt = ledger.markAttempted(rowId);
        if (attempt?.state !== "attempted") fail("Не удалось сохранить попытку присвоения номера. Запись в Smartsheet остановлена.");
        result.writes += 1;
        try {
          await api.assignNumber(rowId, job.number);
        } catch (failure) {
          if (failure instanceof SmartsheetError && failure.code === "write_failed") {
            ledger.markRejected(rowId, failure.message);
            throw failure;
          }
          ledger.markUncertain(rowId, messageOf(failure));
          // A timed-out PUT may have succeeded. Resolve by reading, never by repeating the PUT.
        }
        let verified;
        try { verified = await api.readRow(rowId); }
        catch {
          ledger.markUncertain(rowId, "Не удалось проверить результат записи " + job.number + ".");
          fail("Не удалось проверить результат записи " + job.number + ". Повторная запись остановлена до сверки.");
        }
        if (String(verified.ecnNumber || "").trim() !== job.number) {
          if (verified.numberOccupied || String(verified.ecnNumber || "").trim()) conflict(job, "После записи обнаружен другой номер ECN. Требуется сверка заявки; повторная запись остановлена.");
          ledger.markUncertain(rowId, "Smartsheet пока не подтвердил номер " + job.number + ".");
          fail("Smartsheet пока не подтвердил номер " + job.number + ". Агент проверит результат на следующем цикле без повторной записи.");
        }
        ledger.markAssigned(rowId);
        addEvent("numbering_assigned", "Присвоен номер ECN " + job.number + " по дате создания заявки.", rowId);
        result.assigned += 1;
      }
      error = null;
      lastReportedError = null;
    } catch (failure) {
      error = messageOf(failure);
      result.error = error;
      if (lastReportedError !== error) {
        addEvent("numbering_error", error);
        lastReportedError = error;
      }
    }
    lastRun = result;
    return result;
  }

  return {
    run() {
      if (!enabled || stopped) return Promise.resolve({ assigned: 0, checked: 0, writes: 0, error: null });
      if (running) return running;
      running = perform().finally(() => { running = null; });
      return running;
    },
    status() {
      return { enabled, dateSource: "createdAt", timeZone, error, lastRun,
        pending: enabled ? ledger.assignments().filter(job => PENDING.has(job.state)).length : 0 };
    },
    stop() { stopped = true; },
  };
}
