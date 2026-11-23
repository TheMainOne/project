import { setTimeout as delay } from "node:timers/promises";
import { SmartsheetError } from "./smartsheet.js";
import { creationDay, formatEcnNumber, isNumberingCandidate, parseEcnNumber } from "./numbering-rules.js";

const messageOf = error => error instanceof SmartsheetError ? error.message : "Ошибка автонумерации. Проверь локальный журнал номеров и доступ к Smartsheet.";
const VERIFY_FIRST = new Set(["attempted", "uncertain", "conflict"]);
const isOpen = job => job.state === "reserved" || VERIFY_FIRST.has(job.state);

function dayForWritableRow(row, timeZone) {
  if (!row.numberWritable) {
    const code = row.numberBlockScope === "row" ? "numbering_row_blocked" : "numbering_blocked";
    throw new SmartsheetError(code, row.numberBlockedReason || "Нет доступа к записи ECN Number.");
  }
  try { return creationDay(row.createdAt, timeZone); }
  catch { throw new SmartsheetError("numbering_row_blocked", "У строки нет корректной даты создания."); }
}

function labelForRow(rowId, rowNumber) {
  return rowNumber == null ? "Row ID " + rowId : "Строка " + rowNumber;
}

function cycleMessage(result) {
  if (result.candidates === null) return "Нумерация не началась. " + result.error;
  const parts = [
    "Кандидатов " + result.candidates,
    "присвоено " + (result.assigned - result.recovered),
    "отложено " + result.deferred,
  ];
  if (result.queueSize > result.candidates) parts.push("дополнительно из журнала " + (result.queueSize - result.candidates));
  if (result.recovered) parts.push("подтверждено ранее выданных " + result.recovered);
  if (result.ineligible) parts.push("выбыли из очереди " + result.ineligible);
  if (result.blocked) parts.push("с ограничениями по строке " + result.blocked);
  let message = "Автонумерация. " + parts.join(", ") + ".";
  if (result.error) message += " " + result.error;
  else if (result.stopped) message += " Агент завершает работу.";
  else if (result.checked < result.queueSize) message += " Достигнут лимит строк за цикл.";
  if (result.firstDeferral) message += " " + result.firstDeferral;
  return message;
}

export function createNumberer({ api, ledger, addEvent, enabled = false, timeZone = "America/New_York", archiveSheetId, archiveColumnId, maxPerCycle = 5, wait = delay }) {
  let running = null;
  let error = null;
  let lastRun = null;
  let lastReportedError = null;
  let stopped = false;
  let reportedDuplicates = new Set();
  // Revisit locally blocked rows after other candidates. Renew their order on each deferral.
  const deferredRows = new Set();

  function fail(message) { throw new SmartsheetError("numbering_blocked", message); }
  function conflict(job, reason) {
    if (job.state !== "conflict") {
      ledger.markConflict(job.rowId, reason);
      addEvent("numbering_conflict", reason, job.rowId);
    }
    const failure = new SmartsheetError("numbering_blocked", reason);
    failure.rowId = job.rowId;
    throw failure;
  }

  function checkReservation(job, owners) {
    const ids = owners.get(job.number);
    if (ids && (ids.size > 1 || !ids.has(job.rowId))) {
      conflict(job, "Номер " + job.number + " зарезервирован за Row ID " + job.rowId +
        ", но найден у другой заявки. Требуется сверка.");
    }
  }

  function reportExistingDuplicates(owners) {
    const duplicates = new Set();
    const examples = [];
    let newCount = 0;
    for (const [number, ids] of owners) {
      if (ids.size < 2) continue;
      duplicates.add(number);
      if (reportedDuplicates.has(number)) continue;
      newCount++;
      if (examples.length < 3) examples.push(number + " (Row ID " + [...ids].slice(0, 2).join(" и ") + ")");
    }
    if (newCount) {
      const more = newCount > examples.length ? " и ещё " + (newCount - examples.length) : "";
      addEvent("numbering_duplicate", "Повтор у ранее пронумерованных строк: " + examples.join(", ") + more +
        ". Эти номера учтены как занятые.");
    }
    reportedDuplicates = duplicates;
  }

  async function inventory() {
    const before = await api.readSheet();
    const archive = await api.readInventory(archiveSheetId, archiveColumnId);
    const current = await api.readSheet();
    if (before.version !== current.version) throw new SmartsheetError("numbering_changed", "ECF изменилась во время сверки с архивом.");
    const items = [...current.rows, ...archive.rows];
    const owners = new Map();
    const openJobs = new Map(ledger.assignments().filter(isOpen).map(job => [job.rowId, job]));
    for (const row of items) {
      const number = String(row.ecnNumber || "").trim();
      const job = openJobs.get(row.id);
      if (job && number && number !== job.number) {
        conflict(job, "У заявки уже другой номер вместо зарезервированного " + job.number + ". Существующий номер сохранён.");
      }
      const parsed = parseEcnNumber(number);
      if (!parsed) continue;
      const key = formatEcnNumber(parsed.day, parsed.sequence);
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key).add(row.id);
    }
    // Check every outstanding reservation, even a row outside this cycle's five-row limit.
    for (const job of openJobs.values()) checkReservation(job, owners);
    ledger.observeNumbers(owners.keys());
    reportExistingDuplicates(owners);
    return { sheet: current, items, owners };
  }

  function reconcile(job, items) {
    const matches = items.filter(row => row.id === job.rowId);
    const sameNumber = matches.some(row => String(row.ecnNumber || "").trim() === job.number);
    if (sameNumber) {
      ledger.markAssigned(job.rowId);
      addEvent("numbering_assigned", "Подтверждён номер ECN " + job.number + ".", job.rowId);
      return true;
    }
    if (job.state === "conflict") fail(job.error || "Нужна сверка номера " + job.number + ".");
    if (job.state === "attempted" || job.state === "uncertain") {
      const reason = "Не подтверждена запись номера " + job.number + ". Повторная запись остановлена; агент продолжает проверять результат.";
      ledger.markUncertain(job.rowId, reason);
      fail(reason);
    }
    return false;
  }

  async function prepareAssignment(rowId, result) {
    const { sheet, items, owners } = await inventory();
    if (stopped) return null;
    let job = ledger.assignment(rowId);
    if (job && isOpen(job) && reconcile(job, items)) {
      result.assigned += 1;
      result.recovered += 1;
      return null;
    }
    const snapshot = sheet.rows.find(row => row.id === rowId);
    if (!snapshot || !isNumberingCandidate(snapshot)) {
      if (job?.state === "reserved") ledger.cancel(rowId, "Строка больше не соответствует условиям автонумерации.");
      result.ineligible += 1;
      return null;
    }
    if (job?.state === "cancelled") job = ledger.resume(rowId);
    if (job && !isOpen(job)) {
      fail("Для этой строки уже есть запись в журнале номеров (" + job.number + "). Повторное присвоение остановлено для сверки.");
    }
    const day = dayForWritableRow(snapshot, timeZone);
    job = ledger.reserve(rowId, day);
    if (job.day !== day) conflict(job, "Дата создания заявки отличается от даты зарезервированного номера " + job.number + ". Нужна сверка.");
    checkReservation(job, owners);

    // No documented compare-and-swap exists in Smartsheet: only one writer may number this sheet.
    const fresh = await api.readRow(rowId);
    if (String(fresh.ecnNumber || "").trim() === job.number) {
      ledger.markAssigned(rowId);
      addEvent("numbering_assigned", "Подтверждён номер ECN " + job.number + ".", rowId);
      result.assigned += 1;
      result.recovered += 1;
      return null;
    }
    if (!isNumberingCandidate(fresh)) {
      ledger.cancel(rowId, "Номер или статус изменился перед записью. Строка пропущена.");
      result.ineligible += 1;
      return null;
    }
    if (dayForWritableRow(fresh, timeZone) !== job.day) conflict(job, "Дата создания заявки изменилась перед присвоением номера. Запись остановлена.");
    // Also catches other rows being numbered after inventory and before this fresh GET.
    if (fresh.sheetVersion !== undefined && fresh.sheetVersion !== sheet.version) {
      throw new SmartsheetError("numbering_changed", "ECF изменилась перед записью номера.");
    }
    return job;
  }

  // Only pre-write reads can restart. The PUT and its verification are outside this loop.
  async function prepareStableAssignment(rowId, result) {
    const retryDelays = [500, 1000, 2000];
    for (let retry = 0; !stopped; retry++) {
      try {
        return await prepareAssignment(rowId, result);
      } catch (failure) {
        if (!(failure instanceof SmartsheetError) || failure.code !== "numbering_changed") throw failure;
        if (retry === retryDelays.length) {
          fail(failure.message + " Не удалось получить стабильный снимок после трёх повторных сверок. Проверка продолжится в следующем цикле.");
        }
        await wait(retryDelays[retry]);
      }
    }
    return null;
  }

  async function assignAndVerify(job, result) {
    const rowId = job.rowId;
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

  async function perform() {
    const result = { assigned: 0, checked: 0, writes: 0, error: null, candidates: null, queueSize: null,
      recovered: 0, ineligible: 0, blocked: 0, firstDeferral: null, deferred: null, stopped: false };
    let activeId = null;
    let rowsById;
    try {
      // Skip the archive when there is nothing to number or recover.
      const first = await api.readSheet();
      ledger.observeNumbers(first.rows.map(row => row.ecnNumber));
      const pending = ledger.assignments().filter(isOpen);
      rowsById = new Map(first.rows.map(row => [row.id, row]));
      const candidates = first.rows.filter(isNumberingCandidate).sort((a, b) =>
        String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || a.rowNumber - b.rowNumber || a.id.localeCompare(b.id));
      result.candidates = candidates.length;
      const normal = new Set([...pending.map(job => job.rowId), ...candidates.map(row => row.id)]);
      const localLast = [];
      for (const id of normal) {
        if (rowsById.get(id)?.numberBlockScope === "row") localLast.push(id);
      }
      for (const id of [...localLast, ...deferredRows]) {
        if (normal.delete(id)) normal.add(id);
        else deferredRows.delete(id);
      }
      // A previous ambiguous PUT or recorded conflict must be resolved before any new PUT.
      const recovery = pending.filter(job => VERIFY_FIRST.has(job.state)).map(job => job.rowId);
      const queue = [...new Set([...recovery, ...normal])];
      result.queueSize = queue.length;
      for (const rowId of queue.slice(0, maxPerCycle)) {
        if (stopped) break;
        activeId = rowId;
        result.checked += 1;
        let job;
        try {
          job = await prepareStableAssignment(rowId, result);
        } catch (failure) {
          if (!(failure instanceof SmartsheetError) || failure.code !== "numbering_row_blocked") throw failure;
          deferredRows.delete(rowId);
          deferredRows.add(rowId);
          result.blocked += 1;
          const detail = labelForRow(rowId, rowsById.get(rowId)?.rowNumber) + ". " + failure.message;
          result.firstDeferral ??= detail;
          addEvent("numbering_deferred", detail, rowId);
          continue;
        }
        deferredRows.delete(rowId);
        if (stopped) break;
        if (job) await assignAndVerify(job, result);
      }
      error = null;
      lastReportedError = null;
    } catch (failure) {
      if (failure instanceof SmartsheetError && failure.rowId) activeId = failure.rowId;
      const location = activeId ? labelForRow(activeId, rowsById.get(activeId)?.rowNumber) + ". " : "";
      error = location + messageOf(failure);
      result.error = error;
      if (lastReportedError !== error) {
        addEvent("numbering_error", error, activeId);
        lastReportedError = error;
      }
    }
    result.stopped = stopped;
    if (result.queueSize !== null) result.deferred = result.queueSize - result.assigned - result.ineligible;
    addEvent("numbering_summary", cycleMessage(result), result.error ? activeId : null);
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
        pending: enabled ? ledger.assignments().filter(isOpen).length : 0 };
    },
    stop() { stopped = true; },
  };
}
