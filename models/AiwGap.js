
const AiwGapSchema = new mongoose.Schema({
  siteId:    { type: String, index: true },
  sessionId: { type: String, index: true },

  question:  { type: String, required: true, index: "text" },
  // 🔽 добавляем поля, которые используешь в коде
  normalizedQuestion: { type: String, index: true }, // для дедупа
  resolvedAt:         { type: Date, default: null }, // чтобы потом "закрывать" гэп
  lastSeenAt:         { type: Date },                // обновляем при повторном столкновении
  clientId:           { type: String },              // ты передаёшь clientId — сохраняем

  answerPreview: { type: String, maxlength: 1500 },
  phase:         { type: String },                 // "no-context" | "rag" | "rag-extractive" | ...
  citations:     [String],                         // urls
  judge: {
    goodAnswer: Boolean,
    confidence: Number,
    reason: String
  }
}, { timestamps: true, versionKey: false });

// как и было
AiwGapSchema.index({ siteId: 1, createdAt: -1 });

// 🔽 уникальность нерешённых гэпов в рамках (siteId, sessionId, normalizedQuestion)
AiwGapSchema.index(
  { siteId: 1, sessionId: 1, normalizedQuestion: 1 },
  { unique: true, partialFilterExpression: { resolvedAt: { $exists: false } } }
);

export default mongoose.model("AiwGap", AiwGapSchema); // коллекция "aiwgaps"