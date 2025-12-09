// models/ClientDocument.js
import mongoose from "mongoose";

const ClientDocumentSchema = new mongoose.Schema({
  clientId:   { type: mongoose.Schema.Types.ObjectId, ref: "Client", index: true, required: true },
  siteId:     { type: String, index: true },
  title:      { type: String, required: true },

  // исходный файл
  originalName:{ type: String },     // имя на загрузке
  fileName:   { type: String, required: true },
  fileSize:   { type: Number, default: 0 },
  mimeType:   { type: String },

  // S3-хранилище
  s3Bucket:   { type: String },
  s3Key:      { type: String },      // ключ в бакете
  s3Url:      { type: String },      // публичный URL (если есть)
  etag:       { type: String },      // ETag для дедупа (если используешь)

  isActive:   { type: Boolean, default: true },
  version:    { type: String, default: "v1" },
  textPreview:{ type: String },
  pages:      { type: Number, default: 0 },
  checksum:   { type: String, index: true },

  // ► новый статус обработки для RAG
  ingestStatus: {
    type: String,
    enum: ["processing", "ready", "failed"],
    default: "processing",
    index: true,
  },
}, { timestamps: true, versionKey: false });

ClientDocumentSchema.index({ clientId: 1, siteId: 1, createdAt: -1 });

export default mongoose.model("ClientDocument", ClientDocumentSchema);
