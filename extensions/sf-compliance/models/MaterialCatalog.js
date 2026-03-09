import mongoose from "mongoose";

const MaterialCatalogSchema = new mongoose.Schema(
  {
    materialCode: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    synonyms: { type: [String], default: [] },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

MaterialCatalogSchema.index({ materialCode: 1 }, { unique: true });
MaterialCatalogSchema.index({ supplierId: 1, name: 1 });

export default mongoose.model("MaterialCatalog", MaterialCatalogSchema);