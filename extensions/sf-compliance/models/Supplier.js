import mongoose from "mongoose";

const SupplierSchema = new mongoose.Schema(
  {
    supplierCode: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, required: true, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false }
);

SupplierSchema.index({ supplierCode: 1 }, { unique: true });

export default mongoose.model("Supplier", SupplierSchema);
