import Anthropic from "@anthropic-ai/sdk";

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const SYSTEM_PROMPT = `You are a compliance document analyst specialising in EU/US chemical and product regulations.

Extract every compliance assertion from the supplier document provided. For each regulation found, return:
- regulationCode: short canonical code (e.g. "REACH", "ROHS", "PFAS", "PROP65", "TSCA", "WEEE", "POPs", "SCIP")
- regulationName: human-readable name
- assertionType: one of "compliant" | "free_from" | "contains" | "non_compliant" | "partial" | "informational"
  · compliant   = explicitly states compliance
  · free_from   = states substance/group is absent / not present
  · contains    = discloses presence of a substance
  · non_compliant = explicitly states non-compliance
  · partial     = compliant for some items/materials only
  · informational = provides data without an explicit compliance claim
- coverageLevel: one of "supplier_all" | "supplier_partial" | "item_single" | "item_list" | "material_family" | "component_family"
  · supplier_all   = applies to the entire supplier portfolio
  · supplier_partial = applies to a defined subset
  · item_single/item_list = applies to specific part/item numbers
  · material_family/component_family = applies to a material or component category
- scope: { allSupplierItems: bool, dwkItemNumbers: string[], supplierPartNumbers: string[], families: string[], countries: string[], notes: string }
- statementText: the exact sentence or clause from the document that supports this assertion (max 300 chars)
- confidence: always "ai_extracted"

For documentInfo extract:
- title: document title if identifiable, otherwise null
- issueDate: ISO 8601 date string or null
- validUntil: ISO 8601 date string or null
- documentType: one of "declaration" | "certificate" | "sds" | "tds" | "test_report" | "comprehensive_statement" | "other"

Return ONLY valid JSON matching this schema — no prose before or after:
{
  "documentInfo": { "title": null, "issueDate": null, "validUntil": null, "documentType": "declaration" },
  "assertions": [
    {
      "regulationCode": "REACH",
      "regulationName": "EU REACH Regulation (EC) No 1907/2006",
      "assertionType": "compliant",
      "coverageLevel": "supplier_all",
      "scope": { "allSupplierItems": true, "dwkItemNumbers": [], "supplierPartNumbers": [], "families": [], "countries": [], "notes": "" },
      "statementText": "...",
      "confidence": "ai_extracted"
    }
  ]
}`;

export async function parseSupplierDocument({ documentText, documentTitle, regulations = [] }) {
  if (!client) {
    throw new Error("ANTHROPIC_API_KEY is not configured — cannot parse documents");
  }

  const regContext =
    regulations.length > 0
      ? `\nKnown regulations in this compliance system (match against these when possible):\n${regulations
          .map((r) => `  ${r.code}: ${r.name}`)
          .join("\n")}`
      : "";

  const userMessage = `Parse the following compliance document and return JSON as specified.

Document title: ${documentTitle || "Not provided"}${regContext}

--- DOCUMENT START ---
${documentText.slice(0, 12000)}
--- DOCUMENT END ---`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text : "";

  // Extract JSON block (Claude sometimes wraps in ```json fences)
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new Error("No JSON found in Claude response");

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse Claude response as JSON: ${e.message}`);
  }

  if (!parsed.documentInfo || !Array.isArray(parsed.assertions)) {
    throw new Error("Claude response missing required fields (documentInfo, assertions)");
  }

  return parsed;
}
