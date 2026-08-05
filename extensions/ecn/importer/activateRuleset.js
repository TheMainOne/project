import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_PRIVATE_RULESET_DIRECTORY, validateEcnRulesetShape } from "./importRuleset.js";
import { assertPrivateArtifact } from "./privacy.js";

function safeFilePart(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

async function atomicWrite(targetPath, contents) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporary = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, targetPath);
}

export async function activateEcnRulesetDraft({
  draftPath,
  outputDirectory = DEFAULT_PRIVATE_RULESET_DIRECTORY,
  reviewedBy,
  acceptConflicts = false,
  now = new Date(),
} = {}) {
  if (!draftPath) throw new Error("draftPath is required");
  if (!String(reviewedBy || "").trim()) {
    throw new Error("reviewedBy is required to activate an ECN ruleset");
  }
  const draft = JSON.parse(await fs.readFile(path.resolve(draftPath), "utf8"));
  validateEcnRulesetShape(draft);
  if (draft.status !== "draft") throw new Error("Only a draft ECN ruleset can be activated");
  const conflictCount = Number(draft.import?.conflictCount || 0);
  if (conflictCount > 0 && !acceptConflicts) {
    const error = new Error(
      `Draft has ${conflictCount} conflict(s); review them and rerun with --accept-conflicts`,
    );
    error.code = "ECN_RULESET_CONFLICTS_UNACCEPTED";
    error.conflictCount = conflictCount;
    throw error;
  }

  const active = {
    ...draft,
    status: "active",
    activatedAt: now.toISOString(),
    activation: {
      reviewed: true,
      reviewedByHash: createHash("sha256")
        .update(String(reviewedBy).normalize("NFKC").trim(), "utf8")
        .digest("hex"),
      acceptedConflicts: acceptConflicts ? conflictCount : 0,
    },
  };
  assertPrivateArtifact(active);
  const serialized = `${JSON.stringify(active, null, 2)}\n`;
  const checksum = createHash("sha256").update(serialized, "utf8").digest("hex");
  const fileName = `${safeFilePart(active.version)}.active.json`;
  const activeVersionPath = path.join(outputDirectory, fileName);
  const pointerPath = path.join(outputDirectory, "active.json");
  const pointer = {
    kind: "ecn-active-ruleset-pointer",
    version: active.version,
    fileName,
    sha256: checksum,
    activatedAt: active.activatedAt,
  };
  assertPrivateArtifact(pointer);

  // Keep each versioned active file so replacing active.json remains recoverable.
  await atomicWrite(activeVersionPath, serialized);
  await atomicWrite(pointerPath, `${JSON.stringify(pointer, null, 2)}\n`);
  return {
    version: active.version,
    conflictCount,
    acceptedConflicts: active.activation.acceptedConflicts,
    paths: { activeVersionPath, pointerPath },
  };
}

export default activateEcnRulesetDraft;
