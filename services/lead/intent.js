function simpleHeuristicIntent(text = "") {
  const t = text.toLowerCase();
  const strongPatterns = [
    /цена|стоимость|купить|заказать|оформить|оставить заявку|связаться/i,
    /price|cost|buy|order|contact|talk to sales|schedule a call/i,
    /demo|дему|пробн/i,
  ];
  const softPatterns = [/интерес/i, /learn more/i];

  if (strongPatterns.some((rx) => rx.test(t))) return { leadIntent: "strong", confidence: 0.55 };
  if (softPatterns.some((rx) => rx.test(t))) return { leadIntent: "soft", confidence: 0.4 };
  return { leadIntent: "none", confidence: 0 };
}

export async function detectLeadIntent({ oai, messages = [], lang = "ru" }) {
  const joined = messages
    .filter((m) => m?.content)
    .map((m) => m.content)
    .join("\n\n");
  const heuristic = simpleHeuristicIntent(joined);

  if (!oai) return heuristic;

  try {
    const completion = await oai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a classifier that detects buying intent in a chat. Return JSON with lead_intent ('none'|'soft'|'strong') and confidence (0..1). Respond with JSON only.",
        },
        {
          role: "user",
          content: `Conversation messages (latest last):\n${joined}\n\nUI language: ${lang}. Answer in JSON only.`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 120,
      temperature: 0,
    });

    const raw = completion.choices?.[0]?.message?.content;
    const parsed = raw ? JSON.parse(raw) : null;
    const leadIntent = parsed?.lead_intent || parsed?.leadIntent || heuristic.leadIntent;
    const confidence = typeof parsed?.confidence === "number" ? parsed.confidence : heuristic.confidence;
    return { leadIntent, confidence };
  } catch {
    return heuristic;
  }
}