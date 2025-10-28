import mongoose from "mongoose";

const AiwGapSchema = new mongoose.Schema({
  siteId: { type: String, index: true },
  sessionId: { type: String, index: true },
  question: { type: String, required: true, index: "text" },
  answerPreview: { type: String, maxlength: 1500 },
  phase: { type: String },                 // "no-context" | "rag" | "rag-extractive" | ...
  citations: [String],                     // urls
  judge: {
    goodAnswer: Boolean,
    confidence: Number,
    reason: String
  }
}, { timestamps: true, versionKey: false  });

AiwGapSchema.index({ siteId: 1, createdAt: -1 });

export default mongoose.model("AiwGap", AiwGapSchema);
