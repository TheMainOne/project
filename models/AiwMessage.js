import mongoose from "mongoose";

const AiwMessageSchema = new mongoose.Schema({
  siteId: { type: String, index: true, required: true },
  sessionId: { type: String, index: true, required: true },

  role: { type: String, enum: ["user", "assistant", "system"], index: true },
  content: { type: String, required: true },

  latencyMs: Number,
  promptTokens: Number,
  completionTokens: Number,

  topic: { type: String, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true, versionKey: false });

AiwMessageSchema.index({ sessionId: 1, createdAt: 1 });
AiwMessageSchema.index({ content: "text" });

export default mongoose.model("AiwMessage", AiwMessageSchema);
