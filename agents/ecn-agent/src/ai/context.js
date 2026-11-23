import { FIELDS } from "../smartsheet.js";
import { commentEntries } from "../comments.js";
import { attachmentIdentity } from "./attachments.js";
import { selectKnowledge, digest } from "./knowledge.js";
import { REVIEW_VERSION } from "./openai.js";

const fallback = { ecnNumber:"ECN Number",status:"Status",ecnType:"ECN Type",priority:"Priority",site:"Site Location",
  itemNumber:"Item Number",itemDescription:"Item Description",description:"Description of Change",implementation:"Effective When",requestedBy:"Requested By" };
const priority = new Set([FIELDS.description,FIELDS.itemDescription,FIELDS.itemNumber,FIELDS.site,FIELDS.status,FIELDS.ecnNumber].map(k => "field:" + k));
function rowFields(row) {
  if (row.fields?.length) return row.fields.map(f => ({id:"field:" + f.columnId, kind:"field",label:f.title,text:String(f.value || "")}));
  const fields = Object.entries(fallback).map(([key,label]) => ({id:"field:" + key, kind:"field",label,text:String(row[key] || "")}));
  for (const [index, approval] of (row.approvals || []).entries()) {
    if (approval.available) fields.push({ id:"field:approval-" + index, kind:"field",label:approval.department,
      text:[...(approval.contacts || []).map(c => c.name || c.email),approval.status].filter(Boolean).join(" · ") });
  }
  return fields;
}
export function snapshot(row, knowledge, model) {
  const fields = rowFields(row).filter(f => f.text.trim()).sort((a,b) => Number(priority.has(b.id))-Number(priority.has(a.id)) || a.id.localeCompare(b.id));
  const comments = commentEntries(row).map(c => ({id:"comment:" + c.id,kind:"comment",label:[c.author?.name || c.author?.email,c.createdAt].filter(Boolean).join(" · ") || "Комментарий",
    text:c.text || "", discussionId:c.discussionId, modifiedAt:c.modifiedAt || ""})).sort((a,b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)) || a.id.localeCompare(b.id));
  const files = [...(row.attachments || [])].sort((a,b) => a.id.localeCompare(b.id));
  const basis = digest([REVIEW_VERSION,row.id,fields,comments,row.commentsLoaded === true,row.attachmentsLoaded === true,files.map(attachmentIdentity),knowledge.version,model]);
  return { fields,comments,files,basis };
}
export function reviewContext(row, snap, knowledge, selected) {
  const sources = [], notes = [];
  function add(items, budget) {
    let count = 0, shortened = 0;
    for (const item of items) {
      if (budget <= 0) break;
      const text = item.text.slice(0, Math.min(6000,budget));
      if (text.length < item.text.length) shortened++;
      sources.push({ ...item, text });
      budget -= Math.max(text.length, 50); count++;
    }
    return { count, shortened };
  }
  const fields = add(snap.fields, 32000);
  const comments = add(snap.comments.slice(0,60), 36000);
  if (fields.count < snap.fields.length || fields.shortened)
    notes.push("Передано полей: " + fields.count + " из " + snap.fields.length + ". Длинные значения могли быть сокращены.");
  if (!row.commentsLoaded) notes.push("Полный снимок обсуждений ещё не загружен.");
  if (comments.count < snap.comments.length || comments.shortened)
    notes.push("Передано последних комментариев: " + comments.count + " из " + snap.comments.length + ". Длинные сообщения могли быть сокращены.");
  if (!row.attachmentsLoaded) notes.push("Полный список вложений ещё не загружен.");
  if (selected.length < snap.files.length) notes.push("Выбрано вложений: " + selected.length + " из " + snap.files.length + ".");
  const query = [row.description,row.itemDescription,row.ecnType,row.site,row.itemNumber,...selected.map(s => s.name),
    ...snap.comments.slice(0,4).map(c => c.text.slice(0,700))].filter(Boolean).join(" ");
  const rules = selectKnowledge(knowledge, query);
  if (!rules.length) notes.push(knowledge.version ? "По тексту заявки подходящих фрагментов справочника не найдено." : "База знаний ещё не опубликована.");
  for (const section of rules) {
    const doc = knowledge.documents.find(d => d.id === section.document);
    const isExample = doc.kind === "handbook" && /(?:^| › )(?:пример(?:\s|$)|учебный\s)/iu.test(section.heading);
    sources.push({id:section.id,kind:isExample ? "precedent" : doc.kind,label:doc.title + " · " + doc.revision + " · " + section.heading,text:section.text});
  }
  for (const item of selected) sources.push({ id:"file:" + item.id,kind:"file",label:item.name,text:"Файл приложен к запросу." });
  return { sources,coverage:notes };
}
