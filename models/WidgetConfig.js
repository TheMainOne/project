import mongoose from "mongoose";

const WidgetConfigSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", index: true },
  siteId:   { type: String, index: true }, // например, "zorka.agency" или "zorka.agency::default"

  // ===== UI =====
  widgetTitle:        { type: String, default: "AI Assistant" },
  welcomeMessage:     { type: String, default: "Hi! How can I help you today?" },
  primaryColor:       { type: String, default: "#6D28D9" },   // совпадает с loader accent дефолтом
  borderColor:        { type: String, default: null },         // если null — loader возьмёт primaryColor
  backgroundColor:    { type: String, default: "#0f0f0f" },
  textColor:          { type: String, default: "#ffffff" },
  logoUrl:            { type: String, default: null },

  // необязательные, но удобные:
  lang:               { type: String, default: "en" },         // "en" | "ru" | ...
  position:           { type: String, enum: ["br","bl"], default: "br" },

  // ===== Поведение (авто-привет, история и т.п.) =====
  autostart:              { type: Boolean, default: false },
  autostartDelay:         { type: Number,  default: 5000, min: 0 },
  autostartMode:          { type: String,  enum: ["local","ai"], default: "local" },
  autostartMessage:       { type: String,  default: "" },        // используется когда mode = "local"
  autostartPrompt:        { type: String,  default: "" },        // используется когда mode = "ai"
  autostartCooldownHours: { type: Number,  default: 12, min: 0 },

  preserveHistory:        { type: Boolean, default: true },      // хранить историю диалога в localStorage
  resetHistoryOnOpen:     { type: Boolean, default: false },     // чистить историю при каждом открытии

  // ===== LLM / системный промпт =====
  customSystemPrompt:     { type: String, default: "" },

  // ===== флаги/метаданные =====
  isActive:   { type: Boolean, default: true },
  version:    { type: Number,   default: 1 },
}, { timestamps: true });

// уникальная связка владельца + сайта
WidgetConfigSchema.index({ clientId: 1, siteId: 1 }, { unique: true });

export default mongoose.model("WidgetConfig", WidgetConfigSchema);
