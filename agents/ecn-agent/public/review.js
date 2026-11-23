export function createReviewPanel({ root, element, date, activeId, addDraft }) {
  const choices = new Map(), running = new Set(), messages = new Map();
  let reading = null, generation = 0, displayed = null, signature = "";
  async function api(id, input) {
    const response = await fetch("/api/rows/" + encodeURIComponent(id) + "/ai-review", {
      method:input ? "POST" : "GET", cache:"no-store", headers:input ? { "X-ECN-UI":"1","Content-Type":"application/json" } : {},
      body:input ? JSON.stringify(input) : undefined, signal:AbortSignal.timeout(input ? 195000 : 15000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Ошибка локальной панели.");
    return data;
  }
  function render(id, state) {
    if (activeId() !== id) return;
    if (!choices.has(id)) choices.set(id,new Set(state.latest?.attachmentIds || []));
    const selected = choices.get(id);
    const allowed = new Set(state.files.filter(f => !f.reason).map(f => f.id));
    for (const fileId of selected) if (!allowed.has(fileId)) selected.delete(fileId);
    const busy = running.has(id) || state.busy, result = state.latest;
    const currentSignature = JSON.stringify([id,state,[...selected],busy,messages.get(id)]);
    if (signature === currentSignature && root.contains(displayed)) return;
    const scroll = root.scrollTop;
    const wrap = element("div",undefined,"ai-review");
    wrap.append(element("p","В OpenAI уйдут поля и комментарии этой заявки, подходящие выдержки из справочника и отмеченные файлы.","ai-note"));
    if (!state.enabled) wrap.append(element("p","Для разбора добавь OPENAI_API_KEY в .env и перезапусти агент.","ai-warning"));
    const knowledge = element("details"), version = state.knowledge.version;
    knowledge.append(element("summary",version ? "База знаний · " + version.slice(0,10) : "База знаний не опубликована"));
    for (const doc of state.knowledge.documents) knowledge.append(element("p",doc.title + " · " + doc.revision));
    if (!version) knowledge.append(element("p","Процедуры можно подключить командой npm run kb:publish."));
    wrap.append(element("p","Модель · " + state.model, "ai-meta"),knowledge);
    const files = element("fieldset");
    files.append(element("legend","Вложения для разбора"));
    if (!state.files.length) files.append(element("p","В снимке этой заявки вложений нет.","ai-note"));
    for (const f of state.files) {
      const label = element("label",undefined,"ai-file"), check = element("input");
      check.type = "checkbox"; check.checked = selected.has(f.id);
      check.disabled = busy || Boolean(f.reason) || !state.smartsheetConfigured || (!check.checked && selected.size >= state.limits.count);
      check.addEventListener("change",() => {
        if (check.checked) selected.add(f.id); else selected.delete(f.id);
        messages.delete(id); render(id,state);
      });
      label.append(check,element("span", f.name + (f.reason ? " · " + f.reason : f.sizeInKb != null ? " · " + f.sizeInKb + " КБ" : "")));
      files.append(label);
    }
    if (state.files.length) files.append(element("p","До 5 файлов. До 12 МиБ каждый и до 20 МиБ суммарно.","ai-note"));
    wrap.append(files);
    const run = element("button",busy ? "Выполняется разбор…" : "Разобрать ECN","button primary");
    run.type = "button"; run.disabled = busy || !state.enabled;
    run.addEventListener("click",async () => {
      if (activeId() !== id || running.has(id)) return;
      running.add(id); messages.delete(id); generation++; render(id,state);
      try {
        const next = await api(id,{basis:state.basis,attachmentIds:[...selected]});
        messages.set(id,next.reused ? "Открыт сохранённый разбор этих данных." : "Разбор сохранён.");
        state = next;
      } catch (e) { messages.set(id,e.message); }
      finally { running.delete(id); if (activeId() === id) { render(id,state); void refresh(); } }
    });
    wrap.append(run);
    if (messages.has(id)) {
      const feedback = element("p",messages.get(id),"ai-feedback");
      feedback.setAttribute("role","status"); wrap.append(feedback);
    }
    if (result) {
      wrap.append(element("h3","Последний разбор"),element("p",date(result.createdAt) + " · " + result.model + " · база " + (result.knowledgeVersion.slice(0,10) || "не подключена"),"ai-meta"));
      if (state.stale) wrap.append(element("p","Разбор устарел. Изменились данные, модель или версия базы знаний.","ai-warning"));
      const sameFiles = JSON.stringify([...selected].sort()) === JSON.stringify([...result.attachmentIds].sort());
      if (!sameFiles) wrap.append(element("p","Выбран другой набор вложений. Нажми «Разобрать ECN» для этого набора.","ai-warning"));
      const citedFiles = result.sources.filter(s => s.kind === "file");
      wrap.append(element("p","Файлы в этом разборе: " + (citedFiles.map(s => s.label).join(", ") || "без файлов"),"ai-meta"));
      for (const note of result.coverage) wrap.append(element("p",note,"ai-note"));
      const refs = new Map(result.sources.map(s => [s.id,s]));
      function addFinding(group, finding) {
        const block = element("div",undefined,"ai-finding");
        block.append(element("p",finding.text));
        for (const key of finding.sources) {
          const source = refs.get(key);
          if (!source) continue;
          const node = element("details");
          node.append(element("summary",source.label || source.id),element("p",source.text,"ai-quote"));
          if (source.kind === "file" && !state.stale) {
            const link = element("a","Открыть исходное вложение");
            link.href = "/api/rows/" + encodeURIComponent(id) + "/attachments/" + encodeURIComponent(source.id.slice(5)) + "/open";
            link.target = "_blank"; link.rel = "noopener noreferrer"; node.append(link);
          }
          block.append(node);
        }
        group.append(block);
      }
      addFinding(wrap,result.analysis.summary);
      for (const [key,title] of Object.entries({ changes:"Что меняется",approvers:"Предлагаемые согласующие",questions:"Что уточнить",nextSteps:"Следующие действия" })) {
        if (!result.analysis[key].length) continue;
        wrap.append(element("h4",title));
        for (const finding of result.analysis[key]) addFinding(wrap,finding);
      }
      if (result.analysis.draftComment) {
        wrap.append(element("h4","Черновик комментария"),element("p",result.analysis.draftComment,"ai-quote"));
        const insert = element("button","Добавить в черновик","button");
        insert.type = "button"; insert.disabled = busy || state.stale || !sameFiles;
        insert.addEventListener("click",async () => {
          insert.disabled = true;
          try {
            const now = await api(id);
            if (activeId() !== id) return;
            if (now.stale || now.busy || !now.latest || now.latest.id !== result.id || now.latest.createdAt !== result.createdAt ||
                JSON.stringify([...choices.get(id)].sort()) !== JSON.stringify([...result.attachmentIds].sort()))
              throw new Error("Данные или выбор вложений изменились. Проверь актуальный разбор.");
            addDraft(id,result.analysis.draftComment);
          } catch (e) { messages.set(id,e.message); if (activeId() === id) void refresh(); }
          finally { insert.disabled = false; }
        });
        wrap.append(insert);
      }
    }
    root.replaceChildren(wrap); root.scrollTop = scroll; displayed = wrap; signature = currentSignature;
  }
  async function refresh() {
    const id = activeId();
    if (!id || running.has(id) || reading === id) return;
    const ticket = ++generation; reading = id;
    try { const state = await api(id); if (generation === ticket && activeId() === id) render(id,state); }
    catch (e) { if (generation === ticket && activeId() === id) root.replaceChildren(element("p",e.message,"ai-warning")); }
    finally { if (reading === id) reading = null; }
  }
  return { refresh };
}
