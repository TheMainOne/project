const $ = id => document.getElementById(id);
let current = null;
let page = 0;
let loading = false;
let detailId = null;
let detailRequest = 0;
const perPage = 25;

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

async function request(path, method = "GET") {
  const response = await fetch(path, { method, headers: { "X-ECN-UI": "1" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ошибка запроса.");
  return data;
}

function visibleRows() {
  const search = $("search").value.toLocaleLowerCase().trim();
  const filter = $("filter").value;
  return (current?.rows || []).filter(row => {
    if (filter === "active" && !row.active) return false;
    if (filter === "without-number" && (row.ecnNumber || !row.active)) return false;
    if (!["active", "without-number", "all"].includes(filter) && row.status !== filter) return false;
    return !search || [row.ecnNumber, row.site, row.itemNumber, row.itemDescription, row.status]
      .some(value => String(value).toLocaleLowerCase().includes(search));
  });
}

function renderRows() {
  const rows = visibleRows();
  page = Math.min(page, Math.max(0, Math.ceil(rows.length / perPage) - 1));
  const fragment = document.createDocumentFragment();
  for (const row of rows.slice(page * perPage, (page + 1) * perPage)) {
    const tr = element("tr");
    const first = element("td");
    const link = element("button", row.ecnNumber || "Без номера", "row-link");
    link.addEventListener("click", () => openDetail(row.id));
    first.append(link);
    tr.append(first);
    const status = element("td");
    status.append(element("span", row.status || "Статус пуст", "status " + (row.status === "Sent for Approvals" ? "waiting" : row.status === "Initial Review" ? "review" : "")));
    tr.append(status);
    for (const [text, css] of [[row.site, ""], [row.itemNumber, "material"], [row.itemDescription, "description"], [date(row.modifiedAt), "date"]]) {
      tr.append(element("td", text || "—", css));
    }
    fragment.append(tr);
  }
  $("rows").replaceChildren(fragment);
  $("empty").hidden = rows.length > 0;
  $("empty").textContent = current?.lastSyncAt
    ? "По этому фильтру строк нет."
    : "После подключения здесь появятся строки вашей ECF.";
  $("result-count").textContent = "Строк: " + rows.length;
  $("page-info").textContent = rows.length ? (page * perPage + 1) + "–" + Math.min((page + 1) * perPage, rows.length) + " из " + rows.length : "";
  $("previous").disabled = page === 0;
  $("next").disabled = (page + 1) * perPage >= rows.length;
}

function renderEvents() {
  const fragment = document.createDocumentFragment();
  for (const event of current.events) {
    const item = element("li", undefined, "event " + (event.kind === "error" ? "error" : ""));
    item.append(element("time", date(event.at)), element("span", event.message));
    fragment.append(item);
  }
  $("events").replaceChildren(fragment);
  $("journal-empty").hidden = current.events.length > 0;
}

function render() {
  const labels = { needs_token: "Нужен API-токен", error: "Ошибка", syncing: "Чтение ECF", paused: "На паузе", watching: "Наблюдение активно" };
  $("connection").lastElementChild.textContent = labels[current.monitor.state];
  $("connection").dataset.state = current.monitor.state;
  $("last-sync").textContent = current.lastSyncAt
    ? "Последний успешный снимок · " + date(current.lastSyncAt) + " · " + current.counts.all + " строк"
    : "Первый снимок ECF ещё не получен";
  $("pause").textContent = current.paused ? "Продолжить" : "Пауза";
  $("pause").disabled = !current.tokenConfigured;
  $("sync").disabled = !current.tokenConfigured || current.monitor.running;
  $("sync").textContent = current.monitor.running ? "Чтение…" : "Проверить сейчас";
  report(current.monitor.error);
  const notices = [];
  if (!current.tokenConfigured) notices.push("Добавь SMARTSHEET_API_TOKEN в agents/ecn-agent/.env и перезапусти npm start.");
  if (current.paused) notices.push("Автопроверка на паузе. Текущий запрос завершится. Кнопка «Проверить сейчас» выполняет одну проверку.");
  if (current.sheet?.unavailableApprovals?.length) notices.push("Поля согласования требуют сверки: " + current.sheet.unavailableApprovals.join(", ") + ".");
  if (current.monitor.error && current.lastSyncAt) notices.push("Показаны сохранённые данные от " + date(current.lastSyncAt) + ".");
  $("notice").textContent = notices.join(" ");
  $("notice").hidden = !notices.length;
  for (const key of ["active", "withoutNumber", "initialReview", "awaitingApprovals"]) {
    $("count-" + key).textContent = current.lastSyncAt ? String(current.counts[key]) : "—";
  }
  renderRows();
  renderEvents();
}

function rowFact(label, value) {
  const part = element("div", undefined, "fact");
  part.append(element("dt", label), element("dd", value || "—"));
  return part;
}

async function openDetail(id, show = true) {
  detailId = id;
  const ticket = ++detailRequest;
  if (show) {
    $("detail-title").textContent = "Загрузка…";
    $("detail-content").replaceChildren();
    if (!$("detail").open) $("detail").showModal();
  }
  try {
    const row = await request("/api/rows/" + encodeURIComponent(id));
    if (ticket !== detailRequest || detailId !== id) return;
    $("detail-title").textContent = row.ecnNumber || "ECN без номера";
    const facts = element("dl", undefined, "facts");
    facts.append(
      rowFact("Status", row.status),
      rowFact("Площадка", row.site),
      rowFact("Материал", row.itemNumber),
      rowFact("Инициатор", row.requestedBy),
      rowFact("Создана строка", date(row.createdAt)),
      rowFact("Изменена строка", date(row.modifiedAt)),
    );
    const description = element("p", row.description || "Описание отсутствует.", "change-description");
    const approvals = element("div", undefined, "approvals");
    for (const approval of row.approvals) {
      const block = element("div", undefined, "approval");
      const contacts = approval.contacts.map(contact => [contact.name, contact.email].filter(Boolean).join(" · ")).join("\n");
      block.append(element("strong", approval.department), element("span", contacts || "Контакт не указан", "approval-person"));
      block.append(element("span", approval.available ? approval.status || "Поле ответа пусто" : "Колонка недоступна", "approval-status"));
      approvals.append(block);
    }
    $("detail-content").replaceChildren(
      facts, element("h3", "Изменение"), description,
      element("h3", "Текущие согласующие"), approvals,
      element("p", "Источник — последняя успешная проверка ECF. Время createdAt относится к строке Smartsheet.", "subtle detail-footnote"),
    );
  } catch (error) {
    if (ticket === detailRequest) $("detail-content").replaceChildren(element("p", error.message, "alert"));
  }
}

async function update() {
  if (loading) return;
  loading = true;
  try {
    const previousSync = current?.lastSyncAt;
    current = await request("/api/state");
    render();
    if ($("detail").open && detailId && previousSync !== current.lastSyncAt) void openDetail(detailId, false);
  } catch {
    report("Нет связи с локальным агентом. Проверь окно терминала и запусти npm start.");
    $("connection").dataset.state = "error";
    $("connection").lastElementChild.textContent = "Агент недоступен";
    $("sync").disabled = true;
    $("pause").disabled = true;
  } finally {
    loading = false;
  }
}

async function control(path) {
  $("sync").disabled = true;
  $("pause").disabled = true;
  try {
    await request(path, "POST");
    await update();
  } catch (error) {
    report(error.message);
  }
}

$("sync").addEventListener("click", () => control("/api/sync"));
$("pause").addEventListener("click", () => control(current.paused ? "/api/resume" : "/api/pause"));
for (const id of ["search", "filter"]) $(id).addEventListener("input", () => { page = 0; renderRows(); });
$("previous").addEventListener("click", () => { page -= 1; renderRows(); });
$("next").addEventListener("click", () => { page += 1; renderRows(); });
$("close-detail").addEventListener("click", () => $("detail").close());
$("detail").addEventListener("close", () => { detailId = null; detailRequest += 1; });
document.addEventListener("visibilitychange", () => { if (!document.hidden) void update(); });
setInterval(() => { if (!document.hidden) void update(); }, 4000);
void update();
