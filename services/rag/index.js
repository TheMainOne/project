// services/rag/index.js
import ClientDocument from "../../models/ClientDocument.js";
import { retrieveDocsTopK } from "./retrieveDocs.js";

/**
 * Возвращает contexts в формате { url, title, text }
 */
export async function retrieveUnified({ clientId, siteId, query }) {
  const docs = await retrieveDocsTopK({ clientId, siteId, query, k: 24 });

  // подтянем s3Url для красивых ссылок (одним запросом)
  const ids = [...new Set(docs.chunks.map(c => c.documentId))];
  const docsMeta = await ClientDocument.find({ _id: { $in: ids } })
    .select("_id s3Url s3Key title")
    .lean();

  const byId = new Map(docsMeta.map(d => [String(d._id), d]));

  const contexts = docs.chunks.map(c => {
    const meta = byId.get(c.documentId);
    const url =
      meta?.s3Url ||
      (meta?.s3Key ? `s3://${meta.s3Key}` : `doc://${c.documentId}`); // временно, пока нет вьювера страниц
    return {
      url: `${url}#page=${c.page || 0}`,
      title: c.title || meta?.title || "Document",
      text: c.content
    };
  });

  return { contexts };
}
