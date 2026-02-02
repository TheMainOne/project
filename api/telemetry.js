import express from "express";
import {
  recordPageVisit,
  telemetryEvents,
  telemetrySummary,
} from "../controllers/telemetryController.js";

const telemetryRouter = express.Router();

telemetryRouter.post(
  "/page-visit",
  express.text({ type: "text/plain", limit: "32kb" }),
  recordPageVisit
);
telemetryRouter.get("/events", telemetryEvents);
telemetryRouter.get("/summary", telemetrySummary);

export default telemetryRouter;
