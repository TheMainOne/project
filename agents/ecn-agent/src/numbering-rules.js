export function validDay(day) {
  if (!/^\d{8}$/.test(String(day))) return false;
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(4, 6));
  const date = Number(day.slice(6, 8));
  if (year < 1900 || year > 9999) return false;
  const parsed = new Date(Date.UTC(year, month - 1, date));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date;
}

export function parseEcnNumber(value) {
  const match = /^(\d{8})-(\d{2,})$/.exec(String(value ?? "").trim());
  if (!match || !validDay(match[1])) return null;
  const sequence = Number(match[2]);
  return Number.isSafeInteger(sequence) && sequence > 0 ? { day: match[1], sequence } : null;
}

export function formatEcnNumber(day, sequence) {
  if (!validDay(day) || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Некорректный номер ECN.");
  return day + "-" + String(sequence).padStart(2, "0");
}

export function creationDay(createdAt, timeZone = "America/New_York") {
  // Smartsheet provides an instant. Reject timezone-less strings instead of using the host's timezone.
  if (typeof createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(createdAt) || !validDay(createdAt.slice(0, 10).replaceAll("-", ""))) {
    throw new Error("У заявки нет корректной даты создания. Номер не присвоен.");
  }
  const date = new Date(createdAt);
  if (!Number.isFinite(date.valueOf())) throw new Error("У заявки нет корректной даты создания. Номер не присвоен.");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const day = values.year + values.month + values.day;
  if (!validDay(day)) throw new Error("У заявки нет корректной даты создания. Номер не присвоен.");
  return day;
}

export function isNumberingCandidate(row) {
  return row?.numberOccupied !== true && String(row?.ecnNumber ?? "").trim() === "" &&
    String(row?.status ?? "").trim().toLowerCase() === "initial review";
}
