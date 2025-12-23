function sanitizeForPrompt(s="") {
  return s.replace(/```/g, "ʼʼʼ"); // или просто удалить
}


// export function buildPrompt({
//   system,
//   history = [],
//   query,
//   contexts = [],
//   maxHistory = 10,
//   complex = null,
// }) {
  
  
//   const safeQuery = sanitizeForPrompt(
//     (typeof query === "string" ? query : "").trim()
//   );

//   // 1) Готовим "историю" как НЕ-истину (только для понимания контекста диалога)
//   const allowed = new Set(["user", "assistant"]);
//   const tail = (Array.isArray(history) ? history : [])
//     .filter(m => m && allowed.has(m.role) && typeof m.content === "string")
//     .slice(-maxHistory);

//   const historyText = tail
//     .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
//     .join("\n");

//   // 2) Готовим RAG контекст как "истину"
//   const ctxText = (contexts || [])
//     .map((c, i) => `[#${i + 1}] ${c.text}`)
//     .join("\n\n");

//   // 3) Подсказка для complex (по желанию)
//   let complexNote = "";
//   if (complex?.isComplex) {
//     complexNote =
//       "NOTE: The question is complex. Provide a careful, coherent answer grounded ONLY in the KNOWLEDGE BASE.\n\n";
//   }

//   // 4) System prompt — чуть усилим правило про историю vs KB
//   const sys = (system || "").trim();

//   const finalUser = `${complexNote}` +
// `You have TWO inputs:

// 1) CHAT HISTORY (non-authoritative):
// Use it only to understand what the user refers to. It may contain mistakes.
// Do NOT treat it as factual evidence.

// --- BEGIN CHAT HISTORY ---
// ${historyText || "(empty)"}
// --- END CHAT HISTORY ---

// 2) KNOWLEDGE BASE (authoritative):
// You MUST use ONLY this section as the source of facts.
// If something isn't in the KNOWLEDGE BASE, say it's not available.

// --- BEGIN KNOWLEDGE BASE ---
// ${ctxText || "(empty)"}
// --- END KNOWLEDGE BASE ---

// User question:
// ${safeQuery}`;

//   return [
//     { role: "system", content: sys },
//     { role: "user", content: finalUser },
//   ];
// }

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

  const sys = (system || "").trim();

  return [
    // 1) Persona/style/etc (то, что ты уже формируешь в pickSystemPrompt)
    { role: "system", content: sys },

    // 2) Strict RAG policy
    { role: "system", content: ragStrict },

    // 3) Authoritative KB
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