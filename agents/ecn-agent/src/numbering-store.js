import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseEcnNumber, formatEcnNumber } from "./numbering-rules.js";

export class NumberingStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "NumberingStoreError";
    this.code = code;
  }
}

function checkedRowId(value) {
  if ((typeof value === "number" && !Number.isSafeInteger(value)) || !/^[1-9]\d*$/.test(String(value))) {
    throw new NumberingStoreError("invalid_row", "Некорректный идентификатор ECN для нумерации.");
  }
  return String(value);
}

const assignmentColumns = "row_id AS rowId, day, sequence, number, state, error, attempted_at AS attemptedAt, updated_at AS updatedAt";

export function openNumberingStore(filename, { acquireLock = true } = {}) {
  mkdirSync(dirname(filename), { recursive: true });
  let lock;
  let db;
  try {
    if (acquireLock) {
      lock = new DatabaseSync(filename + ".lock.sqlite");
      try {
        // Keep the process lock separate from the short transactions in the ledger.
        // SQLite releases this OS lock if the process exits, including an abrupt exit.
        lock.exec("PRAGMA busy_timeout = 0; PRAGMA journal_mode = DELETE; BEGIN EXCLUSIVE;");
      } catch (error) {
        if (error.errcode === 5 || error.errcode === 6 || /database (?:is )?locked/i.test(error.message)) {
          throw new NumberingStoreError("already_running", "Нумерация ECN уже запущена другим экземпляром агента. Закрой его перед запуском нового.");
        }
        throw error;
      }
    }
    db = new DatabaseSync(filename);
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;");
    db.exec(
      "CREATE TABLE IF NOT EXISTS numbering_counters (day TEXT PRIMARY KEY, last_sequence INTEGER NOT NULL CHECK(last_sequence >= 0));" +
      "CREATE TABLE IF NOT EXISTS numbering_assignments (" +
        "row_id TEXT PRIMARY KEY, day TEXT NOT NULL, sequence INTEGER NOT NULL CHECK(sequence > 0), " +
        "number TEXT NOT NULL UNIQUE, state TEXT NOT NULL CHECK(state IN ('reserved', 'attempted', 'assigned', 'conflict', 'uncertain', 'cancelled')), " +
        "error TEXT, attempted_at TEXT, updated_at TEXT NOT NULL, UNIQUE(day, sequence));",
    );
  } catch (error) {
    db?.close();
    lock?.close();
    throw error;
  }

  function transaction(work) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function assignment(rowId) {
    return db.prepare("SELECT " + assignmentColumns + " FROM numbering_assignments WHERE row_id = ?").get(checkedRowId(rowId)) || null;
  }

  function setState(rowId, state, reason = null) {
    rowId = checkedRowId(rowId);
    return transaction(() => {
      const current = assignment(rowId);
      if (!current || (state === "attempted" && current.state !== "reserved") ||
          (state === "reserved" && current.state !== "attempted")) return current;
      const now = new Date().toISOString();
      const error = reason == null ? null : String(reason);
      if (state === "attempted") {
        db.prepare("UPDATE numbering_assignments SET state = ?, error = ?, attempted_at = ?, updated_at = ? WHERE row_id = ?")
          .run(state, error, now, now, rowId);
      } else {
        db.prepare("UPDATE numbering_assignments SET state = ?, error = ?, updated_at = ? WHERE row_id = ?")
          .run(state, error, now, rowId);
      }
      return assignment(rowId);
    });
  }

  let closed = false;
  return {
    observeNumbers(numbers) {
      return transaction(() => {
        const update = db.prepare(
          "INSERT INTO numbering_counters (day, last_sequence) VALUES (?, ?) " +
          "ON CONFLICT(day) DO UPDATE SET last_sequence = MAX(numbering_counters.last_sequence, excluded.last_sequence)",
        );
        for (const number of numbers) {
          const parsed = parseEcnNumber(number);
          if (parsed) update.run(parsed.day, parsed.sequence);
        }
      });
    },
    reserve(rowId, day) {
      rowId = checkedRowId(rowId);
      return transaction(() => {
        const existing = assignment(rowId);
        // A binding is permanent, even after conflict, cancellation, or a date change.
        if (existing) return existing;
        let number;
        let sequence;
        try {
          formatEcnNumber(day, 1);
          const counter = db.prepare("SELECT last_sequence FROM numbering_counters WHERE day = ?").get(day);
          sequence = (counter?.last_sequence || 0) + 1;
          if (!Number.isSafeInteger(sequence)) throw new Error();
          number = formatEcnNumber(day, sequence);
        } catch {
          throw new NumberingStoreError("invalid_number", "Не удалось зарезервировать номер ECN: проверь дату создания и допустимый диапазон номеров.");
        }
        const now = new Date().toISOString();
        db.prepare("INSERT INTO numbering_assignments (row_id, day, sequence, number, state, updated_at) VALUES (?, ?, ?, ?, 'reserved', ?)")
          .run(rowId, day, sequence, number, now);
        db.prepare("INSERT INTO numbering_counters (day, last_sequence) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET last_sequence = excluded.last_sequence")
          .run(day, sequence);
        return assignment(rowId);
      });
    },
    assignment,
    assignments() {
      return db.prepare("SELECT " + assignmentColumns + " FROM numbering_assignments ORDER BY day, sequence").all();
    },
    markAttempted: rowId => setState(rowId, "attempted"),
    markRejected: (rowId, reason) => setState(rowId, "reserved", reason),
    resume(rowId) {
      rowId = checkedRowId(rowId);
      db.prepare("UPDATE numbering_assignments SET state = 'reserved', error = NULL, updated_at = ? WHERE row_id = ? AND state = 'cancelled'")
        .run(new Date().toISOString(), rowId);
      return assignment(rowId);
    },
    markAssigned: rowId => setState(rowId, "assigned"),
    markConflict: (rowId, reason) => setState(rowId, "conflict", reason),
    markUncertain: (rowId, reason) => setState(rowId, "uncertain", reason),
    cancel: (rowId, reason) => setState(rowId, "cancelled", reason),
    close() {
      if (closed) return;
      closed = true;
      try {
        db.close();
      } finally {
        lock?.close();
      }
    },
  };
}
