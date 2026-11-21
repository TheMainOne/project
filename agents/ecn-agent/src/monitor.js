import { SmartsheetError } from "./smartsheet.js";

export function createMonitor({ reader, store, pollSeconds, tokenConfigured, numberer }) {
  let timer = null;
  let running = null;
  let stopped = false;
  let error = null;
  let nextCheckAt = null;

  function schedule() {
    clearTimeout(timer);
    nextCheckAt = null;
    if (stopped || !tokenConfigured || store.getMeta("paused")) return;
    nextCheckAt = new Date(Date.now() + pollSeconds * 1000).toISOString();
    timer = setTimeout(() => { void sync(); }, pollSeconds * 1000);
  }

  function sync() {
    if (running) return running;
    if (stopped || !tokenConfigured) return Promise.resolve({ ok: false });
    clearTimeout(timer);
    nextCheckAt = null;
    running = (async () => {
      let runId = store.beginRun();
      try {
        const sheet = await reader.read();
        let summary = store.saveSheet(sheet, runId);
        const numbering = numberer ? await numberer.run() : null;
        if (numbering?.writes || numbering?.assigned) {
          runId = store.beginRun();
          summary = store.saveSheet(await reader.read(), runId);
        }
        error = numbering?.error || null;
        return { ok: !error, summary, ...(numbering ? { numbering } : {}) };
      } catch (failure) {
        error = failure instanceof SmartsheetError
          ? failure.message
          : "Ошибка локального сохранения. Проверь свободное место и доступ к папке data.";
        store.failRun(runId, error);
        return { ok: false, error };
      }
    })().catch(() => {
      error = "Не удалось записать журнал. Проверь папку data и перезапусти приложение.";
      stopped = true;
      return { ok: false, error };
    }).finally(() => {
      running = null;
      schedule();
    });
    return running;
  }

  return {
    start() {
      store.recover();
      if (!store.getMeta("paused")) void sync();
    },
    sync,
    setPaused(paused) {
      store.setPaused(paused);
      if (paused) {
        clearTimeout(timer);
        nextCheckAt = null;
      } else if (!running) {
        void sync();
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
