const el = id => document.getElementById(id);
const node = (tag,text) => Object.assign(document.createElement(tag),{textContent:text});
const date = value => new Date(value).toLocaleString("ru-RU");
let state, busy = false, loading = false, revision = 0;
function rowLink(item) {
  const link = node("a","ECN "+item.ecn);
  link.href = "/?row="+encodeURIComponent(item.rowId);
  return link;
}
async function post(action,body) {
  const response = await fetch("/api/followups/"+action,{method:"POST",headers:{"Content-Type":"application/json","X-ECN-UI":"1"},body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Не удалось выполнить действие.");
  return data;
}
function showEvidence(parent,topics) {
  const detail = document.createElement("details");
  detail.append(node("summary","Посмотреть основания"));
  const shown = new Set();
  for (const topic of topics) for (const ref of topic.evidence) {
    const key = JSON.stringify([ref.id,ref.quote]);
    if (shown.has(key)) continue;
    shown.add(key);
    detail.append(node("small",ref.label+(ref.at ? " · "+date(ref.at) : ref.day ? " · "+ref.day : "")),node("blockquote",ref.quote || "Комментарий без текста"));
  }
  parent.append(detail);
}
async function act(item,action) {
  if (busy) return;
  if (action==="confirm" && !item.blocked && !window.confirm("Отправить в обсуждение ECN "+item.ecn+"?\n\n"+item.draft)) return;
  busy=true;revision++;render();
  try {
    const result=await post(action,{rowId:item.rowId,discussionId:item.discussionId,basis:item.basis,operationId:item.operationId,text:item.draft});
    el("message").textContent = result.status==="sent" ? "Напоминание отправлено в ECN "+item.ecn+"." :
      result.status==="dismissed" ? "Напоминание снято." : result.error || "Ожидается сверка отправки.";
  } catch(e) {el("message").textContent=e.message;}
  finally {busy=false;render();await refresh();}
}
function render() {
  const mode = state.auto ? "Сверка после обновления данных" : "Сверка по кнопке";
  el("settings").textContent = state.email ? [state.email,"Интервал "+state.days+" дн.",mode,state.model].join(" · ") :
    "Для подбора укажи ECN_FOLLOWUP_EMAIL в .env и перезапусти агент.";
  el("analyze").disabled = busy || state.running || !state.configured;
  el("sync").textContent = [state.running ? "ИИ проверяет переписку…" : "",state.error,
    !state.configured && state.email ? "Для сверки укажи OPENAI_API_KEY в .env." : "",
    state.lastSyncAt ? "Снимок Smartsheet от "+date(state.lastSyncAt)+"." : "Ожидается первый полный снимок."].filter(Boolean).join(" ");
  const queue = el("queue"); queue.replaceChildren();
  if (!state.items.length) {
    queue.append(node("p",state.waiting.length ? "В проверенных ECN пока нет напоминаний к подтверждению." : "Напоминаний к подтверждению пока нет."));
  }
  for (const item of state.items) {
    const card = document.createElement("article"), title = document.createElement("h2");
    title.append(rowLink(item));card.append(title,node("small","Срок · "+date(item.due)));
    for (const t of item.topics) card.append(node("h3",t.subject),node("p",t.reason+(t.requestCount>1 ? " Просьб по теме: "+t.requestCount+"." : "")));
    showEvidence(card,item.topics);
    card.append(node("h3","Последняя просьба"),node("blockquote",item.original),node("h3","Текст для отправки"),node("p",item.draft));
    if (item.previousError || item.blocked) card.append(node("p",item.previousError || "Ожидается проверка предыдущей отправки."));
    for (const [action,label] of [["confirm",item.blocked?"Проверить отправку":"Подтвердить и отправить"],["dismiss","Снять напоминание"]]) {
      const button=node("button",label);button.className=action==="confirm"?"button primary":"button";button.disabled=busy;
      button.addEventListener("click",()=>act(item,action));card.append(button);
    }
    queue.append(card);
  }
  const results=el("results");results.replaceChildren();
  el("audit-title").textContent="Закрытые и неоднозначные вопросы ("+state.audit.length+")";
  for (const item of state.audit) {
    const card=document.createElement("article"), title=node("h3",item.subject);
    card.append(rowLink(item),title,node("small",item.status==="resolved"?"Закрыт":"Неоднозначно"),node("p",item.reason));
    showEvidence(card,[item]);results.append(card);
  }
  const waiting=el("waiting");waiting.replaceChildren();
  el("pending-title").textContent="ECN в ожидании сверки ("+state.waiting.length+")";
  for (const item of state.waiting) {
    const p=document.createElement("p");p.append(rowLink(item)," · "+(item.reason || "Текущая переписка ещё не проверена."));waiting.append(p);
  }
}
async function refresh() {
  if (loading || busy) return;
  loading=true;
  const atStart=revision;
  try {
    const response=await fetch("/api/followups",{cache:"no-store"});
    if (!response.ok) throw Error("Очередь недоступна.");
    const next=await response.json();
    if (!busy && revision===atStart && JSON.stringify(next)!==JSON.stringify(state)) {state=next;render();}
  } catch(e) {el("message").textContent=e.message;}
  finally {loading=false;}
}
el("analyze").onclick=async()=>{
  if (busy || !state?.configured || state.running) return;
  busy=true;revision++;render();
  try { await post("analyze",{}); state.running=true; el("message").textContent=""; }
  catch(e) {el("message").textContent=e.message;}
  finally {busy=false;render();await refresh();}
};
setInterval(()=>{if (!document.hidden) void refresh();},3000);
void refresh();
