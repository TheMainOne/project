// models/ClientDocChunk.js
import mongoose from "mongoose";

const ClientDocChunkSchema = new mongoose.Schema({
  clientId:   { type: mongoose.Schema.Types.ObjectId, ref: "Client", index: true, required: true },
  siteId:     { type: String, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: "ClientDocument", index: true, required: true },
  title:      { type: String }, // продублируем для удобства
  page:       { type: Number, default: 0 },
  section:    { type: String },
  chunkIndex: { type: Number, index: true },
  content:    { type: String, required: true },

  // ВАЖНО: под Atlas Vector Search — хранить как массив чисел фиксированной длины
  embedding: {
    type: [Number],
    validate: v => Array.isArray(v) && v.length > 0,
  },

  // служебное
  tokenCount: { type: Number, default: 0 },
}, { timestamps: true, versionKey: false });

ClientDocChunkSchema.index({ content: "text" });

// (опционально, если часто фильтруешь по связкам)
ClientDocChunkSchema.index({ clientId: 1, documentId: 1 });


export default mongoose.model("ClientDocChunk", ClientDocChunkSchema);
