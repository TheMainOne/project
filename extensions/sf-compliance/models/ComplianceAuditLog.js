import mongoose from "mongoose";

const ComplianceAuditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: { type: String, required: true, index: true },
    caseId: { type: String, default: null, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    outcome: { type: String, enum: ["success", "error", "denied"], required: true },
  },
  { versionKey: false }
);

ComplianceAuditLogSchema.index({ user: 1, timestamp: -1 });

export default mongoose.model("ComplianceAuditLog", ComplianceAuditLogSchema);
