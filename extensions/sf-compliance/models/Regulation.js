import mongoose from "mongoose";

const RegulationSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true, trim: true },
    jurisdiction: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    aliases: { type: [String], default: [] },
    requiredEvidenceTypes: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false }
);

RegulationSchema.index({ code: 1 }, { unique: true });
RegulationSchema.index({ jurisdiction: 1, title: 1 });

export default mongoose.model("Regulation", RegulationSchema);