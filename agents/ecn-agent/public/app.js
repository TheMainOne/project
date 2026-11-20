const $ = id => document.getElementById(id);
let current = null;
let page = 0;
let loading = false;
let controlBusy = false;
let selectedId = null;
let selectedRow = null;
let selectedTab = "details";
let detailTicket = 0;
let lastRowsKey = "";
let lastEventsKey = "";
let activeView = "sheet";
let seenPending = new Set();
const perPage = 100;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}
function report(message) {
  $("alert").textContent = message || "";
  $("alert").hidden = !message;
}
async function request(path, method = "GET", body) {
  const headers = { "X-ECN-UI": "1" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || "Ошибка запроса."); error.status = response.status; throw error; }
  return data;
}
function visibleRows() {
  const search = $("search").value.toLocaleLowerCase().trim();
  const filter = $("filter").value;
  const rows = (current?.rows || []).filter(row => {
    if (filter === "active" && !row.active) return false;
    if (filter === "without-number" && (row.ecnNumber || !row.active)) return false;
    if (filter === "with-comments" && !row.commentCount) return false;
    if (filter === "unread" && !row.unreadCommentCount) return false;
    if (!["active", "without-number", "all", "with-comments", "unread"].includes(filter) && row.status !== filter) return false;
    return !search || [row.ecnNumber, row.site, row.itemNumber, row.itemDescription, row.status, row.requestedBy]
      .some(value => String(value || "").toLocaleLowerCase().includes(search));
  });
  const order = $("sort").value;
  return rows.sort((a, b) => {
    if (order === "modified") return String(b.modifiedAt || "").localeCompare(String(a.modifiedAt || "")) || a.rowNumber - b.rowNumber;
    if (order === "comments") return String(b.lastCommentAt || "").localeCompare(String(a.lastCommentAt || "")) || a.rowNumber - b.rowNumber;
    return a.rowNumber - b.rowNumber;
  });
}
function renderRows() {
  const rows = visibleRows();
  page = Math.min(page, Math.max(0, Math.ceil(rows.length / perPage) - 1));
  const displayed = rows.slice(page * perPage, (page + 1) * perPage);
  const key = JSON.stringify([displayed, selectedId, page]);
  if (key !== lastRowsKey) {
    lastRowsKey = key;
    const focus = document.activeElement?.dataset;
    const focused = focus?.rowId ? { id: focus.rowId, target: focus.target } : null;
    const fragment = document.createDocumentFragment();
    for (const row of displayed) {
      const tr = element("tr", undefined, row.id === selectedId ? "selected" : "");
      tr.append(element("td", String(row.rowNumber), "sticky-number"));
      const chatCell = element("td", undefined, "sticky-chat");
      const chat = element("button", undefined, "comment-button" + (row.commentCount ? " has-comments" : "") + (row.unreadCommentCount ? " unread" : ""));
      chat.dataset.rowId = row.id; chat.dataset.target = "comments";
      chat.setAttribute("aria-label", "Комментарии ECN " + (row.ecnNumber || "без номера") + ": " + row.commentCount + ", новых или изменённых: " + row.unreadCommentCount);
      chat.title = "Комментариев: " + row.commentCount + (row.unreadCommentCount ? " · Новых/изменённых: " + row.unreadCommentCount : "");
      chat.append($("message-icon").content.cloneNode(true));
      if (row.commentCount) chat.append(element("span", String(row.commentCount)));
      chat.addEventListener("click", () => openRow(row.id, "comments"));
      chatCell.append(chat); tr.append(chatCell);
      const first = element("td", undefined, "sticky-ecn");
      const link = element("button", row.ecnNumber || "Без номера", "row-link");
      link.dataset.rowId = row.id; link.dataset.target = "details";
      link.addEventListener("click", () => openRow(row.id, "details"));
      first.append(link); tr.append(first);
      const status = element("td"); status.title = row.status;
      const statusClass = row.status === "Sent for Approvals" ? "waiting" : row.status === "Initial Review" ? "review" : row.status === "Complete and Closed" ? "closed" : "";
      status.append(element("span", row.status || "Статус пуст", "status " + statusClass)); tr.append(status);
      for (const text of [row.site, row.itemNumber, row.itemDescription, date(row.modifiedAt)]) {
        const td = element("td", text || "—"); td.title = text || ""; tr.append(td);
      }
      fragment.append(tr);
    }
    $("rows").replaceChildren(fragment);
    if (focused) Array.from($("rows").querySelectorAll("button")).find(button => button.dataset.rowId === focused.id && button.dataset.target === focused.target)?.focus({ preventScroll: true });
  }
  $("empty").hidden = rows.length > 0;
  $("empty").replaceChildren(element("strong", current?.lastSyncAt ? "Строк не найдено" : "Ожидание ECF"), element("span", current?.lastSyncAt ? "Попробуй другой фильтр или поисковый запрос." : "После подключения здесь появятся строки таблицы."));
  $("result-count").textContent = "Строк: " + rows.length;
  $("page-info").textContent = rows.length ? (page * perPage + 1) + "–" + Math.min((page + 1) * perPage, rows.length) + " из " + rows.length : "";
  $("previous").disabled = page === 0;
  $("next").disabled = (page + 1) * perPage >= rows.length;
  document.querySelectorAll("[data-filter]").forEach(button => button.classList.toggle("active", button.dataset.filter === $("filter").value));
}
function renderEvents() {
  const key = JSON.stringify(current.events);
  if (key === lastEventsKey) return;
  lastEventsKey = key;
  const fragment = document.createDocumentFragment();
  for (const event of current.events) {
    const isComment = event.kind.startsWith("comment_");
    const item = element("li", undefined, "event" + (event.kind === "error" ? " error" : isComment ? " comment-event" : ""));
    item.append(element("time", date(event.at)));
    if (event.rowId && current.rows.some(row => row.id === event.rowId)) {
      const button = element("button", event.message);
      button.addEventListener("click", () => { showView("sheet"); void openRow(event.rowId, isComment ? "comments" : "details"); });
      item.append(button);
    } else item.append(element("span", event.message));
    fragment.append(item);
  }
  $("events").replaceChildren(fragment);
  $("journal-empty").hidden = current.events.length > 0;
}
function render() {
  const labels = { needs_token: "Нужен токен", error: "Ошибка проверки", syncing: "Загрузка ECF", paused: "На паузе", watching: "Наблюдение активно" };
  $("connection").lastElementChild.textContent = labels[current.monitor.state] || "Подключение";
  $("connection").dataset.state = current.monitor.state;
  $("last-sync").textContent = current.lastSyncAt ? "Проверено " + date(current.lastSyncAt) + " · " + current.counts.all + " строк" : "Первый снимок ещё не получен";
  $("pause").textContent = current.paused ? "Продолжить" : "Пауза";
  $("pause").disabled = !current.tokenConfigured || controlBusy;
  $("sync").disabled = !current.tokenConfigured || current.monitor.running || controlBusy;
  $("sync").textContent = current.monitor.running ? "Загрузка…" : "Проверить сейчас";
  report(current.monitor.error);
  const notices = [];
  if (!current.tokenConfigured) notices.push("Добавь SMARTSHEET_API_TOKEN в agents/ecn-agent/.env и перезапусти npm start.");
  if (current.paused) notices.push("Автопроверка на паузе. Кнопка «Проверить сейчас» загрузит строки и комментарии один раз.");
  if (current.sheet?.unavailableApprovals?.length) notices.push("Поля согласования требуют сверки: " + current.sheet.unavailableApprovals.join(", ") + ".");
  if (current.monitor.error && current.lastSyncAt) notices.push("Показан сохранённый снимок от " + date(current.lastSyncAt) + ".");
  if (current.lastSyncAt && !current.commentsLoaded) notices.push("Комментарии ещё не загружены. Дождись успешной проверки или нажми «Проверить сейчас».");
  $("notice").textContent = notices.join(" "); $("notice").hidden = !notices.length;
  for (const key of ["active", "withoutNumber", "initialReview", "awaitingApprovals", "unreadComments"]) $("count-" + key).textContent = current.lastSyncAt ? String(current.counts[key] || 0) : "—";
  $("rail-unread").textContent = current.counts.unreadComments > 99 ? "99+" : String(current.counts.unreadComments || 0);
  $("rail-unread").hidden = !current.counts.unreadComments;
  $("comment-total").textContent = current.commentsLoaded ? "Комментариев: " + current.counts.comments + " · Проверены " + date(current.commentsSyncAt) : "Комментарии ещё не загружены";
  $("poll-interval").textContent = "Интервал · " + current.pollSeconds + " с";
  renderRows(); renderEvents();
}
function rowFact(label, value) {
  const part = element("div", undefined, "fact");
  part.append(element("dt", label), element("dd", value || "—"));
  return part;
}
function renderDetails(row) {
  const facts = element("dl", undefined, "facts");
  facts.append(rowFact("ECN Status", row.status), rowFact("Site", row.site), rowFact("Item Number", row.itemNumber), rowFact("Item Description", row.itemDescription), rowFact("Requested By", row.requestedBy), rowFact("Создана строка", date(row.createdAt)), rowFact("Изменена строка", date(row.modifiedAt)));
  const approvals = element("div", undefined, "approvals");
  for (const approval of row.approvals) {
    const block = element("div", undefined, "approval");
    const contacts = approval.contacts.map(contact => [contact.name, contact.email].filter(Boolean).join(" · ")).join("\n");
    block.append(element("strong", approval.department), element("span", contacts || "Контакт не указан", "approval-person"), element("span", approval.available ? approval.status || "Поле ответа пусто" : "Колонка недоступна", "approval-status"));
    approvals.append(block);
  }
  $("detail-content").replaceChildren(facts, element("h3", "Описание изменения"), element("p", row.description || "Описание отсутствует.", "change-description"), element("h3", "Текущие согласующие"), approvals);
}
function renderComments(row) {
  const fragment = document.createDocumentFragment();
  fragment.append(element("p", "Обсуждения строки из Smartsheet. Новые сообщения и правки появятся после следующей проверки.", "conversation-note"));
  if (!row.commentsLoaded) {
    fragment.append(element("p", "Комментарии ещё не загружены. Нажми «Проверить сейчас».", "empty"));
  } else if (!row.commentCount) {
    fragment.append(element("p", "В этой строке пока нет комментариев.", "empty"));
  } else {
    const threads = [...row.discussions].sort((a, b) => String(b.comments.at(-1)?.createdAt || "").localeCompare(String(a.comments.at(-1)?.createdAt || "")) || a.id.localeCompare(b.id));
    const unread = new Set(row.unreadCommentIds);
    for (const thread of threads) {
      const section = element("section", undefined, "thread"); section.setAttribute("aria-label", "Обсуждение");
      thread.comments.forEach((comment, index) => {
        const item = element("article", undefined, "comment" + (index ? " reply" : "") + (unread.has(comment.id) ? " new" : ""));
        const head = element("div", undefined, "comment-head");
        const name = comment.author.name || comment.author.email || "Автор не указан";
        const initials = name.split(/\s+/).map(word => word[0]).slice(0, 2).join("").toUpperCase();
        const author = element("div");
        const label = element("span", name, "comment-author"); label.title = comment.author.email || name;
        author.append(label, element("span", date(comment.createdAt) + (comment.modifiedAt && comment.modifiedAt !== comment.createdAt ? " · изменён " + date(comment.modifiedAt) : ""), "comment-date"));
        head.append(element("span", initials, "avatar"), author);
        if (unread.has(comment.id)) head.append(element("span", "Новое / изменено", "new-label"));
        item.append(head, element("p", comment.text || "Комментарий без текста.", "comment-text"));
        section.append(item);
      });
      fragment.append(section);
    }
  }
  $("comments-content").replaceChildren(fragment);
}
function setTab(tab, focus = false) {
  selectedTab = tab;
  $("detail-content").hidden = tab !== "details";
  $("comments-content").hidden = tab !== "comments";
  for (const name of ["details", "comments"]) {
    $("tab-" + name).setAttribute("aria-selected", String(name === tab));
    $("tab-" + name).tabIndex = name === tab ? 0 : -1;
  }
  if (focus) $("tab-" + tab).focus();
  if (tab === "comments") void markVisibleComments();
}
async function markVisibleComments() {
  const row = selectedRow;
  if (!row?.unreadCommentCount || selectedTab !== "comments" || $("drawer").hidden || document.hidden) return;
  const key = row.id + ":" + row.commentsRevision;
  if (seenPending.has(key)) return;
  seenPending.add(key);
  try {
    await request("/api/rows/" + row.id + "/comments/seen", "POST", { revision: row.commentsRevision });
    if (current) {
      const summary = current.rows.find(item => item.id === row.id);
      // Only clear the displayed revision. A later snapshot must keep its unread badge.
      if (summary?.commentsRevision === row.commentsRevision) {
        current.counts.unreadComments = Math.max(0, current.counts.unreadComments - summary.unreadCommentCount);
        summary.unreadCommentCount = 0;
        row.unreadCommentCount = 0;
        render();
      }
    }
  } catch (error) {
    if (error.status === 409 && selectedId === row.id) void refreshDetail();
    else if (selectedId === row.id) $("detail-source").textContent = "Не удалось отметить комментарии прочитанными. " + error.message;
  } finally { seenPending.delete(key); }
}
async function refreshDetail() {
  if (!selectedId) return;
  const id = selectedId;
  const ticket = ++detailTicket;
  try {
    const row = await request("/api/rows/" + encodeURIComponent(id));
    if (ticket !== detailTicket || selectedId !== id) return;
    const changed = !selectedRow || JSON.stringify(row) !== JSON.stringify(selectedRow);
    selectedRow = row;
    $("detail-title").textContent = row.ecnNumber || "ECN без номера";
    $("detail-row-number").textContent = row.rowNumber;
    $("detail-comment-count").textContent = row.commentCount;
    $("detail-source").textContent = "Последний снимок · " + date(current?.lastSyncAt);
    if (changed) {
      const detailScroll = $("detail-content").scrollTop;
      const commentScroll = $("comments-content").scrollTop;
      renderDetails(row); renderComments(row);
      $("detail-content").scrollTop = detailScroll; $("comments-content").scrollTop = commentScroll;
    }
    await markVisibleComments();
  } catch (error) {
    if (ticket !== detailTicket) return;
    selectedRow = null;
    const text = error.status === 404 ? "Строка больше не присутствует в ECF. Последние события доступны в журнале." : error.message;
    for (const target of ["detail-content", "comments-content"]) $(target).replaceChildren(element("p", text, "empty"));
    $("detail-source").textContent = "Карточка недоступна";
  }
}
async function openRow(id, tab) {
  const isNew = selectedId !== id;
  selectedId = id;
  if (isNew) {
    selectedRow = null;
    $("detail-title").textContent = "Загрузка…";
    $("detail-row-number").textContent = "—";
    $("detail-comment-count").textContent = "—";
    for (const target of ["detail-content", "comments-content"]) { $(target).replaceChildren(); $(target).scrollTop = 0; }
  }
  $("drawer").hidden = false;
  setTab(tab);
  renderRows();
  await refreshDetail();
}
function closeDetail() {
  const previousId = selectedId;
  $("drawer").hidden = true;
  selectedId = null; selectedRow = null; detailTicket += 1;
  renderRows();
  Array.from($("rows").querySelectorAll("button")).find(button => button.dataset.rowId === previousId && button.dataset.target === "details")?.focus({ preventScroll: true });
}
function showView(view) {
  activeView = view;
  $("sheet-view").hidden = view !== "sheet";
  $("activity-view").hidden = view !== "activity";
  $("view-name").textContent = view === "sheet" ? "Таблица" : "Журнал";
  for (const name of ["sheet", "activity"]) {
    $("nav-" + name).classList.toggle("selected", name === view);
    $("nav-" + name).setAttribute("aria-pressed", String(name === view));
  }
  if (view === "activity") closeDetail();
}
function changeFilter(value) { showView("sheet"); $("filter").value = value; page = 0; renderRows(); }
async function update() {
  if (loading) return;
  loading = true;
  try {
    const previousSync = current?.lastSyncAt;
    current = await request("/api/state"); render();
    if (selectedId && (previousSync !== current.lastSyncAt || !selectedRow)) await refreshDetail();
  } catch {
    report("Нет связи с локальным агентом. Проверь окно терминала и запусти npm start.");
    $("connection").dataset.state = "error";
    $("connection").lastElementChild.textContent = "Агент недоступен";
    $("sync").disabled = true; $("pause").disabled = true;
  } finally { loading = false; }
}
async function control(path) {
  if (controlBusy) return;
  controlBusy = true;
  $("sync").disabled = true; $("pause").disabled = true;
  try { await request(path, "POST"); await update(); }
  catch (error) { report(error.message); }
  finally { controlBusy = false; if (current) { $("pause").disabled = !current.tokenConfigured; $("sync").disabled = !current.tokenConfigured || current.monitor.running; } }
}
$("sync").addEventListener("click", () => control("/api/sync"));
$("pause").addEventListener("click", () => control(current?.paused ? "/api/resume" : "/api/pause"));
for (const id of ["search", "filter", "sort"]) $(id).addEventListener("input", () => { page = 0; if (activeView !== "sheet") showView("sheet"); renderRows(); });
$("previous").addEventListener("click", () => { page -= 1; renderRows(); });
$("next").addEventListener("click", () => { page += 1; renderRows(); });
$("nav-sheet").addEventListener("click", () => showView("sheet"));
$("nav-activity").addEventListener("click", () => showView("activity"));
$("nav-unread").addEventListener("click", () => changeFilter("unread"));
document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => changeFilter(button.dataset.filter)));
for (const name of ["details", "comments"]) {
  $("tab-" + name).addEventListener("click", () => setTab(name));
  $("tab-" + name).addEventListener("keydown", event => {
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); setTab(name === "details" ? "comments" : "details", true); }
  });
}
$("close-detail").addEventListener("click", closeDetail);
document.addEventListener("keydown", event => { if (event.key === "Escape" && selectedId) closeDetail(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) { void update(); void markVisibleComments(); } });
setInterval(() => { if (!document.hidden) void update(); }, 4000);
void update();
