import { CommentRequestError } from "./comment-service.js";
import { normalizeDiscussions, normalizeSheet } from "./smartsheet.js";
import { AiError } from "./ai/attachments.js";
import { buildHistory, classifyHistory, DAY, hash, verifyTopics } from "./ai/followup-analysis.js";

function operationKey(...parts) {
  // Keep the pre-upgrade operation ID so a previously sent reminder is never replayed.
  const h = hash(parts);
  return [h.slice(0,8), h.slice(8,12), "4"+h.slice(13,16), "8"+h.slice(17,20), h.slice(20,32)].join("-");
}
const changed = () => new CommentRequestError(409,"Переписка или строка изменилась. Обнови данные и сверь очередь перед подтверждением.");

// Format at display/confirmation time so existing, reviewed topics do not need another AI call.
function questionForThread(question, ecnNumber) {
  let text = question.trim().replace(/(?<![\w-])(?:ECN\s*#?\s*)?(\d{8}-\d{2,})(?![\w-])/gi,
    (match, id) => id === ecnNumber ? "this ECN" : match);
  text = text.replace(/^(?:just )?(?:following up|checking in)(?: on my (?:earlier|previous) request)?(?: (?:for|on) this ECN)?\s*[,.:—–-]\s*(?=\S)/i, "");
  text = text.replace(/^(?:can|could|would) you (?:please )?(?:confirm|let me know) (?:whether|if) (the (?:customer )?notifications?) (?:has|have) been sent\?$/i,
    "Did $1 go out?");
  text = text.replace(/^should (the (?:customer )?notifications?) be (?:issued|sent) now\?$/i, "Should $1 go out now?");
  text = text.replace(/^(?:could|would|can) you (?:please|kindly) /i, "Can you ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function draftForThread(topics, ecnNumber) {
  const lines = new Map();
  for (const topic of topics) {
    const audience = topic.recipients.map(email => "@"+email).join(" ");
    if (!lines.has(audience)) lines.set(audience,new Set());
    lines.get(audience).add(questionForThread(topic.question,ecnNumber));
  }
  return [...lines].map(([audience,questions]) => [audience,...questions].filter(Boolean).join(" ")).join("\n");
}

export function createFollowups({store,comments,config,reader,refresh,classify = classifyHistory,now = Date.now}) {
  let running = null, stopped = false, lastError = "", cooldown = 0;
  const failures = new Map();
  const shutdown = new AbortController();
  const history = row => row && buildHistory(row,config,now(),comments.followupIds(row,config.followupEmail));

  function visible(item) {
    if (store.followupHidden(item.sourceId,config.followupEmail)) return null;
    let id = operationKey(config.sheetId,item.rowId,item.discussionId,item.sourceId,config.followupEmail);
    let previousError = "";
    for (;;) {
      const prior = comments.get(item.rowId,id);
      if (!prior) return {...item,operationId:id,previousError};
      if (prior.status === "sent") return null;
      if (prior.status !== "rejected") return {...item,operationId:id,blocked:prior.status};
      previousError = prior.error;
      id = operationKey(id,"retry");
    }
  }

  function openItems(row,basis,topics) {
    const groups = new Map();
    for (const topic of topics) {
      if (topic.status !== "open" || topic.since + config.followupDays * DAY > now()) continue;
      if (!groups.has(topic.sourceId)) groups.set(topic.sourceId,[]);
      groups.get(topic.sourceId).push(topic);
    }
    const items = [];
    for (const group of groups.values()) {
      const [first] = group;
      const draft = draftForThread(group,row.ecnNumber);
      const item = visible({rowId:row.id, ecn:row.ecnNumber, discussionId:first.discussionId, sourceId:first.sourceId,
        original:first.original, due:new Date(first.since+config.followupDays*DAY).toISOString(),
        topics:group, draft, basis:hash([basis,config.followupDays,first.sourceId,draft])});
      if (item) items.push(item);
    }
    return items;
  }

  function overview(rows,includeAudit = true) {
    const items = [], audit = [], waiting = [];
    if (store.getMeta("commentsInitialized")) for (const row of rows) {
      const ctx = history(row);
      if (!ctx) continue;
      const topics = !ctx.problem && store.followupAnalysis(row.id,config.followupEmail,ctx.basis);
      if (!topics) {
        const failure = failures.get(row.id);
        waiting.push({ecn:row.ecnNumber,rowId:row.id,reason:ctx.problem || (failure?.basis===ctx.basis ? failure.message : "")});
        continue;
      }
      items.push(...openItems(row,ctx.basis,topics));
      if (includeAudit) for (const t of topics) {
        if (t.status !== "open") audit.push({rowId:row.id,ecn:row.ecnNumber, ...t});
      }
    }
    return {items:items.sort((a,b)=>a.due.localeCompare(b.due)),audit,waiting,running:Boolean(running),
      email:config.followupEmail,days:config.followupDays,model:config.openaiModel,auto:Boolean(config.followupAiAuto),
      configured:Boolean(config.openaiKey && config.followupEmail),lastSyncAt:store.getMeta("lastSyncAt"),error:lastError};
  }

  async function analyze(manual) {
    lastError = "";
    if (manual && refresh) {
      const result = await refresh();
      if (!result?.summary) throw new CommentRequestError(503,"Не удалось обновить снимок Smartsheet. Повтори сверку после восстановления доступа.");
    }
    if (!store.getMeta("commentsInitialized")) throw new CommentRequestError(409,"Сначала дождись полной загрузки обсуждений ECF.");
    for (const row of store.readRows()) {
      if (stopped || (!manual && store.getMeta("paused"))) break;
      const ctx = history(store.row(row.id));
      if (!ctx || ctx.problem || store.followupAnalysis(row.id,config.followupEmail,ctx.basis)) continue;
      const prev = failures.get(row.id);
      if (!manual && prev?.basis===ctx.basis && now()<prev.retryAt) continue;
      try {
        const signal = AbortSignal.any([shutdown.signal,AbortSignal.timeout(120_000)]);
        const raw = await classify({data:ctx.data,config,signal});
        const topics = verifyTopics(raw,ctx.data);
        if (!stopped && history(store.row(row.id))?.basis === ctx.basis) {
          store.saveFollowupAnalysis(row.id,config.followupEmail,ctx.basis,topics);
          failures.delete(row.id);
        }
      } catch (error) {
        if (stopped) break;
        const message = error instanceof AiError ? error.message : "ИИ-сверка не завершилась. Проверь подключение и повтори попытку.";
        failures.set(row.id,{basis:ctx.basis,message,retryAt:now()+30*60_000});
        if (!(error instanceof AiError) || error.status !== 422) {
          lastError = message;
          cooldown = now()+30*60_000;
          break;
        }
      }
    }
  }
  function start(manual = true) {
    if (running) return {status:"running"};
    if (stopped || !config.openaiKey || !config.followupEmail) {
      if (manual) throw new CommentRequestError(409,"Для сверки укажи ECN_FOLLOWUP_EMAIL и OPENAI_API_KEY в .env.");
      return;
    }
    if (!manual && (!config.followupAiAuto || now() < cooldown || store.getMeta("paused"))) return;
    if (manual) cooldown = 0;
    running = Promise.resolve().then(()=>analyze(manual)).catch(error=>{
      lastError = error instanceof CommentRequestError ? error.message : "Сверка прервана. Проверь доступ к сервисам и локальной базе.";
    }).finally(()=>{running=null;});
    return {status:"running"};
  }
  function act(action,input) {
    const row = store.row(input?.rowId);
    const item = row && overview([row],false).items.find(i=>i.discussionId===input.discussionId && i.basis===input.basis && i.operationId===input.operationId);
    if (!item) throw changed();
    if (action === "dismiss") {
      store.hideFollowup(item.sourceId,config.followupEmail);
      return {status:"dismissed"};
    }
    if (action !== "confirm") throw changed();
    if (item.blocked) return comments.verify(row.id,item.operationId);
    if (!config.token || !reader) throw new CommentRequestError(409,"Для отправки нужен доступ к обсуждениям Smartsheet.");
    if (input.text !== item.draft) throw changed();
    const expected = history(row).basis;
    function invalidate() {
      store.forgetFollowupAnalysis(row.id,config.followupEmail,expected);
      // A proven change should remove the old card immediately, including on a paused panel.
      if (refresh) Promise.resolve().then(refresh).catch(()=>{});
      throw changed();
    }
    return comments.submit({operationId:item.operationId,rowId:row.id,discussionId:item.discussionId,text:item.draft},
      async (liveRow,liveThread) => {
        if (String(liveRow.id)!==row.id || !row.modifiedAt || liveRow.modifiedAt!==row.modifiedAt) invalidate();
        const threads = await reader.readRowDiscussions(row.id);
        const target = threads.find(t=>t.id===item.discussionId);
        // The per-discussion and row-wide reads must agree even if clocks or row timestamps did not advance.
        if (!target || hash(target.comments)!==hash(normalizeDiscussions([liveThread])[0].comments)) invalidate();
        const columns = row.fields.map(f=>({id:f.columnId,title:f.title,type:f.type}));
        const live = normalizeSheet({id:config.sheetId,columns,rows:[liveRow]}).rows[0];
        live.discussions = threads;
        if (history(live)?.basis!==expected || history(store.row(row.id))?.basis!==expected) invalidate();
        if (store.followupHidden(item.sourceId,config.followupEmail)) throw changed();
      },{followup:true});
  }
  return {overview,list:rows=>overview(rows,false).items,act,start, idle:()=>running || Promise.resolve(),
    async close() { stopped=true;shutdown.abort();await running; }};
}
