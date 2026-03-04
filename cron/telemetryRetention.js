import cron from "node-cron";
import TelemetryEvent from "../models/TelemetryEvent.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_CRON = "15 3 * * *";
const DEFAULT_TIMEZONE = "UTC";

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseRetentionDays(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_RETENTION_DAYS;
  return parsed;
}

export async function deleteOldTelemetryEvents(retentionDays) {
  const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
  const result = await TelemetryEvent.deleteMany({
    createdAt: { $lt: cutoff },
  });

  return {
    cutoff,
    deletedCount: result?.deletedCount || 0,
  };
}

async function ensureCreatedAtIndex(logger) {
  try {
    await TelemetryEvent.collection.createIndex({ createdAt: 1 }, { name: "createdAt_1" });
  } catch (error) {
    logger.error("[telemetry-retention] failed to ensure createdAt index:", error);
  }
}

export function startTelemetryRetentionJob({ logger = console } = {}) {
  const enabled = parseBoolean(process.env.TELEMETRY_RETENTION_ENABLED, true);
  if (!enabled) {
    logger.log("[telemetry-retention] disabled via TELEMETRY_RETENTION_ENABLED");
    return null;
  }

  const retentionDays = parseRetentionDays(process.env.TELEMETRY_RETENTION_DAYS);
  const cronExpression = String(process.env.TELEMETRY_RETENTION_CRON || DEFAULT_CRON).trim();
  const timezone = String(process.env.TELEMETRY_RETENTION_TZ || DEFAULT_TIMEZONE).trim();
  const runOnStart = parseBoolean(process.env.TELEMETRY_RETENTION_RUN_ON_START, false);

  if (!cron.validate(cronExpression)) {
    logger.error("[telemetry-retention] invalid cron expression:", cronExpression);
    return null;
  }

  void ensureCreatedAtIndex(logger);

  const runCleanup = async () => {
    try {
      const { cutoff, deletedCount } = await deleteOldTelemetryEvents(retentionDays);
      logger.log(
        `[telemetry-retention] deleted=${deletedCount} older_than=${cutoff.toISOString()} retention_days=${retentionDays}`
      );
    } catch (error) {
      logger.error("[telemetry-retention] cleanup failed:", error);
    }
  };

  const task = cron.schedule(cronExpression, runCleanup, {
    timezone,
    noOverlap: true,
  });

  logger.log(
    `[telemetry-retention] scheduled cron="${cronExpression}" timezone="${timezone}" retention_days=${retentionDays}`
  );

  if (runOnStart) {
    void runCleanup();
  }

  return task;
}
