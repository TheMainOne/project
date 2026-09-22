import reviewSupplierResponseService from "../services/reviewSupplierResponse.js";

export async function reviewSupplierResponse(req, res) {
  try {
    const {
      schema_version = "1.0",
      subject_id,
      supplier = "",
      contact_name = "",
      items,
      request_type,
      request_details = "",
      site = "",
      email_from = "",
      email_subject = "",
      email_received_at = null,
      email_body,
    } = req.body || {};

    if (!subject_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_SUBJECT_ID",
          message: "subject_id is required",
        },
      });
    }

    if (!request_type) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_REQUEST_TYPE",
          message: "request_type is required",
        },
      });
    }

    if (!items) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_ITEMS",
          message: "items is required",
        },
      });
    }

    if (!email_body) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_EMAIL_BODY",
          message: "email_body is required",
        },
      });
    }

    const result = await reviewSupplierResponseService({
      schemaVersion: schema_version,
      subjectId: String(subject_id),
      supplier: String(supplier),
      contactName: String(contact_name),
      items: String(items),
      requestType: String(request_type),
      requestDetails: String(request_details),
      site: String(site),
      emailFrom: String(email_from),
      emailSubject: String(email_subject),
      emailReceivedAt: email_received_at,
      emailBody: String(email_body),
    });

    return res.status(200).json({
      success: true,
      subject_id,
      review: result.review,
      meta: {
        model: result.model,
        attachments_received: 0,
        attachments_reviewed: 0,
      },
    });
  } catch (error) {
    console.error("[SUPPLIER REVIEW] failed:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "SUPPLIER_REVIEW_FAILED",
        message: error?.message || "Supplier review failed",
      },
    });
  }
}