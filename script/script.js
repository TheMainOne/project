import 'dotenv/config';
import mongoose from "mongoose";
import AiwMessage from "../models/AiwMessage.js";
import AiwSession from "../models/AiwSession.js";

const SITE_ID = "SITE_TEST";

async function run() {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log("MongoDB connected");

    const messagesResult = await AiwMessage.deleteMany({ siteId: SITE_ID });
    console.log(`AiwMessages deleted: ${messagesResult.deletedCount}`);

    const sessionsResult = await AiwSession.deleteMany({ siteId: SITE_ID });
    console.log(`AiwSessions deleted: ${sessionsResult.deletedCount}`);

    console.log("Cleanup finished");
  } catch (err) {
    console.error("Cleanup error:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
