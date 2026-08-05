import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import DEFAULT_ECN_RULESET from "../extensions/ecn/rules/defaultRuleset.js";
import {
  loadActiveEcnRuleset,
  resetEcnRulesetCacheForTests,
} from "../extensions/ecn/services/rulesetService.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function writeActive(directory, ruleset) {
  const fileName = `${ruleset.version}.active.json`;
  const serialized = `${JSON.stringify(ruleset, null, 2)}\n`;
  await fs.writeFile(path.join(directory, fileName), serialized, "utf8");
  await fs.writeFile(
    path.join(directory, "active.json"),
    `${JSON.stringify({
      kind: "ecn-active-ruleset-pointer",
      version: ruleset.version,
      fileName,
      sha256: createHash("sha256").update(serialized, "utf8").digest("hex"),
      activatedAt: "2026-08-05T12:00:00.000Z",
    }, null, 2)}\n`,
    "utf8"
  );
}

test("runtime ruleset loader verifies an activated private ruleset and falls back safely", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ecn-ruleset-test-"));
  try {
    resetEcnRulesetCacheForTests();
    const missing = await loadActiveEcnRuleset({ directory });
    assert.equal(missing.state, "baseline_no_active");
    assert.equal(missing.version, DEFAULT_ECN_RULESET.version);

    const active = clone(DEFAULT_ECN_RULESET);
    active.version = "ecn-active-test-1";
    active.status = "active";
    active.activation = { reviewed: true, reviewedByHash: "a".repeat(64) };
    await writeActive(directory, active);
    resetEcnRulesetCacheForTests();
    const loaded = await loadActiveEcnRuleset({ directory });
    assert.equal(loaded.state, "active");
    assert.equal(loaded.ruleset.version, "ecn-active-test-1");
    assert.equal(Object.isFrozen(loaded.ruleset), true);

    await fs.appendFile(path.join(directory, "ecn-active-test-1.active.json"), "tampered", "utf8");
    resetEcnRulesetCacheForTests();
    const tampered = await loadActiveEcnRuleset({ directory });
    assert.equal(tampered.state, "baseline_invalid_active");
    assert.equal(tampered.ruleset.version, DEFAULT_ECN_RULESET.version);

    const invalidEvidence = clone(active);
    invalidEvidence.version = "ecn-active-test-2";
    invalidEvidence.baseRequestRequirements[0].evidenceLevel = "conflict";
    invalidEvidence.baseRequestRequirements[0].severity = "blocker";
    await writeActive(directory, invalidEvidence);
    resetEcnRulesetCacheForTests();
    const rejected = await loadActiveEcnRuleset({ directory });
    assert.equal(rejected.state, "baseline_invalid_active");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
