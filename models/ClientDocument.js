// models/ClientDocument.js
import mongoose from "mongoose";

const ClientDocumentSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", index: true, required: true },
  title: { type: String, required: true },
  fileName: { type: String, required: true },
  fileSize: { type: Number, default: 0 },
  mimeType: { type: String },
  s3Key: { type: String },       // либо локальный путь
  isActive: { type: Boolean, default: true },
  // для RAG: можно хранить raw-текст, эмбеддинги отдельно и т.д.
  textPreview: { type: String },
}, { timestamps: true, versionKey: false });

export default mongoose.model("ClientDocument", ClientDocumentSchema);
