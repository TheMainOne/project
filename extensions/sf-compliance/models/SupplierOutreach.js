import mongoose from "mongoose";

const SupplierOutreachSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    supplierName: { type: String, required: true, trim: true },
    caseId: { type: String, default: null, trim: true, index: true },
    contactEmail: { type: String, default: "", trim: true },
    subject: { type: String, required: true, trim: true },
    method: {
      type: String,
      enum: ["email", "phone", "meeting", "portal", "other"],
      default: "email",
    },
    sentAt: { type: Date, required: true, default: Date.now },
    nextFollowUpAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["sent", "awaiting", "responded", "overdue", "closed"],
      default: "sent",
      index: true,
    },
    respondedAt: { type: Date, default: null },
    notes: { type: String, default: "", trim: true },
    createdBy: { type: String, required: true, trim: true },
    regulationTags: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false }
);

SupplierOutreachSchema.index({ supplierId: 1, sentAt: -1 });
SupplierOutreachSchema.index({ status: 1, nextFollowUpAt: 1 });

export default mongoose.model("SupplierOutreach", SupplierOutreachSchema);
