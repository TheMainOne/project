import express from "express";
import { countActiveSessions } from "../controllers/aiwStatsController.js";

const aiwStatsRouter = express.Router();

aiwStatsRouter.get("/sessions/active/count", countActiveSessions);

export default aiwStatsRouter;