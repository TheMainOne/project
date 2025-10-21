import crypto from "crypto";

export function hashIp(ip, ua, siteId) {
  try {
    return crypto.createHash("sha256")
      .update(String(ip || ""))
      .update("|")
      .update(String(ua || ""))
      .update("|")
      .update(String(siteId || ""))
      .digest("hex");
  } catch { return undefined; }
}

const TOPIC_RULES = [
  { key: "pricing",     rx: /\b(price|pricing|стоим|тариф|cost|цена|цены)\b/i },
  { key: "demo",        rx: /\b(demo|демо|показ|записать|book a demo)\b/i },
  { key: "support",     rx: /\b(support|поддержк|hours|часы)\b/i },
  { key: "features",    rx: /\b(feature|возможност|функционал|что умеет)\b/i },
  { key: "compliance",  rx: /\b(reach|rohs|pfas|tsca|loa|nda|регулятор)\b/i },
  { key: "technical",   rx: /\b(api|sdk|widget|внедрени|интеграци|sso|webhook)\b/i },
  { key: "sales",       rx: /\b(купить|заказать|invoice|bill|оплат)\b/i },
];

export function classifyTopics(text) {
  if (!text) return [];
  return TOPIC_RULES.filter(r => r.rx.test(text)).map(r => r.key);
}
