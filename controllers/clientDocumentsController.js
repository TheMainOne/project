// controllers/clientDocumentsController.js
import mongoose from "mongoose";
import Client from "../models/Client.js";
import ClientDocument from "../models/ClientDocument.js";
import { ingestDocument } from "../services/rag/ingestDocument.js";

export async function createClientDocument(req, res) {
  try {
    // 1) достаём идентификатор из URL/headers/body
    const idOrSlug =
      req.params.id ||
      req.params.clientId ||
      req.body?.clientId ||
      req.header("x-aiw-client") ||
      null;

    // 2) приводим к ObjectId или ищем по слагу
    let clientId = null;
    if (idOrSlug && mongoose.isValidObjectId(idOrSlug)) {
      clientId = new mongoose.Types.ObjectId(idOrSlug);
    } else if (idOrSlug) {
      const c = await Client.findOne({
        $or: [
          { slug: idOrSlug },
          { siteId: idOrSlug },
          { domains: idOrSlug }
        ]
      }).select("_id").lean();
      if (c?._id) clientId = c._id;
    }

    if (!clientId) {
      return res.status(400).json({ ok: false, error: "clientId is required in URL" });
    }

    const { siteId, title } = req.body || {};
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, error: "file is required (multipart field 'file')" });
    }

    // поля от multer-s3 (или локального multer)
    const s3Key    = file.key || null;
    const s3Bucket = file.bucket || null;
    const publicUrl = file.location || null;
    const fileName = file.uploadedOriginalName || file.originalname || "document";
    const mimeType = file.uploadedMimeType || file.mimetype;
    const fileSize = file.size;

    // 3) создаём документ — ВАЖНО: кладём САМ clientId, который получили выше
    const doc = await ClientDocument.create({
      clientId,                       // <—— вот оно!
      siteId: siteId || null,
      title: title || fileName,
      originalName: fileName,
      fileName,
      fileSize,
      mimeType,
      s3Bucket,
      s3Key,
      s3Url: publicUrl,
      etag: file.etag,
      isActive: true
    });

    // 4) Ингест — передаём тот же clientId
    const resIngest = await ingestDocument({
      clientId,                       // <—— и здесь!
      siteId: siteId || null,
      documentId: doc._id,
      title: doc.title,
      s3Key: s3Key || undefined,
      s3Bucket: s3Bucket || undefined,
      localPath: (!s3Key && file?.path) ? file.path : undefined,
      mimeType
    });

    return res.json({ ok: true, documentId: doc._id, ...resIngest });
  } catch (e) {
    console.error("createClientDocument error:", e);
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: String(e?.message || e) });
  }
}
