import OpenAI from "openai";
import { buildSupplierReviewPrompt } from "../prompts/supplierReviewPrompt.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL =
  process.env.OPENAI_SUPPLIER_REVIEW_MODEL || "gpt-5.6-sol";

const reviewSchema = {
  type: "object",
  additionalProperties: false,

  properties: {
    request_satisfied: {
      type: "boolean",
    },

    category: {
      type: "string",
      enum: [
        "Complete",
        "Partial",
        "Documents Received - Review Required",
        "Supplier Investigating",
        "Information Unavailable",
        "Clarification Required",
        "Discontinued",
        "Other",
      ],
    },

    summary: {
      type: "string",
    },

    missing_information: {
      type: "string",
    },

    next_action: {
      type: "string",
    },

    suggested_reply: {
      type: "string",
    },

    needs_human_review: {
      type: "boolean",
    },
  },

  required: [
    "request_satisfied",
    "category",
    "summary",
    "missing_information",
    "next_action",
    "suggested_reply",
    "needs_human_review",
  ],
};

export default async function reviewSupplierResponse(payload) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const prompt = buildSupplierReviewPrompt(payload);

  const response = await client.responses.create({
    model: MODEL,

    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You are a conservative regulatory compliance review assistant. " +
              "Never infer compliance beyond the supplied evidence. " +
              "Return the requested structured result only.",
          },
        ],
      },

      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt,
          },
        ],
      },
    ],

    text: {
      format: {
        type: "json_schema",
        name: "supplier_compliance_review",
        strict: true,
        schema: reviewSchema,
      },
    },
  });

  if (!response.output_text) {
    throw new Error("OpenAI returned an empty supplier review");
  }

  const review = JSON.parse(response.output_text);

  return {
    model: MODEL,
    review,
  };
}