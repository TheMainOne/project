// services/web_crawler/extractors.js
const rxTime = /\b(\d{1,2}[:.]\d{2})\s*[–-]\s*(\d{1,2}[:.]\d{2})\s*(?:([A-Z]{2,4}))?/gi;
const rxPriceUsd = /\$\s?(\d+(?:[.,]\d{1,2})?)(?:\s*\/\s*(?:мес|mo|month))?/gi;

export function isPriceQuery(q) {
  const s = q.toLowerCase();
  return /сколько стоит|цена|стоимость|price|cost|basic|pro|enterprise/.test(s);
}
export function isHoursQuery(q) {
  const s = q.toLowerCase();
  return /часы|график|когда вы|hours|open|support/i.test(s);
}
export function isRefundQuery(q) {
  const s = q.toLowerCase();
  return /возврат|refund|вернуть/i.test(s);
}

export function extractPrice(txt) {
  let m; const hits = [];
  while ((m = rxPriceUsd.exec(txt)) !== null) hits.push(m[1].replace(',', '.'));
  if (!hits.length) return null;
  // Возьмём первое попадание
  return `$${hits[0]} / мес`;
}

export function extractHours(txt) {
  let m; const hits = [];
  while ((m = rxTime.exec(txt)) !== null) {
    const from = m[1].replace('.', ':');
    const to   = m[2].replace('.', ':');
    const tz   = m[3] ? ` ${m[3]}` : '';
    hits.push(`${from}–${to}${tz}`);
  }
  return hits[0] || null;
}

export function extractRefund(txt) {
  // простая вырезка 1-2 предложений со словом "возврат"/"refund"
  const s = txt.replace(/\s+/g, ' ');
  const m = s.match(/([^.!?]*\b(возврат|refund)\b[^.!?]*[.!?])(?:\s+([^.!?]*[.!?]))?/i);
  if (!m) return null;
  return (m[1] + (m[3] ? ' ' + m[3] : '')).trim();
}
