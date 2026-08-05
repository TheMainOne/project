import path from "node:path";

import { activateEcnRulesetDraft } from "../extensions/ecn/importer/activateRuleset.js";
import { DEFAULT_PRIVATE_RULESET_DIRECTORY } from "../extensions/ecn/importer/importRuleset.js";

function usage() {
  return [
    "Usage: npm run ecn:activate -- --draft <ruleset.draft.json> --reviewed-by <name>",
    "       [--output <private-directory>] [--accept-conflicts]",
    "",
    "--accept-conflicts records explicit acceptance; conflicting rules remain Needs confirmation.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    outputDirectory: DEFAULT_PRIVATE_RULESET_DIRECTORY,
    reviewedBy: process.env.ECN_REVIEWED_BY || "",
    acceptConflicts: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--accept-conflicts") {
      options.acceptConflicts = true;
      continue;
    }
    const value = argv[index + 1];
    if (["--draft", "--output", "--reviewed-by"].includes(arg)) {
      if (!value) throw new Error(`${arg} requires a value`);
      index += 1;
      if (arg === "--draft") options.draftPath = path.resolve(value);
      if (arg === "--output") options.outputDirectory = path.resolve(value);
      if (arg === "--reviewed-by") options.reviewedBy = value;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.draftPath) throw new Error(`--draft is required.\n\n${usage()}`);
  if (!options.reviewedBy) throw new Error(`--reviewed-by is required.\n\n${usage()}`);
  const result = await activateEcnRulesetDraft(options);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(`ECN activation failed: ${error.message}`);
  process.exitCode = 1;
});
