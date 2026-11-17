import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const TERMINAL = new Set(["Complete and Closed", "Deleted/Canceled", "Declined"]);

export function isActiveRow(row) {
  return !TERMINAL.has(row.status);
}

function digest(row) {
  const { rowNumber, modifiedAt, ...content } = row;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export function openStore(filename, sheetId) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;");
  db.exec(
    "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);" +
    "CREATE TABLE IF NOT EXISTS rows (id TEXT PRIMARY KEY, hash TEXT NOT NULL, snapshot TEXT NOT NULL);" +
    "CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, detail TEXT);" +
    "CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, row_id TEXT, message TEXT NOT NULL);",
  );
  const getMeta = key => {
    const record = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
    return record ? JSON.parse(record.value) : null;
  };
  const putMeta = (key, value) => db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, JSON.stringify(value));
  const storedSheetId = getMeta("sheetId");
  if (storedSheetId && storedSheetId !== sheetId) {
    db.close();
    throw new Error("База принадлежит другой таблице Smartsheet.");
  }
  putMeta("sheetId", sheetId);

  const addEvent = (kind, message, rowId = null) => db.prepare(
    "INSERT INTO events (at, kind, row_id, message) VALUES (?, ?, ?, ?)",
  ).run(new Date().toISOString(), kind, rowId, message);

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

  return {
    getMeta,
    addEvent,
    recover() {
      transaction(() => {
        const result = db.prepare(
          "UPDATE runs SET status = 'interrupted', finished_at = ? WHERE status = 'running'",
        ).run(new Date().toISOString());
        if (result.changes) addEvent("recovered", "Восстановлено после остановки. Следующий цикл перечитает ECF.");
      });
    },
    setPaused(paused) {
      transaction(() => {
        putMeta("paused", paused);
        addEvent(paused ? "paused" : "resumed", paused ? "Автопроверка на паузе." : "Автопроверка возобновлена.");
      });
    },
    beginRun() {
      return Number(db.prepare(
        "INSERT INTO runs (started_at, status) VALUES (?, 'running')",
      ).run(new Date().toISOString()).lastInsertRowid);
    },
    failRun(runId, message) {
      transaction(() => {
        db.prepare("UPDATE runs SET finished_at = ?, status = 'error', detail = ? WHERE id = ?")
          .run(new Date().toISOString(), message, runId);
        addEvent("error", message);
      });
    },
    saveSheet(sheet, runId) {
      return transaction(() => {
        const baseline = getMeta("lastSyncAt") === null;
        const previous = new Map(db.prepare("SELECT id, hash, snapshot FROM rows").all().map(row => [row.id, row]));
        let added = 0;
        let changed = 0;
        for (const row of sheet.rows) {
          const hash = digest(row);
          const before = previous.get(row.id);
          if (!before) {
            added += 1;
            if (!baseline) addEvent("row_added", "Обнаружена строка " + (row.ecnNumber || "без номера ECN") + ".", row.id);
          } else if (before.hash !== hash) {
            changed += 1;
            const oldStatus = JSON.parse(before.snapshot).status;
            let message = "Изменён ECN " + (row.ecnNumber || "без номера") + ".";
            if (oldStatus !== row.status) message += " Status: " + (oldStatus || "пусто") + " → " + (row.status || "пусто") + ".";
            addEvent("row_changed", message, row.id);
          }
          db.prepare(
            "INSERT INTO rows (id, hash, snapshot) VALUES (?, ?, ?) " +
            "ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, snapshot = excluded.snapshot",
          ).run(row.id, hash, JSON.stringify(row));
          previous.delete(row.id);
        }
        for (const [id, before] of previous) {
          const row = JSON.parse(before.snapshot);
          addEvent("row_removed", "Строка " + (row.ecnNumber || "без номера") + " больше не присутствует в ECF.", id);
          db.prepare("DELETE FROM rows WHERE id = ?").run(id);
        }
        const now = new Date().toISOString();
        putMeta("lastSyncAt", now);
        putMeta("sheet", { name: sheet.name, version: sheet.version, columnCount: sheet.columnCount, unavailableApprovals: sheet.unavailableApprovals });
        const summary = { total: sheet.rows.length, added: baseline ? 0 : added, changed, removed: previous.size };
        db.prepare("UPDATE runs SET finished_at = ?, status = 'success', detail = ? WHERE id = ?")
          .run(now, JSON.stringify(summary), runId);
        addEvent(
          baseline ? "baseline" : "sync",
          baseline
            ? "Загружен первый снимок ECF. Строк: " + sheet.rows.length + "."
            : "ECF проверена. Новых: " + added + ", изменённых: " + changed + ", отсутствующих: " + previous.size + ".",
        );
        return summary;
      });
    },
    row(id) {
      const record = db.prepare("SELECT snapshot FROM rows WHERE id = ?").get(id);
      return record ? JSON.parse(record.snapshot) : null;
    },
    state() {
      const rows = db.prepare("SELECT snapshot FROM rows").all().map(record => JSON.parse(record.snapshot));
      const active = rows.filter(isActiveRow);
      return {
        lastSyncAt: getMeta("lastSyncAt"),
        sheet: getMeta("sheet"),
        paused: getMeta("paused") === true,
        counts: {
          all: rows.length,
          active: active.length,
          withoutNumber: active.filter(row => !row.ecnNumber).length,
          initialReview: active.filter(row => row.status === "Initial Review").length,
          awaitingApprovals: active.filter(row => row.status === "Sent for Approvals").length,
        },
        rows: rows.map(({ description, approvals, ...summary }) => ({ ...summary, active: isActiveRow(summary) }))
          .sort((a, b) => (b.modifiedAt || "").localeCompare(a.modifiedAt || "") || a.rowNumber - b.rowNumber),
        events: db.prepare("SELECT id, at, kind, row_id AS rowId, message FROM events ORDER BY id DESC LIMIT 100").all(),
        lastRun: db.prepare("SELECT id, started_at AS startedAt, finished_at AS finishedAt, status, detail FROM runs ORDER BY id DESC LIMIT 1").get() || null,
      };
    },
    close() {
      db.close();
    },
  };
}
