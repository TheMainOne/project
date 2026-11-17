import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
export const ECF_SHEET_ID = "5485143814104964";

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
  return {
    sheetId: ECF_SHEET_ID,
    token: (env.SMARTSHEET_API_TOKEN || "").trim(),
    port: integerSetting(env.ECN_PORT, 4310, 1024, 65535, "ECN_PORT"),
    pollSeconds: integerSetting(env.ECN_POLL_SECONDS, 120, 30, 3600, "ECN_POLL_SECONDS"),
    databasePath: fileURLToPath(new URL("../data/ecn.sqlite", import.meta.url)),
    publicDirectory: fileURLToPath(new URL("../public/", import.meta.url)),
  };
}
