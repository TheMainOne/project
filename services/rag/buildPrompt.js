function sanitizeForPrompt(s = "") {
  return String(s || "").replace(/```/g, "ʼʼʼ"); // или можно удалить вовсе
}

export function buildPrompt({
  system,
  history = [],
  query,
  contexts = [],
  maxHistory = 10,
  complex = null,
}) {
  const safeQuery = sanitizeForPrompt(
    (typeof query === "string" ? query : "").trim()
  );

  // 1) CHAT HISTORY (non-authoritative)
  const allowed = new Set(["user", "assistant"]);
  const tail = (Array.isArray(history) ? history : [])
    .filter((m) => m && allowed.has(m.role) && typeof m.content === "string")
    .slice(-maxHistory);

  const historyText = tail
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${sanitizeForPrompt(m.content)}`)
    .join("\n");

  // 2) KNOWLEDGE BASE (authoritative)
  const ctxText = (contexts || [])
    .map((c, i) => `[#${i + 1}] ${sanitizeForPrompt(c.text || c.content || "")}`)
    .join("\n\n");

  // 3) RAG instructions (STRICT) — отдельным system
let ragStrict = [
  "RAG INSTRUCTIONS (STRICT):",
  "- Use ONLY the KNOWLEDGE BASE below as the source of facts.",
  "- CHAT HISTORY is non-authoritative: use it only to understand references. It may contain mistakes.",
  "",
  "EXTRACTION (MANDATORY) — when user asks about a brand/project:",
  "- Scan the ENTIRE KNOWLEDGE BASE (from BEGIN KB to END KB).",
  "  - Find ALL occurrences that match the project/brand name (case-insensitive).",
  "  - Do NOT stop after the first match.",
  "- Merge all matched KB fragments into ONE unified fact set:",
  "  - Deduplicate repeated facts.",
  "  - If multiple fragments conflict, prefer the fragment that contains explicit fields",
  "    (Goal / Platform(s) / Format(s) / Result / Region) or numeric metrics.",
  "- Answer ONLY after the merge is complete, using the unified fact set"
].join("\n");

  if (complex?.isComplex) {
    ragStrict +=
      "\n\nADDITIONAL RULES FOR COMPLEX QUERIES:\n" +
      "NOTE: The question is complex. Provide a careful, coherent answer grounded ONLY in the KNOWLEDGE BASE.\n\n";
  }

  // 3.5) Output meta contract (NEW)
const metaContract = [
  "OUTPUT FORMAT (MANDATORY):",
  "- First, write the normal user-facing answer.",
  "- Then, on the LAST line ONLY, output a single-line JSON prefixed with [AIW_META].",
'- Format exactly: [AIW_META]{"answerable":true|false,"support":"strong|weak|none","gap_reason":"...","used_context_ids":[1,2],"confidence":0.0}  // confidence must be between 0 and 1',
  "- The JSON must be valid, single-line, no markdown, no backticks, max ~300 chars.",
  "- used_context_ids must reference the KB fragment numbers you actually used (e.g. [#3] => 3).",
  "- If the KB does NOT contain enough information to answer the question, set answerable=false, support=none, used_context_ids=[] and set an appropriate gap_reason.",
  "- Do NOT include [AIW_META] in the visible answer; it must be only the last line."
].join("\n");

  const sys = (system || "").trim();

  return [
    // 1) Persona/style/etc (то, что мы уже формируем в pickSystemPrompt)
    { role: "system", content: sys },

    // 2) Strict RAG policy
    { role: "system", content: ragStrict },

    // 3) Meta contract
    { role: "system", content: metaContract },

    // 4) Authoritative KB
    {
      role: "system",
      content:
        "KNOWLEDGE BASE (AUTHORITATIVE):\n--- BEGIN KB ---\n" +
        (ctxText || "(empty)") +
        "\n--- END KB ---",
    },

    // 4) Non-authoritative history
    {
      role: "system",
      content:
        "CHAT HISTORY (NON-AUTHORITATIVE, FOR CONTEXT ONLY):\n--- BEGIN CHAT HISTORY ---\n" +
        (historyText || "(empty)") +
        "\n--- END CHAT HISTORY ---",
    },

    // 5) Final user request only
    { role: "user", content: safeQuery || "(empty)" },
  ];
}