import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadKnowledge, digest } from "./knowledge.js";
import { snapshot, reviewContext } from "./context.js";
import { fileLimits, attachmentOption, readSelectedFiles, AiError } from "./attachments.js";
import { requestReview } from "./openai.js";

export { AiError };
export function createReviewService({ config, store, reader, fetchImpl = fetch }) {
  mkdirSync(dirname(config.reviewDatabasePath), { recursive:true });
  const db = new DatabaseSync(config.reviewDatabasePath);
  db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS ai_reviews (sheet TEXT NOT NULL,row_id TEXT NOT NULL,cache_key TEXT NOT NULL,body TEXT NOT NULL,last_used INTEGER NOT NULL,PRIMARY KEY(sheet,row_id,cache_key));");
  const latest = db.prepare("SELECT body FROM ai_reviews WHERE sheet=? AND row_id=? ORDER BY last_used DESC, rowid DESC LIMIT 1");
  const cached = db.prepare("SELECT body FROM ai_reviews WHERE sheet=? AND row_id=? AND cache_key=?");
  const save = db.prepare("INSERT INTO ai_reviews(sheet,row_id,cache_key,body,last_used) VALUES (?,?,?,?,(SELECT COALESCE(MAX(last_used),0)+1 FROM ai_reviews WHERE sheet=? AND row_id=?)) ON CONFLICT(sheet,row_id,cache_key) DO UPDATE SET last_used=excluded.last_used");
  const inFlight = new Map();
  const stopping = new AbortController();
  function current(rowId) {
    const row = store.row(rowId);
    if (!row) throw new AiError(404,"Строка отсутствует в последнем снимке ECF.");
    let kb;
    try { kb = loadKnowledge(config.knowledgeDirectory); }
    catch { throw new AiError(503,"Опубликованная база знаний повреждена или недоступна. Проверь data/knowledge и выполни npm run kb:publish."); }
    return { row,kb,snap:snapshot(row,kb,config.openaiModel) };
  }
  function summarize(rowId, ctx, result) {
    return {
      enabled:Boolean(config.openaiKey), model:config.openaiModel, basis:ctx.snap.basis,
      knowledge:{version:ctx.kb.version,documents:ctx.kb.documents.map(({ title,revision }) => ({title,revision}))},
      files:ctx.snap.files.map(attachmentOption), limits:fileLimits, smartsheetConfigured:Boolean(config.token),
      latest:result || null, stale:Boolean(result && result.basis !== ctx.snap.basis), busy:inFlight.has(rowId),
    };
  }
  function status(rowId) {
    const ctx = current(rowId);
    const hit = latest.get(config.sheetId,rowId);
    return summarize(rowId,ctx,hit && JSON.parse(hit.body));
  }
  async function work(rowId, ctx, ids) {
    const { kb,snap,row } = ctx;
    const items = ids.map(id => snap.files.find(f => f.id === id));
    if (items.some(f => !f)) throw new AiError(400,"Одно из вложений отсутствует в этом ECN.");
    for (const item of items) {
      const option = attachmentOption(item);
      if (option.reason) throw new AiError(422,option.name + " · " + option.reason);
    }
    if (items.reduce((sum,f) => sum + (f.sizeInKb || 0)*1024,0) > fileLimits.total) throw new AiError(413,"Суммарный лимит вложений — 20 МиБ.");
    if (items.length && (!config.token || !reader)) throw new AiError(409,"Для доступа к вложениям нужен SMARTSHEET_API_TOKEN.");
    const signal = AbortSignal.any([stopping.signal,AbortSignal.timeout(180_000)]);
    function ensureCurrent() {
      signal.throwIfAborted();
      if (current(rowId).snap.basis !== snap.basis) throw new AiError(409,"Данные ECN или база знаний изменились. Открой актуальную версию и повтори разбор.");
    }
    let stage = "загрузка материалов";
    try {
      const files = await readSelectedFiles(items,{reader,fetchImpl,signal,ensureCurrent});
      ensureCurrent();
      const key = digest([snap.basis,files.map(f => [f.id,f.hash])]);
      stage = "чтение сохранённого разбора";
      const hit = cached.get(config.sheetId,rowId,key);
      let result;
      if (hit) result = JSON.parse(hit.body);
      else {
        stage = "подготовка полей и фрагментов базы знаний";
        const { sources,coverage } = reviewContext(row,snap,kb,items);
        if (!sources.some(s => ["field","comment","file"].includes(s.kind))) throw new AiError(422,"В строке нет материалов для анализа.");
        stage = "обработка ответа OpenAI";
        const analysis = await requestReview({ key:config.openaiKey,model:config.openaiModel,files,sources,coverage,fetchImpl,signal });
        ensureCurrent();
        result = { id:key,basis:snap.basis,model:config.openaiModel,knowledgeVersion:kb.version,attachmentIds:ids,
          createdAt:new Date().toISOString(),sources,coverage,analysis };
      }
      stage = "сохранение результата в SQLite";
      save.run(config.sheetId,rowId,key,JSON.stringify(result),config.sheetId,rowId);
      return { ...summarize(rowId,ctx,result), busy:false, reused:Boolean(hit) };
    } catch (error) {
      if (error instanceof AiError) throw error;
      if (signal.aborted) throw new AiError(504,"Истекло время разбора или агент завершает работу. Автоматического повтора нет.");
      throw new AiError(500,"Внутренняя ошибка агента. Этап — " + stage + ".");
    }
  }
  function analyze(rowId, input) {
    if (!config.openaiKey) throw new AiError(409,"Добавь OPENAI_API_KEY в .env и перезапусти ECN Agent.");
    if (stopping.signal.aborted) throw new AiError(503,"Агент завершает работу.");
    if (!input || !Object.keys(input).every(k => ["basis","attachmentIds"].includes(k)) ||
        typeof input.basis !== "string" || !/^[0-9a-f]{64}$/.test(input.basis) || !Array.isArray(input.attachmentIds) ||
        input.attachmentIds.length > fileLimits.count || input.attachmentIds.some(i => typeof i !== "string" || !/^[1-9]\d{0,18}$/.test(i)) ||
        new Set(input.attachmentIds).size !== input.attachmentIds.length) throw new AiError(400,"Некорректная версия данных или список вложений.");
    const ctx = current(rowId);
    if (input.basis !== ctx.snap.basis) throw new AiError(409,"Снимок ECN или версия справочника изменились. Проверь данные и повтори разбор.");
    const ids = [...input.attachmentIds].sort();
    const job = digest([input.basis,ids]);
    const running = inFlight.get(rowId);
    if (running) {
      if (running.job === job) return running.promise;
      throw new AiError(409,"Для этого ECN уже выполняется разбор с другим набором данных.");
    }
    const promise = work(rowId,ctx,ids).finally(() => inFlight.delete(rowId));
    inFlight.set(rowId,{job,promise});
    return promise;
  }
  return { status,analyze,async close() {
    stopping.abort();
    await Promise.allSettled([...inFlight.values()].map(x => x.promise));
    db.close();
  } };
}
