export function buildCaseExtractionPrompt({ caseData, attachments, regulationDictionary }) {
  const dictionary = regulationDictionary
    .map(
      (item) =>
        `- ${item.canonicalName} (key: ${item.key}, aliases: ${item.aliases.join(", ")}, latestVersion: ${item.latestVersion})`
    )
    .join("\n");

  return [
    "You are a compliance analyst assistant specialized in supplier evidence checks.",
    "Extract ONLY from provided Salesforce case data and attachment metadata.",
    "Return strict JSON with these fields:",
    '{ "requestedMaterials": string[], "jurisdictions": string[], "regulationMentions": [{"key": string, "name": string, "version": string|null, "sourceText": string}], "requirements": [{"id": string, "type": "material|jurisdiction|regulation|document", "value": string, "details": string|null}] }',
    "Do not output markdown.",
    "Regulation dictionary:",
    dictionary,
    "Salesforce case:",
    JSON.stringify(caseData, null, 2),
    "Attachments:",
    JSON.stringify(attachments, null, 2),
  ].join("\n\n");
}
