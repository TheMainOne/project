import mongoose from "mongoose";

const LeadStepSchema = new mongoose.Schema({
  id:       { type: String, required: true },           
  type:     { type: String, enum: ["text", "email", "phone", "select", "textarea"], default: "text" },
  required: { type: Boolean, default: true },
  label: {
    en: { type: String, required: true },
    ru: { type: String },
  },
  placeholder: {
    en: { type: String },
    ru: { type: String },
  },
  // для select
  options: [{
    value: { type: String },
    label: {
      en: { type: String },
      ru: { type: String },
    },
  }],
}, { _id: false });

const LeadTriggersSchema = new mongoose.Schema({
  llm: {
    enabled:          { type: Boolean, default: true },
    strongThreshold:  { type: Number, default: 0.75 },
  },
  afterN: {
    enabled:             { type: Boolean, default: true },
    minUserMessages:     { type: Number, default: 6 },
    cooldownMinutes:     { type: Number, default: 60 },
    maxPromptsPerSession:{ type: Number, default: 1 },
  },
}, { _id: false });

const LeadCaptureSchema = new mongoose.Schema({
  enabled:  { type: Boolean, default: false },
  steps:    { type: [LeadStepSchema], default: [] },
  triggers: { type: LeadTriggersSchema, default: () => ({}) },
}, { _id: false });

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

const NotificationLimitsSchema = new mongoose.Schema(
  {
    globalCooldownMs: { type: Number, default: 8000, min: 0 },
    maxPerSession:    { type: Number, default: 3, min: 0 },
  },
  { _id: false }
);

const NotificationRuleSchema = new mongoose.Schema(
  {
    id:               { type: String, default: "" },
    event:            { type: String, required: true },
    section:          { type: String, default: "" },
    tab:              { type: String, default: "" },
    path:             { type: String, default: "" },
    minDurationMs:    { type: Number, default: 0, min: 0 },
    minScrollDepth:   { type: Number, default: 0, min: 0 },
    minVisibleMs:     { type: Number, default: 0, min: 0 },
    once:             { type: Boolean, default: true },
    cooldownMs:       { type: Number, default: 45000, min: 0 },
    maxShows:         { type: Number, default: 1, min: 0 },
    title:            { type: String, default: "AI Assistant" },
    message:          { type: String, required: true },
    variant:          { type: String, enum: ["info", "success", "warning", "danger"], default: "info" },
    durationMs:       { type: Number, default: 6000, min: 0 },
    ctaLabel:         { type: String, default: "" },
    ctaUrl:           { type: String, default: "" },
    position:         { type: String, enum: ["", "br", "bl", "tr", "tl"], default: "" },
    allowWhileVisible:{ type: Boolean, default: false },
  },
  { _id: false }
);

const NotificationsBehaviorSchema = new mongoose.Schema(
  {
    enabled:      { type: Boolean, default: false },
    rulesVersion: { type: Number, default: 1, min: 1 },
    limits:       { type: NotificationLimitsSchema, default: () => ({}) },
    rules:        { type: [NotificationRuleSchema], default: [] },
  },
  { _id: false }
);

const HybridFloatBehaviorSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
  },
  { _id: false }
);

const HybridBehaviorSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    float:   { type: HybridFloatBehaviorSchema, default: () => ({}) },
  },
  { _id: false }
);

const FloatLauncherBehaviorSchema = new mongoose.Schema(
  {
    variant:       { type: String, enum: ["circle", "pill"], default: "circle" },
    text:          { type: String, default: "" },
    iconText:      { type: String, default: "AI" },
    hideLabelWhenEmpty: { type: Boolean, default: false },
    widthPx:       { type: Number, default: 420, min: 160, max: 900 },
    heightPx:      { type: Number, default: 56, min: 40, max: 120 },
    bgColor:       { type: String, default: "" },
    textColor:     { type: String, default: "" },
    iconBgColor:   { type: String, default: "" },
    iconTextColor: { type: String, default: "" },
    borderColor:   { type: String, default: "" },
    shadow:        { type: String, default: "" },
  },
  { _id: false }
);

const FloatLauncherActionSchema = new mongoose.Schema(
  {
    variant:       { type: String, enum: ["", "circle", "pill"], default: "" },
    text:          { type: String, default: "" },
    iconText:      { type: String, default: "" },
    widthPx:       { type: Number, default: null, min: 160, max: 900 },
    heightPx:      { type: Number, default: null, min: 40, max: 120 },
    bgColor:       { type: String, default: "" },
    textColor:     { type: String, default: "" },
    iconBgColor:   { type: String, default: "" },
    iconTextColor: { type: String, default: "" },
    borderColor:   { type: String, default: "" },
    shadow:        { type: String, default: "" },
  },
  { _id: false }
);

const FloatLauncherDynamicRuleSchema = new mongoose.Schema(
  {
    id:             { type: String, default: "" },
    event:          { type: String, required: true },
    section:        { type: String, default: "" },
    tab:            { type: String, default: "" },
    path:           { type: String, default: "" },
    minDurationMs:  { type: Number, default: 0, min: 0 },
    minScrollDepth: { type: Number, default: 0, min: 0 },
    minVisibleMs:   { type: Number, default: 0, min: 0 },
    priority:       { type: Number, default: 0 },
    once:           { type: Boolean, default: false },
    cooldownMs:     { type: Number, default: 0, min: 0 },
    maxShows:       { type: Number, default: 0, min: 0 },
    action:         { type: FloatLauncherActionSchema, default: () => ({}) },
  },
  { _id: false }
);

const FloatLauncherDynamicSchema = new mongoose.Schema(
  {
    enabled:         { type: Boolean, default: false },
    resetOnNoMatch:  { type: Boolean, default: true },
    transitionMs:    { type: Number, default: 220, min: 80, max: 1200 },
    rules:           { type: [FloatLauncherDynamicRuleSchema], default: [] },
  },
  { _id: false }
);

FloatLauncherBehaviorSchema.add({
  dynamic: { type: FloatLauncherDynamicSchema, default: () => ({}) },
});

const BehaviorSchema = new mongoose.Schema(
  {
    renderMode:    { type: String, enum: ["float", "inline", "hybrid"], default: "float" },
    hybrid:        { type: HybridBehaviorSchema, default: () => ({}) },
    floatLauncher: { type: FloatLauncherBehaviorSchema, default: () => ({}) },
    notifications: { type: NotificationsBehaviorSchema, default: () => ({}) },
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
  position:           { type: String, enum: ["br","bl","center","bc"], default: "br" },

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
baseFontSize:      { type: Number, default: 14, min: 10, max: 24 },


  // ===== LLM / системный промпт =====
  customSystemPrompt:     { type: String, default: "" },
  leadCapture: { type: LeadCaptureSchema, default: () => ({}) },
  behavior: { type: BehaviorSchema, default: () => ({}) },

  // ===== флаги/метаданные =====
  isActive:   { type: Boolean, default: true },
  version:    { type: Number,   default: 1 },
    // if it's empty, the client will use the global defaultWidgetVersion
  widgetVersionOverride: { type: String, default: "", trim: true },
}, { timestamps: true });

// уникальная связка владельца + сайта
WidgetConfigSchema.index({ clientId: 1, siteId: 1 }, { unique: true });

export default mongoose.model("WidgetConfig", WidgetConfigSchema);
