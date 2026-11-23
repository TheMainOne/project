import { loadConfig } from "./config.js";
import { openStore } from "./store.js";
import { createSmartsheetReader } from "./smartsheet.js";
import { createMonitor } from "./monitor.js";
import { createPanelServer } from "./http.js";
import { createNumberingApi } from "./numbering-api.js";
import { openNumberingStore } from "./numbering-store.js";
import { createNumberer } from "./numbering.js";
import { createSmartsheetWriter } from "./smartsheet-write.js";
import { createCommentService, createWriteQueue } from "./comment-service.js";

if (Number(process.versions.node.split(".")[0]) < 24) {
  console.error("Для этого комплекта нужен Node.js 24 LTS или новее.");
  process.exit(1);
}

let store;
let server;
let monitor;
let numberingStore;
let comments;
try {
  const config = loadConfig();
  store = openStore(config.databasePath, config.sheetId);
  const reader = createSmartsheetReader({ sheetId: config.sheetId, token: config.token });
  const runExclusive = createWriteQueue();
  let numberer;
  if (config.autoNumber && config.token) {
    numberingStore = openNumberingStore(config.numberingDatabasePath);
    numberer = createNumberer({
      api: createNumberingApi({ sheetId: config.sheetId, token: config.token }), ledger: numberingStore,
      addEvent: store.addEvent, enabled: true, timeZone: config.numberingTimeZone,
      archiveSheetId: config.archiveSheetId, archiveColumnId: config.archiveNumberColumnId,
    });
  }
  monitor = createMonitor({
    reader,
    store,
    pollSeconds: config.pollSeconds,
    tokenConfigured: Boolean(config.token),
    numberer: numberer ? { run: () => runExclusive(() => numberer.run()), stop: () => numberer.stop(), status: () => numberer.status() } : undefined,
  });
  comments = createCommentService({ filename: config.databasePath, sheetId: config.sheetId, store,
    writer: createSmartsheetWriter({ sheetId: config.sheetId, token: config.token }),
    refresh: () => monitor.refreshAfterWrite(), runExclusive });
  server = createPanelServer({ config, store, monitor, reader, comments });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, "127.0.0.1", resolve);
  });
  monitor.start();
  console.log("ECN Agent — http://127.0.0.1:" + config.port);
  console.log("ECF " + config.sheetId + " · " + (numberer ? "автонумерация Initial Review по дате создания" : "наблюдение") + " · интервал " + config.pollSeconds + " с");
  console.log("Состояние и журнал: " + config.databasePath);
  if (!config.token) console.log("Заполни SMARTSHEET_API_TOKEN в agents/ecn-agent/.env и перезапусти приложение.");
} catch (error) {
  await comments?.close();
  numberingStore?.close();
  store?.close();
  const message = error.code === "EADDRINUSE"
    ? "Порт занят. Проверь, запущен ли уже ECN Agent, или измени ECN_PORT в .env."
    : "Запуск не удался. " + (error.message || "Проверь Node.js, .env и доступ к папке data.");
  console.error(message);
  process.exitCode = 1;
}

if (server?.listening) {
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    console.log("Завершаю текущую проверку и закрываю журнал…");
    server.close();
    await Promise.all([monitor.stop(), comments.close()]);
    server.closeAllConnections();
    store.close();
    numberingStore?.close();
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
