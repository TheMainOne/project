// Coordinator's routing rule: creating only a customer drawing for an existing item
// goes to Engineering. Match the whole request so a second change stays in general review.
const drawingRequest = /^(?:print request\s*#?\s*\d+[.:;,\s-]+)?(?:please\s+)?(?:(?:using|from|based on)\s+(?:the\s+)?(?:attached\s+|bom\s+)?(?:print|drawing)[,;:]?\s+)?(?:please\s+)?(?:create|prepare|generate)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:csd|customer drawing)(?:\s+(?:for|of)\s+(?:(?:this|the)\s+)?item(?:\s+#?[\w-]+)?)?(?:\s+(?:using|from|based on)\s+(?:the\s+)?(?:attached\s+|bom\s+)?(?:print|drawing))?[.!\s]*$/i;
const normalize = value => String(value || "").trim().toLowerCase().replace(/\s+/g," ");
const field = (row,title) => normalize(row.fields?.find(f => normalize(f.title) === title)?.value);

export function isSimpleCsd(row) {
  if (!row.itemNumber || normalize(row.ecnType) !== "change" || !drawingRequest.test(normalize(row.description))) return false;
  // Additional coordinator notes or discussions may change the scope or name an approver.
  if (row.discussions?.some(d => d.comments?.length) ||
      row.fields?.some(f => /^comments?\s*\/\s*updates$/i.test(f.title.trim()) && f.value.trim())) return false;
  return !row.approvals?.some(a => a.department !== "Engineering" && a.contacts?.length);
}

export function csdProposal(row, groups, history) {
  const group = groups.find(g => g.department === "Engineering");
  if (!group || !isSimpleCsd(row)) return null;
  const customer = field(row,"customer");
  const matches = history.filter(r => r.id !== row.id && r.ecnNumber && drawingRequest.test(normalize(r.description)) &&
    normalize(r.ecnType) === "change" && normalize(r.itemNumber) === normalize(row.itemNumber) &&
    customer && field(r,"customer") === customer && (!row.site || normalize(r.site) === normalize(row.site)));
  // A disagreement, an additional approval or an obsolete contact prevents a named suggestion.
  const approved = matches.filter(r => r.approvals?.some(a => normalize(a.status) === "approved"));
  const emails = approved.map(r => {
    const engineering = r.approvals.find(a => a.department === "Engineering");
    if (normalize(engineering?.status) !== "approved" || engineering.contacts.length !== 1 ||
        r.approvals.some(a => a.department !== "Engineering" && (a.contacts.length || normalize(a.status) === "approved"))) return "";
    return normalize(engineering.contacts[0].email);
  });
  const unique = new Set(emails);
  const email = unique.size === 1 && group.options.some(p => p.email === emails[0]) ? emails[0] : "";
  const example = email ? approved.map(r => r.ecnNumber).sort().at(-1) : "";
  const reason = example
    ? "Тот же материал и заказчик: в ECN " + example + " этот сотрудник согласовал создание CSD."
    : "Для создания клиентского чертежа нужен Engineering. Выбери сотрудника этого отдела.";
  return { note:"Рекомендуемый маршрут: только Engineering. Заявка запрашивает создание CSD для существующего изделия.",
    choices:[{department:group.department,email,reason,source:example ? "История согласований · ECN " + example : "Правило координатора · создание CSD"}] };
}
