// Excel CSV exports may use a comma or a semicolon and can contain quoted multiline cells.
function csvRows(text) {
  const firstLine = text.slice(0,text.indexOf("\n") < 0 ? undefined : text.indexOf("\n"));
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i+1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) { row.push(field.trim()); field = ""; }
    else if (!quoted && char === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (quoted) throw new Error("Незакрытая кавычка в CSV матрицы.");
  if (field.length || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}
export function matrixBlocks(text, revision) {
  const rows = csvRows(text.replace(/^\uFEFF/,""));
  const header = rows.findIndex(r => /^type of change$/i.test(r[0]));
  const titles = rows.slice(0,header).find(r => r.some(c => /^engineering$/i.test(c)));
  const prefix = rows.slice(0,header).flat();
  if (!titles || !prefix.some(c => /form no\.\s*DWKID-7206/i.test(c)) ||
      !prefix.some(c => /^revision no\.\s*:\s*(\S+)/i.exec(c)?.[1] === revision)) throw new Error("Проверь лист, номер DWKID-7206 и ревизию матрицы в manifest.json.");
  const stages = ["Pre-Approval","Implementation Review","Completion Notification"];
  const groups = [];
  for (const [column,value] of rows[header].entries()) {
    if (value.toLowerCase() !== "pre-approval") continue;
    if (!titles[column] || !stages.every((s,i) => rows[header][column+i]?.toLowerCase() === s.toLowerCase()))
      throw new Error("Не удалось сопоставить заголовки этапов и подразделений матрицы.");
    groups.push({ name:titles[column], column });
  }
  if (!groups.length) throw new Error("В матрице отсутствуют подразделения.");
  const blocks = [];
  for (let i = header + 1; i < rows.length; i++) {
    const r = rows[i], type = r[0]?.trim();
    if (!type) continue;
    if (/^date$/i.test(type)) break;
    const atStage = stages.map(() => []);
    for (const group of groups) for (let j = 0; j < stages.length; j++) {
      const value = r[group.column+j]?.toUpperCase();
      if (!["YES","NO"].includes(value)) throw new Error("Проверь значение и этап в строке Excel " + (i+1) + " · " + group.name + ".");
      if (value === "YES") atStage[j].push(group.name);
    }
    blocks.push({level:1,text:"DWKID-7206 · строка " + (i+1) + " · " + type.replace(/\s+/g," ")},
      {level:0,text:stages.map((s,j) => s + ": " + (atStage[j].join(", ") || "нет отметок YES")).join("\n")});
  }
  if (!blocks.length) throw new Error("В матрице нет строк типов изменений.");
  return blocks;
}
