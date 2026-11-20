import { createHash } from "node:crypto";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function commentEntries(row) {
  return (row.discussions || []).flatMap(thread => thread.comments);
}

export function commentFingerprints(row) {
  return Object.fromEntries(commentEntries(row).map(comment => [comment.id, hash(comment)]).sort(([a], [b]) => a.localeCompare(b)));
}

export function commentRevision(row) {
  return hash(commentFingerprints(row));
}

export function summarizeComments(row, seen = {}) {
  const comments = commentEntries(row);
  const fingerprints = commentFingerprints(row);
  const unreadIds = Object.keys(fingerprints).filter(id => seen[id] !== fingerprints[id]);
  return {
    commentCount: comments.length,
    unreadCommentCount: unreadIds.length,
    unreadCommentIds: unreadIds,
    commentsRevision: hash(fingerprints),
    lastCommentAt: comments.map(comment => comment.modifiedAt || comment.createdAt || "").sort().at(-1) || null,
  };
}
