function readSalesforceCaseFromDom() {
  const caseIdNode =
    document.querySelector('[data-target-selection-name="sfdc:RecordField.Case.CaseNumber"]') ||
    document.querySelector('[field-label="Case Number"] lightning-formatted-text') ||
    document.querySelector('span[title^="000"]');

  const subjectNode =
    document.querySelector('[data-target-selection-name="sfdc:RecordField.Case.Subject"]') ||
    document.querySelector('[field-label="Subject"] lightning-formatted-text');

  const descriptionNode =
    document.querySelector('[data-target-selection-name="sfdc:RecordField.Case.Description"]') ||
    document.querySelector('[field-label="Description"] lightning-formatted-rich-text');

  return {
    caseId: caseIdNode?.textContent?.trim() || null,
    subject: subjectNode?.textContent?.trim() || null,
    description: descriptionNode?.textContent?.trim() || null,
    href: window.location.href,
    title: document.title,
    capturedAt: new Date().toISOString(),
  };
}

const payload = readSalesforceCaseFromDom();
chrome.runtime.sendMessage({ type: "SF_CASE_CONTEXT", payload });
