import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
export const ECF_SHEET_ID = "5485143814104964";
export const ECN_ARCHIVE_SHEET_ID = "6439007336484740";
export const ECN_ARCHIVE_NUMBER_COLUMN_ID = "8114644527042436";

function integerSetting(value, fallback, minimum, maximum, name) {
  const number = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(name + " must be an integer from " + minimum + " to " + maximum);
  }
  return number;
}

export function loadConfig() {
  let file = {};
  try {
    file = parseEnv(readFileSync(new URL("../.env", import.meta.url), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const env = { ...process.env, ...file };
  const autoNumberValue = String(env.ECN_AUTO_NUMBER || "false").trim().toLowerCase();
  if (!["true", "false"].includes(autoNumberValue)) throw new Error("ECN_AUTO_NUMBER must be true or false");
  return {
    sheetId: ECF_SHEET_ID,
    token: (env.SMARTSHEET_API_TOKEN || "").trim(),
    port: integerSetting(env.ECN_PORT, 4310, 1024, 65535, "ECN_PORT"),
    pollSeconds: integerSetting(env.ECN_POLL_SECONDS, 120, 30, 3600, "ECN_POLL_SECONDS"),
    autoNumber: autoNumberValue === "true",
    numberingTimeZone: "America/New_York",
    archiveSheetId: ECN_ARCHIVE_SHEET_ID,
    archiveNumberColumnId: ECN_ARCHIVE_NUMBER_COLUMN_ID,
    numberingDatabasePath: fileURLToPath(new URL("../data/numbering.sqlite", import.meta.url)),
    databasePath: fileURLToPath(new URL("../data/ecn.sqlite", import.meta.url)),
    publicDirectory: fileURLToPath(new URL("../public/", import.meta.url)),
  };
}
