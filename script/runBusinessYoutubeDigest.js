import "dotenv/config";
import mongoose from "mongoose";
import BusinessYoutubeVideo from "../models/BusinessYoutubeVideo.js";
import { runBusinessYoutubeDigest } from "../services/businessYoutube/digest.js";

const DB_NAME = process.env.MONGODB_DB_NAME || "materials_reader";

function hasArg(name) {
  return process.argv.includes(name);
}

async function initMongo() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL is not set");

  await mongoose.connect(uri, { dbName: DB_NAME, autoIndex: true });
  await BusinessYoutubeVideo.createCollection().catch(() => {});
  await BusinessYoutubeVideo.syncIndexes();
}

async function main() {
  const dryRun = hasArg("--dry-run");
  await initMongo();
  await runBusinessYoutubeDigest({ dryRun, logger: console });
}

main()
  .catch((error) => {
    console.error("[business-youtube] runner failed:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
