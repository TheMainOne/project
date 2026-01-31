import express from "express";
import { recordPageVisit, telemetrySummary } from "../controllers/telemetryController.js";

const telemetryRouter = express.Router();

telemetryRouter.post("/page-visit", recordPageVisit);
telemetryRouter.get("/summary", telemetrySummary);

export default telemetryRouter;
