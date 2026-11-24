import { createReviewPanel } from "./review.js";
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
let sheetView = "table";
try { if (localStorage.getItem("ecn-sheet-view") === "cards") sheetView = "cards"; } catch {}
let lastBoardKey = "";
let returnFocus = null;
const drafts = new Map();
let seenPending = new Set();
const perPage = 100;
const detailTabs = ["comments", "attachments", "ai"];
const detailPanels = ["detail-content", "comments-content", "attachments-content", "ai-content"];
try {
  const saved = JSON.parse(sessionStorage.getItem("ecn-comment-drafts") || "[]");
  if (Array.isArray(saved)) for (const [id, draft] of saved) {
    if (/^[1-9]\d*$/.test(id) && draft && typeof draft.text === "string") drafts.set(id, { ...draft, busy: false, file: null });
  }
} catch {}

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
    if (filter === "with-attachments" && !row.attachmentCount) return false;
    if (filter === "unread" && !row.unreadCommentCount) return false;
    if (!["active", "without-number", "all", "with-comments", "with-attachments", "unread"].includes(filter) && row.status !== filter) return false;
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
  $("grid-scroll").hidden = sheetView === "cards";
  $("card-board").hidden = sheetView !== "cards";
  $("previous").hidden = sheetView === "cards";
  $("next").hidden = sheetView === "cards";
  $("page-info").hidden = sheetView === "cards";
  if (sheetView === "cards") renderBoard(rows);
  page = Math.min(page, Math.max(0, Math.ceil(rows.length / perPage) - 1));
  const displayed = rows.slice(page * perPage, (page + 1) * perPage);
  const key = JSON.stringify([displayed, selectedId, page, current?.attachmentsLoaded]);
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
      const attachmentCell = element("td", undefined, "sticky-attachments");
      const attachments = element("button", undefined, "attachment-button" + (row.attachmentCount ? " has-attachments" : ""));
      attachments.dataset.rowId = row.id; attachments.dataset.target = "attachments";
      attachments.title = current?.attachmentsLoaded ? "Вложений: " + (row.attachmentCount || 0) : "Вложения ещё не загружены";
      attachments.setAttribute("aria-label", "Вложения ECN " + (row.ecnNumber || "без номера") + ": " + (current?.attachmentsLoaded ? row.attachmentCount || 0 : "ещё не загружены"));
      attachments.append($("attachment-icon").content.cloneNode(true));
      if (row.attachmentCount) attachments.append(element("span", String(row.attachmentCount)));
      attachments.addEventListener("click", () => openRow(row.id, "attachments"));
      attachmentCell.append(attachments); tr.append(attachmentCell);
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
function rowAction(row, kind) {
  const isComments = kind === "comments";
  const count = isComments ? row.commentCount : row.attachmentCount;
  const button = element("button", undefined, (isComments ? "comment-button" : "attachment-button") + (count ? " has-" + kind : "") + (isComments && row.unreadCommentCount ? " unread" : ""));
  button.type = "button";
  button.dataset.rowId = row.id; button.dataset.target = kind;
  const name = isComments ? "Комментарии" : "Вложения";
  button.title = name + ": " + (count || 0);
  button.setAttribute("aria-label", name + " ECN " + (row.ecnNumber || "без номера") + ": " + (count || 0));
  button.append($(isComments ? "message-icon" : "attachment-icon").content.cloneNode(true), element("span", String(count || 0)));
  button.addEventListener("click", () => openRow(row.id, kind));
  return button;
}
function initials(value) {
  return String(value || "?").split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
}
function renderBoard(rows) {
  const options = current?.sheet?.columns?.find(column => column.title.toLocaleLowerCase() === "status")?.options || ["In Preparation", "Initial Review", "Sent for Approvals", "Approved", "Approved - Awaiting Further Action", "Customer Notification", "Complete and Closed"];
  const statuses = [...new Set([...(rows.some(row => !row.status) ? [""] : []), ...options, ...rows.map(row => row.status || "")])];
  const key = JSON.stringify([rows, statuses, selectedId]);
  if (key === lastBoardKey) return;
  lastBoardKey = key;
  const focused = document.activeElement?.closest("#card-board button");
  const focus = focused ? { id: focused.dataset.rowId, target: focused.dataset.target } : null;
  const scrolls = new Map([...$("card-board").querySelectorAll(".card-lane-rows")].map(node => [node.dataset.status, node.scrollTop]));
  const fragment = document.createDocumentFragment();
  if (!rows.length) {
    const empty = element("div", undefined, "board-empty");
    empty.append(element("strong", current?.lastSyncAt ? "Карточек не найдено" : "Ожидание ECF"), element("p", current?.lastSyncAt ? "Попробуй другой фильтр или поисковый запрос." : "После подключения здесь появятся ECN по статусам."));
    fragment.append(empty);
  } else for (const status of statuses) {
    const group = rows.filter(row => (row.status || "") === status);
    const lane = element("section", undefined, "card-lane");
    const heading = element("h2"); heading.title = status || "Без статуса";
    heading.append(element("span", status || "Без статуса"), element("b", String(group.length)));
    lane.append(heading);
    const list = element("div", undefined, "card-lane-rows"); list.dataset.status = status;
    if (!group.length) list.append(element("p", "Нет ECN", "empty-lane"));
    for (const row of group) {
      const card = element("article", undefined, "ecn-card" + (row.id === selectedId ? " selected" : "") + (/urgent/i.test(row.priority || "") ? " urgent" : ""));
      const main = element("button", undefined, "card-main"); main.type = "button";
      main.dataset.rowId = row.id; main.dataset.target = "details";
      main.setAttribute("aria-label", "Открыть ECN " + (row.ecnNumber || "без номера") + ", строка " + row.rowNumber);
      main.append(element("strong", row.ecnNumber || "Без номера", "card-number"));
      if (row.ecnType) main.append(element("span", row.ecnType, "card-line"));
      if (row.requestedBy) {
        const requester = element("span", undefined, "card-requester");
        requester.append(element("span", initials(row.requestedBy), "avatar"), element("span", row.requestedBy));
        requester.title = row.requestedBy; main.append(requester);
      }
      for (const [value, label] of [[row.itemNumber, "Item Number"], [row.itemDescription, "Item Description"], [row.description, "Описание изменения"], [row.implementation, "Effective When"]]) {
        if (!value) continue;
        const line = element("span", value, "card-line"); line.title = label + ": " + value; main.append(line);
      }
      if (/urgent/i.test(row.priority || "")) main.append(element("span", row.priority, "card-priority"));
      main.addEventListener("click", () => openRow(row.id, "details"));
      const footer = element("div", undefined, "card-actions");
      footer.append(rowAction(row, "attachments"), rowAction(row, "comments"), element("span", "Строка " + row.rowNumber, "card-row-number"));
      card.append(main, footer); list.append(card);
    }
    lane.append(list); fragment.append(lane);
  }
  $("card-board").replaceChildren(fragment);
  for (const list of $("card-board").querySelectorAll(".card-lane-rows")) list.scrollTop = scrolls.get(list.dataset.status) || 0;
  if (focus) [...$("card-board").querySelectorAll("button")].find(button => button.dataset.rowId === focus.id && button.dataset.target === focus.target)?.focus({ preventScroll: true });
}
function renderEvents() {
  const key = JSON.stringify(current.events);
  if (key === lastEventsKey) return;
  lastEventsKey = key;
  const fragment = document.createDocumentFragment();
  for (const event of current.events) {
    const isComment = event.kind.startsWith("comment_");
    const isAttachment = event.kind.startsWith("attachment_");
    const isError = ["error", "numbering_error", "numbering_conflict"].includes(event.kind);
    const item = element("li", undefined, "event" + (isError ? " error" : isComment ? " comment-event" : isAttachment ? " attachment-event" : ""));
    item.append(element("time", date(event.at)));
    if (event.rowId && current.rows.some(row => row.id === event.rowId)) {
      const button = element("button", event.message);
      button.addEventListener("click", () => { showView("sheet"); void openRow(event.rowId, isComment ? "comments" : isAttachment ? "attachments" : "details"); });
      item.append(button);
    } else item.append(element("span", event.message));
    fragment.append(item);
  }
  $("events").replaceChildren(fragment);
  $("journal-empty").hidden = current.events.length > 0;
}
function render() {
  const numberingEnabled = current.numbering?.enabled ?? current.mode === "auto_number";
  const labels = { needs_token: "Нужен токен", error: "Ошибка проверки", syncing: "Загрузка ECF", paused: "На паузе", watching: numberingEnabled ? "Агент активен" : "Наблюдение активно" };
  $("connection").lastElementChild.textContent = labels[current.monitor.state] || "Подключение";
  $("connection").dataset.state = current.monitor.state;
  $("agent-mode").textContent = numberingEnabled ? "Автонумерация" : "Наблюдение";
  $("numbering-status").hidden = !numberingEnabled;
  $("numbering-status").textContent = numberingEnabled ? "Номера: Initial Review + пустой ECN Number · дата создания" : "";
  $("last-sync").textContent = current.lastSyncAt ? "Проверено " + date(current.lastSyncAt) + " · " + current.counts.all + " строк" : "Первый снимок ещё не получен";
  $("pause").textContent = current.paused ? "Продолжить" : "Пауза";
  $("pause").disabled = !current.tokenConfigured || controlBusy;
  $("sync").disabled = !current.tokenConfigured || current.monitor.running || controlBusy;
  $("sync").textContent = current.monitor.running ? "Загрузка…" : "Проверить сейчас";
  const numberingError = current.numbering?.error;
  const errors = [];
  if (current.monitor.error && current.monitor.error !== numberingError) errors.push(current.monitor.error);
  if (numberingError) errors.push("Автонумерация: " + numberingError);
  report(errors.join(" "));
  const notices = [];
  if (!current.tokenConfigured) notices.push("Добавь SMARTSHEET_API_TOKEN в agents/ecn-agent/.env и перезапусти npm start.");
  if (current.paused) notices.push(numberingEnabled ? "Автопроверка на паузе. «Проверить сейчас» обновит данные и заполнит пустой ECN Number у строк Initial Review." : "Автопроверка на паузе. Кнопка «Проверить сейчас» загрузит строки, комментарии и вложения один раз.");
  if (current.sheet?.unavailableApprovals?.length) notices.push("Поля согласования требуют сверки: " + current.sheet.unavailableApprovals.join(", ") + ".");
  if (current.monitor.error && current.lastSyncAt) notices.push("Показан сохранённый снимок от " + date(current.lastSyncAt) + ".");
  if (current.lastSyncAt && !current.commentsLoaded) notices.push("Комментарии ещё не загружены. Дождись успешной проверки или нажми «Проверить сейчас».");
  if (current.lastSyncAt && !current.attachmentsLoaded) notices.push("Вложения ещё не загружены. Дождись успешной проверки или нажми «Проверить сейчас».");
  $("notice").textContent = notices.join(" "); $("notice").hidden = !notices.length;
  for (const key of ["active", "withoutNumber", "initialReview", "awaitingApprovals", "unreadComments"]) $("count-" + key).textContent = current.lastSyncAt ? String(current.counts[key] || 0) : "—";
  $("followup-count").textContent = String(current.followupCount || 0);
  $("rail-unread").textContent = current.counts.unreadComments > 99 ? "99+" : String(current.counts.unreadComments || 0);
  $("rail-unread").hidden = !current.counts.unreadComments;
  $("comment-total").textContent = current.commentsLoaded ? "Комментариев: " + current.counts.comments + " · Проверены " + date(current.commentsSyncAt) : "Комментарии ещё не загружены";
  $("attachment-total").textContent = current.attachmentsLoaded ? "Вложений: " + (current.counts.attachments || 0) + " · Проверены " + date(current.attachmentsSyncAt) : "Вложения ещё не загружены";
  $("poll-interval").textContent = "Интервал · " + current.pollSeconds + " с";
  renderRows(); renderEvents(); refreshComposerState();
}
function rowFact(label, value) {
  const part = element("div", undefined, "fact");
  part.append(element("dt", label), element("dd", value || "—"));
  return part;
}
function renderDetails(row) {
  const facts = element("dl", undefined, "facts");
  if (row.fields?.length) {
    for (const field of row.fields) {
      const fact = rowFact(field.title, field.value);
      if (field.locked) { const lock = element("span", " ▣", "field-lock"); lock.title = "Заблокированное поле в Smartsheet"; fact.firstElementChild.append(lock); }
      facts.append(fact);
    }
    $("detail-content").replaceChildren(facts);
    return;
  }
  facts.append(rowFact("ECN Status", row.status), rowFact("Site", row.site), rowFact("Item Number", row.itemNumber), rowFact("Item Description", row.itemDescription), rowFact("Requested By", row.requestedBy), rowFact("Создана строка", date(row.createdAt)), rowFact("Изменена строка", date(row.modifiedAt)));
  const approvals = element("div", undefined, "approvals");
  for (const approval of row.approvals || []) {
    const block = element("div", undefined, "approval");
    const contacts = approval.contacts.map(contact => [contact.name, contact.email].filter(Boolean).join(" · ")).join("\n");
    block.append(element("strong", approval.department), element("span", contacts || "Контакт не указан", "approval-person"), element("span", approval.available ? approval.status || "Поле ответа пусто" : "Колонка недоступна", "approval-status"));
    approvals.append(block);
  }
  $("detail-content").replaceChildren(facts, element("h3", "Описание изменения"), element("p", row.description || "Описание отсутствует.", "change-description"), element("h3", "Текущие согласующие"), approvals);
}
function renderComments(row) {
  const fragment = document.createDocumentFragment();
  fragment.append(element("p", "Обсуждения этого ECN в Smartsheet", "conversation-note"));
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
        const attached = (row.attachments || []).filter(attachment => attachment.parentType === "COMMENT" && attachment.parentId === comment.id);
        if (attached.length) {
          const links = element("div", undefined, "comment-attachments");
          for (const attachment of attached) {
            const link = element("a", undefined, "comment-file-link");
            link.append($("attachment-icon").content.cloneNode(true), element("span", attachment.name || "Вложение"));
            link.href = "/api/rows/" + encodeURIComponent(row.id) + "/attachments/" + encodeURIComponent(attachment.id) + "/open";
            link.target = "_blank"; link.rel = "noopener noreferrer"; links.append(link);
          }
          item.append(links);
        }
        section.append(item);
      });
      const reply = element("button", "↳ Ответить", "reply-button");
      reply.type = "button";
      reply.addEventListener("click", () => {
        const draft = draftFor(row.id);
        if (draft.busy || draft.operationId) return;
        draft.discussionId = thread.id;
        draft.replyName = thread.comments[0]?.author?.name || thread.comments[0]?.author?.email || "обсуждение";
        saveDrafts(); restoreComposer(); $("comment-text").focus();
      });
      section.append(reply);
      fragment.append(section);
    }
  }
  $("comments-content").replaceChildren(fragment);
}
function attachmentSize(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0) return "Размер не указан";
  const size = Number(value);
  const formatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
  return size >= 1024 ? formatter.format(size / 1024) + " МБ" : formatter.format(size) + " КБ";
}
function renderAttachments(row) {
  const fragment = document.createDocumentFragment();
  fragment.append(element("p", "Файлы и ссылки, прикреплённые к строке ECN и её комментариям. Файлы для ИИ можно выбрать на вкладке «ИИ-разбор».", "conversation-note"));
  if (!row.attachmentsLoaded) {
    fragment.append(element("p", "Вложения ещё не загружены. Нажми «Проверить сейчас».", "empty"));
  } else if (!row.attachments?.length) {
    fragment.append(element("p", "У этой строки и её комментариев пока нет вложений.", "empty"));
  } else {
    const list = element("ul", undefined, "attachment-list");
    const attachments = [...row.attachments].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || String(a.name || "").localeCompare(String(b.name || ""), "ru"));
    for (const attachment of attachments) {
      const isFile = attachment.attachmentType === "FILE";
      const name = attachment.name || "Вложение без названия";
      const item = element("li", undefined, "attachment-card");
      const head = element("div", undefined, "attachment-head");
      const icon = element("span", undefined, "attachment-symbol");
      icon.append($("attachment-icon").content.cloneNode(true));
      head.append(icon, element("p", name, "attachment-name"));
      const labels = element("div", undefined, "attachment-labels");
      labels.append(element("span", isFile ? "Файл · " + attachmentSize(attachment.sizeInKb) : "Внешняя ссылка", "attachment-type"));
      labels.append(element("span", attachment.parentType === "COMMENT" ? "К комментарию" : "К строке ECN"));
      const author = element("p", attachment.author?.name || attachment.author?.email || "Автор не указан", "attachment-author");
      author.title = attachment.author?.email || "";
      const created = element("time", "Добавлено · " + date(attachment.createdAt), "attachment-date");
      if (attachment.createdAt && !Number.isNaN(new Date(attachment.createdAt).valueOf())) created.dateTime = new Date(attachment.createdAt).toISOString();
      const link = element("a", isFile ? "Открыть файл ↗" : "Открыть ссылку ↗", "attachment-open");
      link.href = "/api/rows/" + encodeURIComponent(row.id) + "/attachments/" + encodeURIComponent(attachment.id) + "/open";
      link.target = "_blank"; link.rel = "noopener noreferrer";
      link.dataset.attachmentId = attachment.id;
      link.setAttribute("aria-label", (isFile ? "Открыть файл " : "Открыть ссылку ") + name + " в новой вкладке");
      item.append(head, labels, author, created, link);
      list.append(item);
    }
    fragment.append(list);
  }
  $("attachments-content").replaceChildren(fragment);
}
const reviewPanel = createReviewPanel({
  root: $("ai-content"), element, date,
  activeId: () => selectedTab === "ai" && selectedRow ? selectedId : null,
  addDraft(id, text) {
    if (id !== selectedId || !selectedRow) return false;
    const draft = draftFor(id);
    if (draft.busy || draft.operationId) throw new Error("Сначала проверь результат предыдущей отправки.");
    const combined = draft.text.trim() ? draft.text + "\n\n" + text : text;
    if (combined.length > 10000) throw new Error("Черновик превышает лимит в 10 000 символов.");
    draft.text = combined; draft.message = ""; draft.operationStatus = null;
    saveDrafts(); $("comment-text").value = combined;
    setTab("comments"); refreshComposerState(); $("comment-text").focus();
    return true;
  },
});
function setTab(tab, focus = false) {
  selectedTab = detailTabs.includes(tab) ? tab : "comments";
  $("ai-content").hidden = selectedTab !== "ai";
  if (selectedTab === "ai" && selectedRow) void reviewPanel.refresh();
  $("comments-content").hidden = selectedTab !== "comments";
  $("attachments-content").hidden = selectedTab !== "attachments";
  $("comment-form").hidden = selectedTab !== "comments";
  for (const name of detailTabs) {
    $("tab-" + name).setAttribute("aria-selected", String(name === selectedTab));
    $("tab-" + name).tabIndex = name === selectedTab ? 0 : -1;
  }
  if (focus) $("tab-" + selectedTab).focus();
  if (selectedTab === "comments") void markVisibleComments();
}
function draftFor(id) {
  if (!drafts.has(id)) drafts.set(id, { text: "", file: null, fileMeta: null, operationId: null, operationStatus: null, busy: false, message: "", discussionId: null, replyName: "" });
  return drafts.get(id);
}
function saveDrafts() {
  try {
    sessionStorage.setItem("ecn-comment-drafts", JSON.stringify([...drafts].map(([id, draft]) => [id, { text: draft.text, fileMeta: draft.fileMeta, operationId: draft.operationId, operationStatus: draft.operationStatus, message: draft.message, discussionId: draft.discussionId, replyName: draft.replyName }])));
  } catch {}
}
function restoreComposer() {
  if (!selectedId) return;
  const draft = draftFor(selectedId);
  $("comment-text").value = draft.text;
  $("comment-file").value = "";
  refreshComposerState();
}
function refreshComposerState() {
  if (!selectedId) return;
  const draft = draftFor(selectedId);
  const locked = draft.busy || Boolean(draft.operationId);
  $("comment-text").disabled = locked;
  $("comment-file").disabled = locked && !(draft.operationStatus === "not_found" && draft.fileMeta && !draft.file);
  $("remove-comment-file").disabled = locked;
  $("cancel-reply").disabled = locked;
  $("comment-file-summary").hidden = !draft.fileMeta;
  $("comment-file-name").textContent = draft.fileMeta ? draft.fileMeta.name + (draft.file ? "" : " · выбери файл повторно") : "";
  $("comment-reply-target").hidden = !draft.discussionId;
  $("comment-reply-target").firstElementChild.textContent = draft.discussionId ? "Ответ: " + draft.replyName : "";
  const status = $("comment-send-status");
  status.textContent = draft.message || "";
  status.hidden = !draft.message;
  status.dataset.kind = draft.operationStatus || "";
  $("retry-uncertain-comment").hidden = draft.operationStatus !== "uncertain";
  $("retry-uncertain-comment").disabled = draft.busy;
  const send = $("send-comment");
  send.textContent = draft.busy ? "Выполняется…" : draft.operationStatus === "not_found" ? "Повторить запрос" : draft.operationId ? "Проверить результат" : "Отправить";
  send.disabled = draft.busy || !current?.tokenConfigured || !selectedRow || (!draft.operationId && (!draft.text.trim() || Boolean(draft.fileMeta && !draft.file)));
  if (!current?.tokenConfigured && !draft.message) { status.textContent = "Для отправки нужен токен Smartsheet в настройках агента."; status.hidden = false; }
}
async function operationResponse(id, data, responseStatus = 200) {
  const draft = draftFor(id);
  const operation = data.operation;
  if (operation?.status === "sent") {
    draft.text = ""; draft.file = null; draft.fileMeta = null;
    draft.operationId = null; draft.operationStatus = "sent"; draft.discussionId = null; draft.replyName = "";
    draft.sentCommentId = operation.commentId;
    draft.message = "Комментарий" + (operation.attachmentIds?.length ? " и файл" : "") + " отправлен в Smartsheet. Обновляем обсуждение…";
    saveDrafts();
    if (selectedId === id) { $("comment-text").value = ""; $("comment-file").value = ""; }
    void update();
    return;
  }
  if (operation?.status === "pending") {
    draft.operationStatus = "pending";
    draft.message = "Smartsheet обрабатывает комментарий. Проверяем результат…";
    setTimeout(() => { if (!draft.busy && draft.operationStatus === "pending") void checkOperation(id); }, 2500);
  } else if (operation?.status === "uncertain") {
    draft.operationStatus = "uncertain";
    draft.message = operation.error || "Результат не подтверждён. Нажми «Проверить результат».";
    if (operation.discussionId) draft.message += " ID обсуждения " + operation.discussionId + ".";
    if (operation.commentId) draft.message += " ID комментария " + operation.commentId + ".";
  } else if (operation?.status === "rejected" || (responseStatus >= 400 && responseStatus < 500)) {
    draft.operationId = null; draft.operationStatus = "rejected";
    draft.message = data.error || operation?.error || "Комментарий не отправлен. Проверь данные и попробуй снова.";
  } else {
    draft.operationStatus = "uncertain";
    draft.message = "Не удалось подтвердить отправку. Нажми «Проверить результат».";
  }
  saveDrafts();
}
async function checkOperation(id, verify = false) {
  const draft = draftFor(id);
  if (!draft.operationId || draft.busy) return;
  draft.busy = true;
  if (selectedId === id) refreshComposerState();
  try {
    const path = "/api/rows/" + encodeURIComponent(id) + "/comment-operations/" + encodeURIComponent(draft.operationId);
    const response = await fetch(verify ? path + "/verify" : path, { method: verify ? "POST" : "GET",
      headers: { "X-ECN-UI": "1" }, cache: "no-store", signal: AbortSignal.timeout(verify ? 60000 : 15000) });
    const data = await response.json();
    if (response.status === 404) {
      draft.operationStatus = "not_found";
      draft.message = "Агент ещё не зарегистрировал отправку. Можно повторить запрос с тем же идентификатором.";
      // Keep the same operation ID: a delayed original request must not create another comment.
    } else if (response.ok && data.operation) {
      await operationResponse(id, data, response.status);
    } else {
      draft.message = data.error || "Проверка не завершена. Повтори проверку результата.";
    }
  } catch {
    draft.message = "Нет ответа от агента. Черновик сохранён. Нажми «Проверить результат» после восстановления связи.";
  } finally {
    draft.busy = false; saveDrafts();
    if (selectedId === id) refreshComposerState();
  }
}
async function sendComment(event) {
  event.preventDefault();
  if (!selectedId) return;
  const id = selectedId;
  const draft = draftFor(id);
  if (draft.busy) return;
  if (draft.operationId && draft.operationStatus !== "not_found") { await checkOperation(id, true); return; }
  if (!draft.text.trim() || !selectedRow || !current?.tokenConfigured) return;
  if (draft.fileMeta && !draft.file) { draft.message = "Выбери файл повторно перед отправкой."; refreshComposerState(); return; }
  draft.operationId ||= crypto.randomUUID();
  draft.operationStatus = "pending"; draft.busy = true; draft.message = "Отправляем в Smartsheet…";
  saveDrafts(); refreshComposerState();
  const body = new FormData();
  body.append("operationId", draft.operationId); body.append("text", draft.text);
  if (draft.discussionId) body.append("discussionId", draft.discussionId);
  if (draft.file) body.append("file", draft.file);
  try {
    const response = await fetch("/api/rows/" + encodeURIComponent(id) + "/comments", { method: "POST", headers: { "X-ECN-UI": "1" }, body, signal: AbortSignal.timeout(120000) });
    const data = await response.json();
    await operationResponse(id, data, response.status);
  } catch {
    draft.message = "Связь прервалась. Проверяем, был ли комментарий отправлен…";
    draft.operationStatus = "pending";
    setTimeout(() => void checkOperation(id), 500);
  } finally {
    draft.busy = false; saveDrafts();
    if (selectedId === id) refreshComposerState();
  }
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
    const draft = draftFor(id);
    if (draft.operationStatus === "sent" && row.discussions?.some(thread => thread.comments.some(comment => comment.id === draft.sentCommentId))) {
      draft.message = "Отправлено в Smartsheet. Обсуждение обновлено.";
    }
    refreshComposerState();
    $("detail-title").textContent = row.ecnNumber || "ECN без номера";
    $("detail-row-number").textContent = row.rowNumber;
    $("detail-comment-count").textContent = row.commentCount;
    $("detail-attachment-count").textContent = row.attachmentsLoaded ? row.attachments?.length || 0 : "—";
    $("detail-source").textContent = "Последний снимок · " + date(current?.lastSyncAt);
    if (changed) {
      const detailScroll = $("detail-content").scrollTop;
      const commentScroll = $("comments-content").scrollTop;
      const attachmentScroll = $("attachments-content").scrollTop;
      const focusedAttachment = document.activeElement?.dataset.attachmentId;
      renderDetails(row); renderComments(row); renderAttachments(row);
      $("detail-content").scrollTop = detailScroll; $("comments-content").scrollTop = commentScroll;
      $("attachments-content").scrollTop = attachmentScroll;
      if (focusedAttachment) Array.from($("attachments-content").querySelectorAll("a")).find(link => link.dataset.attachmentId === focusedAttachment)?.focus({ preventScroll: true });
    }
    if (selectedTab === "ai") void reviewPanel.refresh();
    await markVisibleComments();
  } catch (error) {
    if (ticket !== detailTicket) return;
    selectedRow = null;
    refreshComposerState();
    const text = error.status === 404 ? "Строка больше не присутствует в ECF. Последние события доступны в журнале." : error.message;
    for (const target of detailPanels) $(target).replaceChildren(element("p", text, "empty"));
    $("detail-source").textContent = "Карточка недоступна";
  }
}
async function openRow(id, tab) {
  if ($("drawer").hidden) returnFocus = document.activeElement;
  const isNew = selectedId !== id;
  selectedId = id;
  if (isNew) {
    selectedRow = null;
    $("detail-title").textContent = "Загрузка…";
    $("detail-row-number").textContent = "—";
    $("detail-comment-count").textContent = "—";
    $("detail-attachment-count").textContent = "—";
    $("detail-source").textContent = "Загрузка карточки…";
    for (const target of detailPanels) { $(target).replaceChildren(element("p", "Загрузка…", "empty")); $(target).scrollTop = 0; }
  }
  $("drawer").hidden = false;
  $("detail-backdrop").hidden = false;
  document.querySelectorAll(".rail, .sheet-header, .toolbar, .summary-bar, .statusbar, #sheet-view, #activity-view").forEach(node => { node.inert = true; });
  setTab(tab);
  restoreComposer();
  $("close-detail").focus({ preventScroll: true });
  renderRows();
  await refreshDetail();
  const draft = draftFor(id);
  if (draft.operationId && !draft.busy && !["sent", "rejected"].includes(draft.operationStatus)) void checkOperation(id);
}
function closeDetail() {
  const previousId = selectedId;
  $("drawer").hidden = true;
  $("detail-backdrop").hidden = true;
  document.querySelectorAll("[inert]").forEach(node => { node.inert = false; });
  selectedId = null; selectedRow = null; detailTicket += 1;
  renderRows();
  const rowFocus = Array.from($(sheetView === "cards" ? "card-board" : "rows").querySelectorAll("button")).find(button => button.dataset.rowId === previousId && button.dataset.target === "details");
  (returnFocus?.isConnected ? returnFocus : rowFocus)?.focus({ preventScroll: true });
  returnFocus = null;
}
function showView(view) {
  activeView = view;
  $("sheet-view").hidden = view !== "sheet";
  $("activity-view").hidden = view !== "activity";
  $("view-name").hidden = view === "sheet";
  $("view-switch").hidden = view !== "sheet";
  for (const name of ["sheet", "activity"]) {
    $("nav-" + name).classList.toggle("selected", name === view);
    $("nav-" + name).setAttribute("aria-pressed", String(name === view));
  }
  if (view === "activity") closeDetail();
}
function changeSheetView(view) {
  sheetView = view;
  try { localStorage.setItem("ecn-sheet-view", view); } catch {}
  $("view-table").setAttribute("aria-pressed", String(view === "table"));
  $("view-cards").setAttribute("aria-pressed", String(view === "cards"));
  showView("sheet"); renderRows();
}
function changeFilter(value) { showView("sheet"); $("filter").value = value; page = 0; renderRows(); }
async function update() {
  if (loading) return;
  loading = true;
  try {
    const previousSync = current?.lastSyncAt;
    const previousAttachmentsSync = current?.attachmentsSyncAt;
    current = await request("/api/state"); render();
    if (selectedId && (previousSync !== current.lastSyncAt || previousAttachmentsSync !== current.attachmentsSyncAt || !selectedRow)) await refreshDetail();
    else if (selectedRow && selectedTab === "ai") void reviewPanel.refresh();
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
$("view-table").addEventListener("click", () => changeSheetView("table"));
$("view-cards").addEventListener("click", () => changeSheetView("cards"));
$("comment-form").addEventListener("submit", sendComment);
$("comment-text").addEventListener("input", () => {
  if (!selectedId) return;
  const draft = draftFor(selectedId);
  draft.text = $("comment-text").value;
  if (!draft.operationId) { draft.message = ""; draft.operationStatus = null; }
  saveDrafts(); refreshComposerState();
});
$("comment-file").addEventListener("change", () => {
  if (!selectedId) return;
  const file = $("comment-file").files[0];
  if (!file) return;
  const draft = draftFor(selectedId);
  if (file.size > 30_000_000) {
    draft.message = "Размер файла не должен превышать 30 МБ.";
    $("comment-file").value = "";
  } else if (draft.operationId && draft.fileMeta && (file.name !== draft.fileMeta.name || file.size !== draft.fileMeta.size || file.type !== draft.fileMeta.type)) {
    draft.message = "Для повтора запроса выбери исходный файл: " + draft.fileMeta.name;
    $("comment-file").value = "";
  } else {
    draft.file = file; draft.fileMeta = { name: file.name, size: file.size, type: file.type }; draft.message = "";
  }
  saveDrafts(); refreshComposerState();
});
$("remove-comment-file").addEventListener("click", () => {
  if (!selectedId) return;
  const draft = draftFor(selectedId);
  if (draft.busy || draft.operationId) return;
  draft.file = null; draft.fileMeta = null; $("comment-file").value = "";
  saveDrafts(); refreshComposerState();
});
$("cancel-reply").addEventListener("click", () => {
  if (!selectedId) return;
  const draft = draftFor(selectedId);
  if (draft.busy || draft.operationId) return;
  draft.discussionId = null; draft.replyName = "";
  saveDrafts(); refreshComposerState();
});
$("retry-uncertain-comment").addEventListener("click", () => {
  if (!selectedId) return;
  const draft = draftFor(selectedId);
  if (draft.busy || draft.operationStatus !== "uncertain") return;
  if (!window.confirm("Повторить можно, только если комментария нет в Smartsheet. Иначе появится дубликат. Ты проверил обсуждение?")) return;
  draft.operationId = null; draft.operationStatus = null;
  draft.message = "Черновик готов к повторной отправке.";
  saveDrafts(); refreshComposerState();
});
$("pause").addEventListener("click", () => control(current?.paused ? "/api/resume" : "/api/pause"));
for (const id of ["search", "filter", "sort"]) $(id).addEventListener("input", () => { page = 0; if (activeView !== "sheet") showView("sheet"); renderRows(); });
$("previous").addEventListener("click", () => { page -= 1; renderRows(); });
$("next").addEventListener("click", () => { page += 1; renderRows(); });
$("nav-sheet").addEventListener("click", () => showView("sheet"));
$("nav-activity").addEventListener("click", () => showView("activity"));
$("nav-unread").addEventListener("click", () => changeFilter("unread"));
document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => changeFilter(button.dataset.filter)));
for (const name of detailTabs) {
  $("tab-" + name).addEventListener("click", () => setTab(name));
  $("tab-" + name).addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = detailTabs.indexOf(name);
    const next = event.key === "Home" ? 0 : event.key === "End" ? detailTabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + detailTabs.length) % detailTabs.length;
    setTab(detailTabs[next], true);
  });
}
$("close-detail").addEventListener("click", closeDetail);
$("detail-backdrop").addEventListener("click", closeDetail);
document.addEventListener("keydown", event => {
  if (!selectedId) return;
  if (event.key === "Escape") closeDetail();
  if (event.key === "Tab") {
    const focusable = [...$("drawer").querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) { void update(); void markVisibleComments(); } });
setInterval(() => { if (!document.hidden) void update(); }, 4000);
changeSheetView(sheetView);
void update().then(() => {
  const id = new URLSearchParams(location.search).get("row");
  if (id && current?.rows?.some(row => row.id === id)) void openRow(id,"comments");
});
