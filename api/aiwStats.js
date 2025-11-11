import express from "express";
import {
  // Sessions
  countActiveSessions,
  countSessionsRaw,
  sessionsTimeseries,
  sessionsList,
  // Messages
  messagesSummary,
  messagesTimeseries,
  topUserMessages,
  // Gaps
  gapsSummary,
  gapsTimeseries,
  topUnresolvedGaps,
} from "../controllers/aiwStatsController.js";

const aiwStatsRouter = express.Router();

// ===== Sessions =====
aiwStatsRouter.get("/sessions/active/count", countActiveSessions);
aiwStatsRouter.get("/sessions/count", countSessionsRaw);
aiwStatsRouter.get("/sessions/timeseries", sessionsTimeseries);
aiwStatsRouter.get("/sessions/list", sessionsList);

// ===== Messages =====
aiwStatsRouter.get("/messages/summary", messagesSummary);
aiwStatsRouter.get("/messages/timeseries", messagesTimeseries);
aiwStatsRouter.get("/messages/top", topUserMessages);

// ===== Gaps =====
aiwStatsRouter.get("/gaps/summary", gapsSummary);
aiwStatsRouter.get("/gaps/timeseries", gapsTimeseries);
aiwStatsRouter.get("/gaps/top-unresolved", topUnresolvedGaps);


export default aiwStatsRouter;