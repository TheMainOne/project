import mongoose from "mongoose";

const LeadStateSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["idle", "soft_prompted", "capturing", "suppressed", "completed"],
    default: "idle",
  },
  userMessageCount: { type: Number, default: 0 },

  softPromptCount: { type: Number, default: 0 },
  lastSoftPromptAt: { type: Date, default: null },

  currentStepIndex: { type: Number, default: 0 },
  answers: {
    type: Map,
    of: String, // можно усложнить позже
    default: {},
  },
   trigger: { type: String, default: null },
}, { _id: false });

const AiwSessionSchema = new mongoose.Schema({
  siteId: { type: String, index: true, required: true },
  sessionId: { type: String, index: true, required: true, unique: true },
  visitorId: { type: String, index: true },

  pageUrl: String,
  referrer: String,
  utm: {
    utm_source: String, utm_medium: String, utm_campaign: String,
    utm_term: String, utm_content: String
  },

  userAgent: String,
  ipHash: { type: String, index: true },
  tz: String,
  lang: String,

    // язык ответов ассистента (deterministic)
  replyLang: { type: String, default: null },          // "ru","en","de",...
  lastDetectedLang: { type: String, default: null },   // leading signal from detector/LLM
  langStreak: { type: Number, default: 0 },            // сколько подряд сообщений “не на replyLang”
  replyLangUpdatedAt: { type: Date, default: null },   // когда последний раз меняли replyLang

  startedAt: { type: Date, default: Date.now, index: true },
  endedAt: { type: Date },
  messagesCount: { type: Number, default: 0 },
  userMessages: { type: Number, default: 0 },
  assistantMessages: { type: Number, default: 0 },

  topics: [{ type: String, index: true }],
  tags:   [{ type: String }],
  lastUserQuestion: String,
    leadState: {
    type: LeadStateSchema,
    default: () => ({}),
  },

  // expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }
}, { timestamps: true, versionKey: false  });

AiwSessionSchema.index({ siteId: 1, startedAt: -1 });
AiwSessionSchema.index({ visitorId: 1, siteId: 1 });

export default mongoose.model("AiwSession", AiwSessionSchema);
