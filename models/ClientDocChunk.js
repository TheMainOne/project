// models/ClientDocChunk.js
import mongoose from "mongoose";

const ClientDocChunkSchema = new mongoose.Schema(
  {
    clientId:   { type: mongoose.Schema.Types.ObjectId, ref: "Client", index: true, required: true },
    siteId:     { type: String, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "ClientDocument", index: true, required: true },

    title:      { type: String },
    page:       { type: Number, default: 0 },
    section:    { type: String },
    chunkIndex: { type: Number, index: true },

    // исходный текст чанка
    content:    { type: String, required: true },

    // LLM-обогащение
    semanticSummary: { type: String },               // краткое саммари чанка
    chunkType:       { type: String, index: true },  // "contacts" | "services" | "case_study" | "about" | "pricing" | "other"
    tags:            [{ type: String, index: true }],

    isFull:     { type: Boolean, default: false, index: true },

    // основной эмбеддинг чанка
    embedding: {
      type: [Number],
      validate: v => Array.isArray(v) && v.length > 0,
    },

    // эмбеддинг саммари (пока можно класть тот же самый, потом при желании разделим)
    embeddingSummary: {
      type: [Number],
      validate: v => !v || Array.isArray(v), // допускаем пустое значение
    },

    tokenCount: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

ClientDocChunkSchema.index({ content: "text" });
ClientDocChunkSchema.index({ clientId: 1, documentId: 1 });
ClientDocChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });

export default mongoose.model("ClientDocChunk", ClientDocChunkSchema);
