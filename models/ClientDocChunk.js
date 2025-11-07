// models/ClientDocChunk.js
import mongoose from "mongoose";

const ClientDocChunkSchema = new mongoose.Schema(
  {
    clientId:   { type: mongoose.Schema.Types.ObjectId, ref: "Client", index: true, required: true },
    siteId:     { type: String, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "ClientDocument", index: true, required: true },

    title:      { type: String },      // дублируем для удобства
    page:       { type: Number, default: 0 },
    section:    { type: String },      // например: "FULL_DOC"
    chunkIndex: { type: Number, index: true },

    // ключевое поле текста чанка
    content:    { type: String, required: true },

    // пометка “полный документ” (sentinel-чанк)
    isFull:     { type: Boolean, default: false, index: true },

    // под Vector Search/FAISS/и т.п. — массив чисел
    embedding: {
      type: [Number],
      validate: v => Array.isArray(v) && v.length > 0,
    },

    // служебное
    tokenCount: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

// Текстовый индекс для $text
ClientDocChunkSchema.index({ content: "text" });

// Частые фильтры
ClientDocChunkSchema.index({ clientId: 1, documentId: 1 });

// Защита от дублей чанков одного документа
ClientDocChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });

export default mongoose.model("ClientDocChunk", ClientDocChunkSchema);
