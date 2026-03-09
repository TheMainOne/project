import mongoose from "mongoose";

const SupplierEvidenceSchema = new mongoose.Schema(
  {
    supplierId: { type: String, index: true },
    material: { type: String, index: true },
    jurisdiction: { type: String, index: true },
    regulationKey: { type: String, index: true },
    regulationName: { type: String },
    regulationVersion: { type: String },
    documentType: { type: String },
    documentName: { type: String },
    sourceUrl: { type: String },
    validFrom: { type: Date },
    validUntil: { type: Date, index: true },
    status: {
      type: String,
      enum: ["active", "expired", "superseded"],
      default: "active",
      index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false }
);

SupplierEvidenceSchema.index({ supplierId: 1, regulationKey: 1, material: 1 });

export default mongoose.models.SupplierEvidence ||
  mongoose.model("SupplierEvidence", SupplierEvidenceSchema);
