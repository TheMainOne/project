import mongoose from "mongoose";

const MaterialCatalogSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, default: "", trim: true },
    synonyms: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false }
);

MaterialCatalogSchema.index({ code: 1 }, { unique: true });

export default mongoose.model("MaterialCatalog", MaterialCatalogSchema);