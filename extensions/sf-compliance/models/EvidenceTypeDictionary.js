import mongoose from "mongoose";

const EvidenceTypeDictionarySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

EvidenceTypeDictionarySchema.index({ code: 1 }, { unique: true });

export default mongoose.model("EvidenceTypeDictionary", EvidenceTypeDictionarySchema);