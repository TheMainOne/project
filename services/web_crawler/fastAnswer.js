// services/web_crawler/fastAnswer.js
import { isPriceQuery, isHoursQuery, isRefundQuery, extractPrice, extractHours, extractRefund } from './extractors.js';

/**
 * Пробуем ответить без LLM, если контекст "очевиден".
 * @param {string} query
 * @param {Array<{text:string,url:string,score:number}>} contexts
 * @param {string} lang
 * @returns {null | { reply: string, citations: Array<{idx:number,url:string}> }}
 */
export function tryFastAnswer(query, contexts, lang='ru') {
  if (!contexts?.length) return null;

  const strong = contexts[0]; // лучший кандидат
  const STRONG_SCORE = 0.32;  // порог уверенности "прямо из текста"
  if (!strong || strong.score < STRONG_SCORE) return null;

  const t = strong.text || '';
  const cit = [{ idx: 1, url: strong.url }];

  // Цена
  if (isPriceQuery(query)) {
    const p = extractPrice(t);
    if (p) {
      const reply = lang.startsWith('ru')
        ? `Тариф Basic стоит ${p}.`
        : `The Basic plan costs ${p}.`;
      return { reply, citations: cit };
    }
  }

  // Часы работы
  if (isHoursQuery(query)) {
    const h = extractHours(t);
    if (h) {
      const reply = lang.startsWith('ru')
        ? `Часы работы: ${h}.`
        : `Hours: ${h}.`;
      return { reply, citations: cit };
    }
  }

  // Возвраты
  if (isRefundQuery(query)) {
    const r = extractRefund(t);
    if (r) {
      const reply = lang.startsWith('ru')
        ? r
        : r; // текст уже из контекста
      return { reply, citations: cit };
    }
  }

  return null;
}
