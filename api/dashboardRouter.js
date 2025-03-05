import express from "express";
import authenticate from "../middlewares/authenticate.js";
import requirePermission from "../middlewares/requirePermission.js";
import dashboardController from "../controllers/dashboardController.js";

const dashboardRouter = express.Router();


dashboardRouter.get(
  "/api/dashboard/supplier-compliance",
  authenticate,
  requirePermission("Dashboard", "view"),
  dashboardController.getSupplierExtendedAnalytics
);
dashboardRouter.get(
  "/api/dashboard/supplier-regulation-breakdown",
  authenticate,
  requirePermission("Dashboard", "view"),
  dashboardController.getSupplierRegulationBreakdown
);

export default dashboardRouter;