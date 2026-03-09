import mongoose from "mongoose";

const ComplianceCaseSchema = new mongoose.Schema(
  {
    sfCaseId: { type: String, required: true, index: true, trim: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    requestedMaterials: { type: [String], default: [] },
    detectedRegulations: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["new", "in_progress", "pending_supplier", "resolved", "closed"],
      default: "new",
      index: true,
    },
    assignee: { type: String, default: null, trim: true },
  },
  { timestamps: true, versionKey: false }
);

ComplianceCaseSchema.index({ sfCaseId: 1 }, { unique: true });
ComplianceCaseSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("ComplianceCase", ComplianceCaseSchema);