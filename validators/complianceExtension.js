function sanitizeString(value, maxLength) {
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  return cleaned.slice(0, maxLength);
}

function sanitizeIsoDate(value) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function validateCaseContextBody(body = {}) {
  const caseId = sanitizeString(body.caseId, 100);

  const context = body.context && typeof body.context === "object"
    ? {
        recordId: sanitizeString(body.context.recordId, 100),
        caseId: sanitizeString(body.context.caseId, 100),
        subject: sanitizeString(body.context.subject, 500),
        description: sanitizeString(body.context.description, 4000),
        href: sanitizeString(body.context.href, 1000),
        title: sanitizeString(body.context.title, 300),
        capturedAt: sanitizeIsoDate(body.context.capturedAt),
      }
    : null;

  if (!caseId) {
    return { ok: false, error: "caseId is required" };
  }

  return {
    ok: true,
    value: {
      caseId,
      context,
    },
  };
}

export function validateAnalyzeBody(body = {}) {
  const caseId = sanitizeString(body.caseId, 100);

  const payload = body.payload && typeof body.payload === "object"
    ? {
        recordId: sanitizeString(body.payload.recordId, 100),
        caseId: sanitizeString(body.payload.caseId, 100),
        subject: sanitizeString(body.payload.subject, 500),
        description: sanitizeString(body.payload.description, 4000),
        href: sanitizeString(body.payload.href, 1000),
        title: sanitizeString(body.payload.title, 300),
        capturedAt: sanitizeIsoDate(body.payload.capturedAt),
      }
    : null;

  if (!caseId) {
    return { ok: false, error: "caseId is required" };
  }

  return {
    ok: true,
    value: {
      caseId,
      payload,
    },
  };
}