import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const emptyKnowledge = Object.freeze({ version: "", documents: [], sections: [] });

export function loadKnowledge(directory) {
  let active;
  try { active = readFileSync(join(directory, "active.json"), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return emptyKnowledge; throw error; }
  const { version } = JSON.parse(active);
  if (!/^[0-9a-f]{64}$/.test(version)) throw new Error("Invalid knowledge version");
  const data = JSON.parse(readFileSync(join(directory, "versions", version + ".json"), "utf8"));
  if (digest(data) !== version || data.format !== 1 || !Array.isArray(data.sections)) throw new Error("Invalid knowledge snapshot");
  return { ...data, version };
}

const ignored = new Set("for the and from this that with how has are new ecn item change review initial standard update changes requested см для или при как это что если есть изменения для этой материал".split(" "));
const concepts = [
  ["incoming", "inspection", "входной", "контроль", "инспекция"], ["drawing", "drawings", "чертеж", "чертежи", "чертёж"],
  ["labels", "label", "labeling", "этикетка", "этикетки", "маркировка"], ["vendor", "supplier", "source", "поставщик"],
  ["routing", "routings", "маршрут", "выработка"], ["approver", "approvals", "matrix", "согласующих", "матрицы"],
  ["bom", "component", "компонент", "спецификация"], ["discontinue", "discontinuation", "прекращение", "discontinued"],
  ["packaging", "pack", "упаковка"], ["pricing", "price", "cost", "себестоимость", "цена"],
];
function tokens(text) {
  return (text.toLowerCase().replaceAll("ё", "е").match(/[\p{L}\p{N}]+/gu) || []).filter(t => t.length > 1 && !ignored.has(t));
}
export function selectKnowledge(knowledge, query, limit = 6) {
  const direct = new Set(tokens(query));
  if (!direct.size) return [];
  const near = new Set();
  for (const group of concepts) {
    const words = tokens(group.join(" "));
    if (words.some(word => direct.has(word))) for (const word of words) near.add(word);
  }
  const indexed = knowledge.sections.map(section => ({ section, heading: new Set(tokens(section.heading)), body: new Set(tokens(section.text)) }));
  const weights = new Map();
  for (const word of new Set([...direct, ...near])) {
    const frequency = indexed.filter(entry => entry.heading.has(word) || entry.body.has(word)).length;
    if (frequency) weights.set(word, Math.log(1 + indexed.length / frequency) * (direct.has(word) ? 1 : .38));
  }
  return indexed.map(entry => {
    let score = 0;
    for (const [word, weight] of weights) score += weight * ((entry.heading.has(word) ? 3 : 0) + (entry.body.has(word) ? 1 : 0));
    return { score, section: entry.section };
  }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.section.id.localeCompare(b.section.id))
    .slice(0, limit).map(hit => hit.section);
}
