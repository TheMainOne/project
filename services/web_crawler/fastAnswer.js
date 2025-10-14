// services/web_crawler/fastAnswer.js
import { isPriceQuery, isHoursQuery, isRefundQuery, extractPrice, extractHours, extractRefund } from './extractors.js';

/**
 * Пробуем ответить без LLM, если контекст "очевиден".
 * @param {string} query
 * @param {Array<{text:string,url:string,score:number}>} contexts
 * @param {string} lang
 * @returns {null | { reply: string, citations: Array<{idx:number,url:string}> }}
 */
// services/web_crawler/fastAnswer.js
const RU_PRICE_RULE = /(цены?|стоим|сколько|прайс|тариф)/i;
const RU_TOS_RULE   = /(условия|terms|политик|правил)/i;

export function tryFastAnswer(query, contexts, lang="ru") {
  const q = (query||"").toLowerCase();

  // 4.1 цены
  if (RU_PRICE_RULE.test(q) || /price|pricing|cost/i.test(q)) {
    const lines = [];
    const used = new Set();
    for (const c of contexts) {
      if (/pricing|tariff|тариф|price/i.test(c.url+c.text)) {
        // выдёргиваем числа/планы
        const mBasic = c.text.match(/Basic[^$]*(\$?\s*\d+[.,]?\d*)/i);
        if (mBasic && !used.has('basic')) { lines.push(`• Basic — ${mBasic[1]}`); used.add('basic'); }
        const mPro = c.text.match(/Pro[^$]*(\$?\s*\d+[.,]?\d*)/i);
        if (mPro && !used.has('pro')) { lines.push(`• Pro — ${mPro[1]}`); used.add('pro'); }
        const mEnt = c.text.match(/Enterprise[^$]*(\$?\s*\d+[.,]?\d*)?/i);
        if (mEnt && !used.has('ent')) {
          lines.push(`• Enterprise — ${mEnt[1]?.trim() || "по запросу"}`);
          used.add('ent');
        }
      }
    }
    if (lines.length) {
      const reply = (lang.startsWith('ru')
        ? `Тарифы:\n${lines.join('\n')}\n\nНужна демо или помощь с выбором?`
        : `Pricing:\n${lines.join('\n')}\n\nWant a quick demo?`);
      const citations = contexts.slice(0,2).map((c,i)=>({idx:i+1,url:c.url}));
      return { reply, citations };
    }
  }

  // 4.2 условия/политики (если в базе только «безопасность/SLA» — честно сказать)
  if (RU_TOS_RULE.test(q)) {
    const bits = [];
    for (const c of contexts) {
      if (/security|privacy|sla|безопасност|sso|лог/i.test(c.url+c.text)) {
        if (/шифрован/i.test(c.text)) bits.push('• Шифрование в транзите (HTTPS).');
        if (/30 дн/i.test(c.text) || /30 days/i.test(c.text)) bits.push('• Логи запросов хранятся 30 дней.');
        if (/SLA/i.test(c.text)) bits.push('• SLA (Enterprise): 99.9%/мес, приоритет инцидентов.');
      }
    }
    if (bits.length) {
      const reply = (lang.startsWith('ru')
        ? `${bits.join('\n')}\n\nПолного текста «условий использования» в базе нет.`
        : `${bits.join('\n')}\n\nFull ToS text isn’t in the KB.`);
      const citations = contexts.slice(0,2).map((c,i)=>({idx:i+1,url:c.url}));
      return { reply, citations };
    }
  }

  return null;
}

