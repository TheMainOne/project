import path from "node:path";

import {
  DEFAULT_PRIVATE_RULESET_DIRECTORY,
  importEcnRuleset,
} from "../extensions/ecn/importer/importRuleset.js";

function usage() {
  return [
    "Usage: npm run ecn:import -- --source <DOCX/XLSX-or-directory> [--source <path> ...]",
    "       [--output <private-directory>] [--version <version>] [--dry-run]",
    "",
    "The command stores checksums, normalized rules, coordinates and short excerpts only.",
    "Original documents and full extracted text are never copied into the ruleset artifacts.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    inputPaths: [],
    outputDirectory: DEFAULT_PRIVATE_RULESET_DIRECTORY,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--source" || arg === "-s") {
      const value = argv[++index];
      if (!value) throw new Error(`${arg} requires a path`);
      options.inputPaths.push(path.resolve(value));
      continue;
    }
    if (arg === "--output" || arg === "-o") {
      const value = argv[++index];
      if (!value) throw new Error(`${arg} requires a directory`);
      options.outputDirectory = path.resolve(value);
      continue;
    }
    if (arg === "--version") {
      const value = argv[++index];
      if (!value) throw new Error("--version requires a value");
      options.version = value;
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    options.inputPaths.push(path.resolve(arg));
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.inputPaths.length) throw new Error(`No source supplied.\n\n${usage()}`);
  const result = await importEcnRuleset(options);
  console.log(
    JSON.stringify(
      {
        ...result.summary,
        dryRun: options.dryRun,
        output: result.paths,
        activationReady: result.summary.conflictCount === 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`ECN import failed: ${error.message}`);
  process.exitCode = 1;
});
