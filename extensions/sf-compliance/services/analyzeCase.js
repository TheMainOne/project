import OpenAI from "openai";
import { REGULATION_DICTIONARY, findRegulationsInText } from "../config/regulationDictionary.js";
import { buildCaseExtractionPrompt } from "../prompts/caseExtractionPrompt.js";

const oai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function fallbackExtract(caseData = {}, attachments = []) {
  const text = [
    caseData.Subject,
    caseData.Description,
    ...(attachments || []).map((a) => `${a.title || ""} ${a.fileType || ""}`),
  ]
    .filter(Boolean)
    .join("\n");

  const regulations = findRegulationsInText(text).map((reg) => ({
    key: reg.key,
    name: reg.canonicalName,
    version: reg.latestVersion,
    sourceText: text.slice(0, 280),
  }));

  const jurisdictions = [];
  if (/\beu\b|european union/i.test(text)) jurisdictions.push("EU");
  if (/\bus\b|usa|united states|california/i.test(text)) jurisdictions.push("US");

  const requestedMaterials = [];
  const materialMatches = text.match(/\b(plastic|steel|alloy|packaging|battery|textile|polymer)s?\b/gi) || [];
  for (const material of materialMatches) {
    if (!requestedMaterials.includes(material.toLowerCase())) requestedMaterials.push(material.toLowerCase());
  }

  const requirements = [
    ...requestedMaterials.map((value, idx) => ({ id: `MAT-${idx + 1}`, type: "material", value, details: null })),
    ...jurisdictions.map((value, idx) => ({ id: `JUR-${idx + 1}`, type: "jurisdiction", value, details: null })),
    ...regulations.map((value, idx) => ({
      id: `REG-${idx + 1}`,
      type: "regulation",
      value: value.key,
      details: value.version,
    })),
  ];

  return { requestedMaterials, jurisdictions, regulationMentions: regulations, requirements };
}

export default async function analyzeCase({ caseData, attachments }) {
  if (!oai) return fallbackExtract(caseData, attachments);

  const prompt = buildCaseExtractionPrompt({
    caseData,
    attachments,
    regulationDictionary: REGULATION_DICTIONARY,
  });

  try {
    const completion = await oai.chat.completions.create({
      model: process.env.OPENAI_COMPLIANCE_MODEL || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 1200,
    });

    const raw = completion.choices?.[0]?.message?.content;
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed) throw new Error("Empty extraction result");

    return {
      requestedMaterials: parsed.requestedMaterials || [],
      jurisdictions: parsed.jurisdictions || [],
      regulationMentions: parsed.regulationMentions || [],
      requirements: parsed.requirements || [],
    };
  } catch {
    return fallbackExtract(caseData, attachments);
  }
}
