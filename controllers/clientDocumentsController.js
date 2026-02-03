// controllers/clientDocumentsController.js
import mongoose from "mongoose";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../services/amazon/s3Client.js";
import Client from "../models/Client.js";
import ClientDocument from "../models/ClientDocument.js";
import ClientDocChunk from "../models/ClientDocChunk.js";
import { ingestDocument } from "../services/rag/ingestDocument.js";

async function resolveClientId(idOrSlug) {
  if (!idOrSlug) return null;

  if (mongoose.isValidObjectId(idOrSlug)) {
    return new mongoose.Types.ObjectId(idOrSlug);
  }

  const client = await Client.findOne({
    $or: [
      { slug: idOrSlug },
      { siteId: idOrSlug },
      { domains: idOrSlug }
    ]
  }).select("_id").lean();

  return client?._id || null;
}

async function resolveClientIdFromRequest(req) {
  const idOrSlug =
    req.params.id ||
    req.params.clientId ||
    req.body?.clientId ||
    req.header("x-aiw-client") ||
    null;

  return resolveClientId(idOrSlug);
}

function extractKeyFromUrl(url) {
  try {
    const u = new URL(url);
    let key = u.pathname.replace(/^\/+/, "");

    if (u.hostname === "s3.amazonaws.com" || /^s3\.[^.]+\.amazonaws\.com$/.test(u.hostname)) {
      const parts = key.split("/");
      parts.shift();
      key = parts.join("/");
    }

    return decodeURIComponent(key);
  } catch {
    return null;
  }
}

export async function createClientDocument(req, res) {
  try {
    const clientId = await resolveClientIdFromRequest(req);

    if (!clientId) {
      return res.status(400).json({ ok: false, error: "clientId is required in URL" });
    }

    const { siteId, title } = req.body || {};
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, error: "file is required (multipart field 'file')" });
    }

    const s3Key = file.key || null;
    const s3Bucket = file.bucket || null;
    const publicUrl = file.location || null;
    const fileName = file.uploadedOriginalName || file.originalname || "document";
    const mimeType = file.uploadedMimeType || file.mimetype;
    const fileSize = file.size;

    const doc = await ClientDocument.create({
      clientId,
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
      isActive: true,
      ingestStatus: "processing"
    });

    (async () => {
      try {
        await ingestDocument({
          clientId,
          siteId: siteId || null,
          documentId: doc._id,
          title: doc.title,
          s3Key: s3Key || undefined,
          s3Bucket: s3Bucket || undefined,
          localPath: (!s3Key && file?.path) ? file.path : undefined,
          mimeType
        });

        await ClientDocument.updateOne(
          { _id: doc._id },
          { $set: { ingestStatus: "ready" } }
        );
      } catch (e) {
        console.error("[RAG][ingestDocument] failed:", String(doc._id), e?.message || e);

        await ClientDocument.updateOne(
          { _id: doc._id },
          { $set: { ingestStatus: "failed" } }
        );
      }
    })();

    return res.status(202).json({
      ok: true,
      documentId: doc._id,
      status: "processing"
    });
  } catch (e) {
    console.error("createClientDocument error:", e);
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: String(e?.message || e) });
  }
}

export async function setClientDocumentActive(req, res) {
  try {
    const { docId } = req.params;
    const { isActive } = req.body || {};

    if (!mongoose.isValidObjectId(docId)) {
      return res.status(400).json({ ok: false, error: "Invalid docId" });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ ok: false, error: "isActive boolean is required" });
    }

    const clientId = await resolveClientIdFromRequest(req);
    if (!clientId) {
      return res.status(400).json({ ok: false, error: "clientId is required in URL" });
    }

    const doc = await ClientDocument.findOneAndUpdate(
      { _id: docId, clientId },
      { $set: { isActive } },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) {
      return res.status(404).json({ ok: false, error: "Document not found" });
    }

    return res.json({
      ok: true,
      document: {
        _id: doc._id,
        clientId: doc.clientId,
        title: doc.title,
        isActive: doc.isActive,
        ingestStatus: doc.ingestStatus,
        updatedAt: doc.updatedAt
      }
    });
  } catch (e) {
    console.error("setClientDocumentActive error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

export async function deleteClientDocument(req, res) {
  try {
    const { docId } = req.params;

    const doc = await ClientDocument.findById(docId);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    let Bucket = doc.s3Bucket || process.env.AWS_S3_BUCKET || null;
    let Key = doc.s3Key || null;

    if (!Key && doc.s3Url) {
      Key = extractKeyFromUrl(doc.s3Url);
    }

    if (Bucket && Key) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket, Key }));
      } catch (err) {
        console.error("[S3] DeleteObject error:", err?.name || err?.message || err);
      }
    } else {
      console.warn("[S3] Skip delete: missing Bucket/Key", { Bucket, Key, url: doc.s3Url });
    }

    await ClientDocChunk.deleteMany({ $or: [{ documentId: doc._id }, { docId: doc._id }] });
    await ClientDocument.deleteOne({ _id: doc._id });

    return res.json({ ok: true, removed: docId });
  } catch (e) {
    console.error("deleteClientDocument:", e);
    return res.status(500).json({ error: e.message });
  }
}

export async function countAllClientDocuments(req, res) {
  try {
    const estimated = await ClientDocument.estimatedDocumentCount();

    return res.json({
      total: estimated
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
