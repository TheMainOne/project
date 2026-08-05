import mongoose from "mongoose";

const EcnAuditLogSchema = new mongoose.Schema(
  {
    analysisId: { type: String, index: true },
    user: { type: String, required: true, index: true },
    action: {
      type: String,
      enum: ["bootstrap.read", "sheet-profile.update", "row.analyze"],
      required: true,
    },
    rowHash: { type: String, default: null },
    profileVersion: { type: String, default: null },
    ruleSetVersion: { type: String, default: null },
    outcome: { type: String, enum: ["success", "validation_error", "error"], required: true },
    resultSummary: { type: mongoose.Schema.Types.Mixed, default: {} },
    model: { type: String, default: null },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

EcnAuditLogSchema.index({ user: 1, timestamp: -1 });

export default mongoose.models.EcnAuditLog ||
  mongoose.model("EcnAuditLog", EcnAuditLogSchema);
