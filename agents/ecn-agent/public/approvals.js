const queue = document.querySelector("#queue");
const editor = document.querySelector("#editor");
const feedback = document.querySelector("#feedback");
let active = null, busy = false, dirty = false, revision = 0;
function node(tag,text) { const el = document.createElement(tag); el.textContent = text || ""; return el; }
function button(label,fn) {
  const el = node("button",label); el.type = "button"; el.className = "button";
  el.addEventListener("click",fn); return el;
}
async function api(path,body) {
  const res = await fetch("/api/approvals" + path,body === undefined ? {cache:"no-store"} : {
    method:"POST",headers:{"Content-Type":"application/json","X-ECN-UI":"1"},body:JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось прочитать результат.");
  return data;
}
async function list() {
  const rows = await api("");
  queue.replaceChildren(...rows.map(r=>{
    const el = button(r.number + (r.unconfirmed ? " · Сверить отправку" : ""),()=>open(r)); el.title=r.description; return el;
  }));
  if (!rows.length) queue.append(node("p","Заявок для согласования пока нет."));
}
async function action(fn) {
  if (busy) return;
  busy=true; editor.inert=true; queue.inert=true;
  try { await fn(); }
  catch(e) { feedback.textContent=e.message; }
  finally { busy=false; editor.inert=false; queue.inert=false; }
}
async function open(row) {
  if (busy || (dirty && !confirm("Закрыть список без сохранения правок?"))) return;
  const ticket=++revision; active=row.id; dirty=false; feedback.textContent="";
  editor.replaceChildren(node("p","Загрузка…"));
  if (row.unconfirmed) {
    editor.replaceChildren(node("h2",row.number),button("Проверить результат в Smartsheet",()=>action(async()=>{
      await api("/"+row.id+"/verify",{}); await done();
    })),button("Вернуть в подготовку",()=>action(async()=>{
      if (!confirm("Ты проверил в Smartsheet, что согласование не запустилось? Вернуть заявку в подготовку?")) return;
      await api("/"+row.id+"/reopen",{}); await list();
      render(await api("/"+row.id)); feedback.textContent="Проверь список перед новым подтверждением.";
    }))); return;
  }
  try {
    const data=await api("/"+row.id);
    if (ticket === revision) render(data);
  } catch(e) { if (ticket===revision) feedback.textContent=e.message; }
}
async function done() {
  dirty=false; active=null; revision++;
  editor.replaceChildren(node("h2","Отправлено на согласование"));
  feedback.textContent="Контакты и статус Sent for Approvals подтверждены в Smartsheet.";
  await list();
}

function departmentEditor(group, choice, onEdit) {
  const card=node("div"); card.className="approval-department";
  const toggle=node("input"); toggle.type="checkbox";
  toggle.checked=Boolean(choice || group.current);
  const heading=node("label"); heading.className="department-toggle";
  heading.append(toggle,node("strong",group.department));
  card.append(heading);

  const details=node("div"); details.className="recipient-details";
  const field=node(group.restricted ? "select" : "input");
  field.id="recipient-"+group.id;
  const label=node("label","Согласующий · "+group.department);
  label.htmlFor=field.id;
  const options=[...group.options];
  if (group.current && !options.some(p=>p.email===group.current)) options.push({email:group.current});
  const pick=group.restricted ? field : node("datalist");
  if (group.restricted) pick.append(new Option("Выбери сотрудника",""));
  else {
    field.type="email"; field.placeholder="Имя из списка или email";
    pick.id="contacts-"+group.id; field.setAttribute("list",pick.id); details.append(pick);
  }
  for (const p of options) pick.append(new Option(p.name ? p.name+" · "+p.email : p.email,p.email));
  field.value=group.current || choice?.email || "";
  details.append(label,field);
  if (group.current) details.append(node("small","В Smartsheet: "+group.current));
  if (choice) {
    if (choice.email && group.current && group.current!==choice.email) details.append(node("small","Предложенный контакт: "+choice.email));
    const evidence=node("details");
    evidence.append(node("summary","Основание рекомендации"),node("p",choice.reason),node("small",choice.source));
    details.append(evidence);
  }
  card.append(details);
  function update() {
    details.hidden=!toggle.checked;
    field.required=toggle.checked;
    field.disabled=!toggle.checked;
    card.classList.toggle("included",toggle.checked);
  }
  toggle.addEventListener("change",()=>{update();onEdit();});
  field.addEventListener("input",onEdit);
  update();
  return {card,group,field,toggle};
}

function render(data) {
  const id=data.id, ticket=revision;
  editor.replaceChildren(node("h2","ECN "+data.number),node("p",data.description));
  const choices=new Map((data.plan?.choices || []).map(choice=>[choice.department,choice]));
  if (choices.size) {
    const recommendation=node("div"); recommendation.className="approval-recommendation";
    recommendation.append(node("small","Рекомендовано для согласования"),node("strong",[...choices.keys()].join(", ")));
    editor.append(recommendation);
  }
  if (data.notice) editor.append(node("p",data.notice));
  if (data.plan?.note) editor.append(node("p",data.plan.note));
  const analyze=button(data.busy ? "ИИ готовит предложение…" : "Подобрать по базе знаний",()=>action(async()=>{
    if (dirty && !confirm("Заменить правки результатом анализа?")) return;
    const next=await api("/"+id+"/analyze",{}); dirty=false; render(next);
  }));
  analyze.disabled=Boolean(data.busy || data.notice); editor.append(analyze);
  if (data.busy) setTimeout(async()=>{
    if (revision!==ticket || busy || dirty) return;
    try {const next=await api("/"+id); if (revision===ticket && !dirty && !busy) render(next);}
    catch(e){if (revision===ticket) feedback.textContent=e.message;}
  },3000);
  const form=node("form"); form.className="approval-form";
  const entries=[];
  const send=node("button","Подтвердить и отправить"); send.className="button primary";send.type="submit";
  const hint=node("p"); hint.className="selection-hint"; hint.setAttribute("role","status");
  function updateSelection() {
    const included=entries.filter(e=>e.toggle.checked);
    const missing=included.filter(e=>!e.field.value.trim() || !e.field.validity.valid);
    send.disabled=!included.length || Boolean(missing.length);
    hint.textContent=missing.length ? "Выбери согласующего для "+missing.map(e=>e.group.department).join(", ")+"."
      : !included.length ? "Отметь хотя бы одно подразделение." : "";
    hint.hidden=!hint.textContent;
  }
  const initiallyIncluded=group=>Boolean(group.current || choices.has(group.department));
  const showAll=!data.groups.some(initiallyIncluded);
  const extra=node("details"); extra.className="other-departments";
  extra.append(node("summary","Добавить подразделение"));
  for (const group of data.groups) {
    const entry=departmentEditor(group,choices.get(group.department),()=>{dirty=true;updateSelection();});
    entries.push(entry);
    if (showAll || initiallyIncluded(group)) form.append(entry.card);
    else extra.append(entry.card);
  }
  if (extra.children.length>1) form.append(extra);
  form.append(hint,send); updateSelection();
  form.addEventListener("submit",event=>{
    event.preventDefault();
    updateSelection();
    if (send.disabled) return;
    const contacts=entries.map(({group,field,toggle})=>({department:group.department,email:toggle.checked ? field.value.trim() : ""}));
    const chosen=contacts.filter(c=>c.email);
    if (!chosen.length) {feedback.textContent="Выбери хотя бы одного согласующего.";return;}
    if (!confirm(["ECN "+data.number+" → Sent for Approvals",...chosen.map(c=>c.department+" · "+c.email)].join("\n"))) return;
    void action(async()=>{
      try { await api("/"+id+"/confirm",{basis:data.basis,contacts}); await done(); }
      catch(e) { await list(); throw e; }
    });
  });
  editor.append(form);
}
list().catch(e=>{feedback.textContent=e.message;});
setInterval(()=>{if (!document.hidden && !busy) list().catch(e=>{feedback.textContent=e.message;});},15000);
