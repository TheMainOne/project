import mongoose from "mongoose";

const RequirementMatchSchema = new mongoose.Schema(
  {
    requirementId: String,
    type: String,
    value: String,
    details: String,
    status: {
      type: String,
      enum: ["covered", "missing", "expired", "needs-review"],
      required: true,
    },
    evidenceRefs: [{ type: mongoose.Schema.Types.ObjectId, ref: "SupplierEvidence" }],
    explainability: {
      matchedFields: [String],
      regulationVersionUsed: String,
      reason: String,
    },
  },
  { _id: false }
);

const ComplianceCaseReportSchema = new mongoose.Schema(
  {
    sfCaseId: { type: String, unique: true, index: true },
    caseData: { type: mongoose.Schema.Types.Mixed, default: {} },
    attachments: { type: [mongoose.Schema.Types.Mixed], default: [] },
    extracted: {
      requestedMaterials: [String],
      jurisdictions: [String],
      regulationMentions: [{ type: mongoose.Schema.Types.Mixed }],
      requirements: [{ type: mongoose.Schema.Types.Mixed }],
    },
    matches: [RequirementMatchSchema],
    analyzedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.models.ComplianceCaseReport ||
  mongoose.model("ComplianceCaseReport", ComplianceCaseReportSchema);
