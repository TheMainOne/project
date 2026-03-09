import mongoose from "mongoose";

const SupplierEvidenceSchema = new mongoose.Schema(
  {
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", index: true },
    supplierCode: { type: String, index: true },
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: "MaterialCatalog", index: true },
    materialCode: { type: String, index: true },
    jurisdiction: { type: String, index: true },
    regulation: { type: String, index: true },
    regulationVersion: { type: String },
    evidenceType: { type: String, index: true },
    evidenceId: { type: String, index: true },
    documentName: { type: String },
    sourceUrl: { type: String },
    validFrom: { type: Date },
    validTo: { type: Date, index: true },
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

SupplierEvidenceSchema.index({ supplierCode: 1, regulation: 1, evidenceType: 1, evidenceId: 1 }, { unique: true });
SupplierEvidenceSchema.index({ materialCode: 1, regulation: 1 });

export default mongoose.models.SupplierEvidence ||
  mongoose.model("SupplierEvidence", SupplierEvidenceSchema);
