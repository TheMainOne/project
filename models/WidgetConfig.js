import mongoose from "mongoose";


// ПЕРЕД WidgetConfigSchema:
const InlineGreetingStepSchema = new mongoose.Schema(
  {
    text:    { type: String, required: true },
    delayMs: { type: Number, default: 0, min: 0 },  // задержка от предыдущего сообщения
  },
  { _id: false }
);

const InlineAutostartSchema = new mongoose.Schema(
  {
    enabled:         { type: Boolean, default: false },                     // включить сценарий
    mode:            { type: String, enum: ["always","session","cooldown"], default: "always" },
    cooldownMinutes: { type: Number, default: 0, min: 0 },                  // для mode = cooldown
    script:          { type: [InlineGreetingStepSchema], default: [] },     // массив шагов
  },
  { _id: false }
);

const LogoSchema = new mongoose.Schema(
  {
    s3Key:        { type: String, required: true },   // напр. "documents/uuid.png"
    url:          { type: String, required: true },   // публичный или presigned (если сохраняешь на лету)
    originalName: { type: String },
    contentType:  { type: String, default: "image/png" },
    size:         { type: Number },                   // байты
    uploadedAt:   { type: Date, default: Date.now },
    alt:          { type: String, default: "" },      // опционально для доступности
  },
  { _id: false }
);


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
logo:               { type: LogoSchema, default: null },
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

    inlineAutostart:        { type: InlineAutostartSchema, default: () => ({}) },
    stream:                 { type: Boolean, default: true },
    inputPlaceholder:      { type: String, default: "" },  // если пусто — используется дефолт по языку
    headerBackgroundColor: { type: String, default: null }, // если null — берём backgroundColor
headerTextColor:       { type: String, default: null }, // если null — берём textColor
assistantBubbleColor:      { type: String, default: null }, // фон пузыря бота
assistantBubbleTextColor:  { type: String, default: null },

userBubbleColor:           { type: String, default: null }, // фон пузыря пользователя
userBubbleTextColor:       { type: String, default: null },

bubbleBorderColor:         { type: String, default: null }, // если хочешь отдельно от borderColor
inputBackgroundColor:      { type: String, default: null },
inputTextColor:            { type: String, default: null },
inputBorderColor:          { type: String, default: null },

sendButtonBackgroundColor: { type: String, default: null },
sendButtonIconColor:       { type: String, default: null },
showAvatars:     { type: Boolean, default: true },
showTimestamps:  { type: Boolean, default: true },
fontFamily:        { type: String, default: "" },  // кастомный font-family
fontCssUrl:        { type: String, default: "" },  // ссылка на CSS (Google Fonts / свой)
fontFileUrl:       { type: String, default: "" },  // прямая ссылка на woff2/woff с S3



  // ===== LLM / системный промпт =====
  customSystemPrompt:     { type: String, default: "" },

  // ===== флаги/метаданные =====
  isActive:   { type: Boolean, default: true },
  version:    { type: Number,   default: 1 },
}, { timestamps: true });

// уникальная связка владельца + сайта
WidgetConfigSchema.index({ clientId: 1, siteId: 1 }, { unique: true });

export default mongoose.model("WidgetConfig", WidgetConfigSchema);
