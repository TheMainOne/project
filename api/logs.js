import express from "express";
import controllers from "../controllers/logsController.js";
import authenticate from "../middlewares/authenticate.js";
import filterAndSort from "../middlewares/filterAndSort.js";
import isValidId from "../middlewares/isValidId.js";
import requirePermission from "../middlewares/requirePermission.js";

const logsRouter = express.Router();

logsRouter.get("/api/logs", authenticate, filterAndSort, controllers.getLogs);
logsRouter.get(
  "/api/logs/:id",
  authenticate,
  isValidId,
  controllers.getLogById
);
logsRouter.get(
  "/api/logs/entity/:entityType/:entityId",
  authenticate,
  controllers.getLogsForEntity
);
logsRouter.delete("/api/logs/cleanup", authenticate, controllers.deleteOldLogs);

export default logsRouter;
