import mongoose from "mongoose";

const EcnSheetProfileSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, unique: true, index: true },
    version: { type: String, required: true },
    headerFingerprint: { type: String, required: true },
    expectedHeaders: { type: [String], default: [] },
    headerOrder: { type: [String], required: true },
    bindings: { type: Map, of: String, default: {} },
    aliases: { type: Map, of: [String], default: {} },
    primaryKeys: { type: [String], default: [] },
    statusAliases: { type: Map, of: String, default: {} },
    confirmed: { type: Boolean, default: false },
    locale: { type: String, enum: ["en", "ru"], default: "en" },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.models.EcnSheetProfile ||
  mongoose.model("EcnSheetProfile", EcnSheetProfileSchema);
