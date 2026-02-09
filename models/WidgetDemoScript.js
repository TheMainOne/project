import mongoose from "mongoose";

const WidgetDemoMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, required: true, trim: true },
    typingMs: { type: Number, default: 800, min: 0 },
    delayAfterMs: { type: Number, default: 1200, min: 0 },
  },
  { _id: false }
);

const WidgetDemoScriptSchema = new mongoose.Schema(
  {
    siteId: { type: String, required: true, trim: true, index: true },
    enabled: { type: Boolean, default: false },
    lang: { type: String, default: "en", trim: true, lowercase: true },
    loop: { type: Boolean, default: true },
    startDelayMs: { type: Number, default: 1200, min: 0 },
    messages: { type: [WidgetDemoMessageSchema], default: [] },
  },
  { timestamps: true, versionKey: false }
);

WidgetDemoScriptSchema.index({ siteId: 1 }, { unique: true });

export default mongoose.model("WidgetDemoScript", WidgetDemoScriptSchema);
