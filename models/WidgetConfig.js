import mongoose from "mongoose";

const WidgetConfigSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", index: true },
  siteId:   { type: String, index: true },     // например, "zorka.agency" или "zorka.agency::default"
  widgetTitle:        { type: String, default: "AI Assistant" },
  welcomeMessage:     { type: String, default: "Hi! How can I help you today?" },
  primaryColor:       { type: String, default: "#3B82F6" },
  borderColor:        { type: String, default: "#374151" },
  backgroundColor:    { type: String, default: "#000000" },
  textColor:          { type: String, default: "#E5E7EB" },
  customSystemPrompt: { type: String, default: "" }, // ← главный герой
  logoUrl:            { type: String, default: null },

  // флаги/метаданные
  isActive:   { type: Boolean, default: true },
  version:    { type: Number, default: 1 },
}, { timestamps: true });

WidgetConfigSchema.index({ clientId: 1, siteId: 1 }, { unique: true });

export default mongoose.model("WidgetConfig", WidgetConfigSchema);
