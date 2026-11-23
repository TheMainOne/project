import { SmartsheetError } from "./smartsheet.js";

export function createMonitor({ reader, store, pollSeconds, tokenConfigured, numberer }) {
  let timer = null;
  let running = null;
  let readingOnly = false;
  let stopped = false;
  let error = null;
  let lastNumberingError = null;
  let nextCheckAt = null;

  function schedule() {
    clearTimeout(timer);
    nextCheckAt = null;
    if (stopped || !tokenConfigured || store.getMeta("paused")) return;
    nextCheckAt = new Date(Date.now() + pollSeconds * 1000).toISOString();
    timer = setTimeout(poll, pollSeconds * 1000);
  }

  function poll() {
    nextCheckAt = null;
    if (stopped || store.getMeta("paused")) return;
    if (readingOnly && running) {
      void running.then(poll);
      return;
    }
    void sync();
  }

  function runCycle(withNumbering) {
    if (stopped || !tokenConfigured) return Promise.resolve({ ok: false });
    if (withNumbering) {
      clearTimeout(timer);
      nextCheckAt = null;
    }
    readingOnly = !withNumbering;
    running = (async () => {
      let runId = store.beginRun();
      let snapshotSaved = false;
      try {
        const sheet = await reader.read();
        let summary = store.saveSheet(sheet, runId);
        snapshotSaved = true;
        const numbering = withNumbering && numberer ? await numberer.run() : null;
        if (withNumbering) lastNumberingError = numbering?.error || null;
        if (numbering?.writes || numbering?.assigned) {
          runId = store.beginRun();
          summary = store.saveSheet(await reader.read(), runId);
        }
        error = lastNumberingError;
        return { ok: !error, summary, ...(numbering ? { numbering } : {}) };
      } catch (failure) {
        error = failure instanceof SmartsheetError
          ? failure.message
          : "Ошибка локального сохранения. Проверь свободное место и доступ к папке data.";
        store.failRun(runId, error);
        if (withNumbering && numberer && !snapshotSaved) {
          store.addEvent("numbering_error", "Нумерация не началась. Не удалось получить снимок ECF. " + error);
        }
        return { ok: false, error };
      }
    })().catch(() => {
      error = "Не удалось записать журнал. Проверь папку data и перезапусти приложение.";
      stopped = true;
      return { ok: false, error };
    }).finally(() => {
      running = null;
      readingOnly = false;
      if (withNumbering) schedule();
    });
    return running;
  }

  function sync() {
    if (!running) return runCycle(true);
    return readingOnly ? running.then(sync) : running;
  }

  return {
    start() {
      store.recover();
      if (!store.getMeta("paused")) void sync();
    },
    sync,
    async refreshAfterWrite() {
      // A read already in flight may predate the submitted comment. Schedule a fresh read after it.
      if (running) await running;
      // A new cycle started after the comment can already see it.
      return running || runCycle(false);
    },
    setPaused(paused) {
      store.setPaused(paused);
      if (paused) {
        clearTimeout(timer);
        nextCheckAt = null;
      } else {
        poll();
      }
    },
    status() {
      return {
        running: running !== null,
        nextCheckAt,
        error,
        numbering: numberer?.status() || { enabled: false },
        state: !tokenConfigured ? "needs_token" : error ? "error" : running ? "syncing" : store.getMeta("paused") ? "paused" : "watching",
      };
    },
    async stop() {
      stopped = true;
      numberer?.stop();
      clearTimeout(timer);
      nextCheckAt = null;
      await running;
    },
  };
}
