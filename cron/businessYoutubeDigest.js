import cron from "node-cron";
import { parseBoolean } from "../services/businessYoutube/config.js";
import { runBusinessYoutubeDigest } from "../services/businessYoutube/digest.js";

const DEFAULT_CRON = "0 8 * * *";
const DEFAULT_TIMEZONE = "America/New_York";

export function startBusinessYoutubeDigestJob({ logger = console } = {}) {
  const enabled = parseBoolean(process.env.BUSINESS_YOUTUBE_DIGEST_ENABLED, false);
  if (!enabled) {
    logger.log("[business-youtube] disabled via BUSINESS_YOUTUBE_DIGEST_ENABLED");
    return null;
  }

  const cronExpression = String(process.env.BUSINESS_YOUTUBE_DIGEST_CRON || DEFAULT_CRON).trim();
  const timezone = String(process.env.BUSINESS_YOUTUBE_DIGEST_TZ || DEFAULT_TIMEZONE).trim();
  const runOnStart = parseBoolean(process.env.BUSINESS_YOUTUBE_DIGEST_RUN_ON_START, false);

  if (!cron.validate(cronExpression)) {
    logger.error("[business-youtube] invalid cron expression:", cronExpression);
    return null;
  }

  const runJob = async () => {
    try {
      await runBusinessYoutubeDigest({ logger });
    } catch (error) {
      logger.error("[business-youtube] digest failed:", error?.message || error);
    }
  };

  const task = cron.schedule(cronExpression, runJob, {
    timezone,
    noOverlap: true,
  });

  logger.log(`[business-youtube] scheduled cron="${cronExpression}" timezone="${timezone}"`);

  if (runOnStart) {
    void runJob();
  }

  return task;
}
