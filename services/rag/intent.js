// services/rag/intent.js

/**
 * Классификация запроса в терминах chunkType:
 * "contacts" | "services" | "case_study" | "pricing" | "about" | "other"
 */
export function classifyRagIntent(query = "", lang = "ru") {
  const q = (query || "").toLowerCase();

  const types = new Set();

  // --- contacts ---
  if (
    /email|e-mail|mail|почт[аи]|контакт|contact|support|телефон|phone|whatsapp|telegram|как с вами связаться|how can i contact/.test(
      q
    )
  ) {
    types.add("contacts");
  }

  // --- services ---
  if (
    /услуг[аи]|что вы делаете|чем занимаетесь|что вы предлагаете|services?|service|what do you do|what does your agency do|campaigns you run|influencer marketing|performance marketing/.test(
      q
    )
  ) {
    types.add("services");
  }

  // --- case_study / примеры кампаний ---
  if (
    /кейс|кейсы|примеры кампаний|пример кампании|пример кейса|examples?|use cases?|use case|case studies?|success stories?|портфолио|portfolio/.test(
      q
    )
  ) {
    types.add("case_study");
  }

  // --- pricing ---
  if (
    /цена|стоимост|сколько стоит|прайс|тариф|rate|pricing|cost|budget|сколько будет стоить|сколько это стоит|cpm|cpa/.test(
      q
    )
  ) {
    types.add("pricing");
  }

  // --- about (о компании, где вы, локация) ---
  if (
    /о компании|кто вы|about (you|company)|who are you|where are you located|где вы находитесь|офис|office|location|address|адрес/.test(
      q
    )
  ) {
    types.add("about");
  }

  // если ничего не нашли → other
  if (!types.size) types.add("other");

  const intentTypes = Array.from(types);
  const primary = intentTypes[0] || "other";

  return {
    intentTypes,
    intentLabel: primary,
  };
}
