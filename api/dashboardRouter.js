import express from "express";
import authenticate from "../middlewares/authenticate.js";
import requirePermission from "../middlewares/requirePermission.js";
import dashboardController from "../controllers/dashboardController.js";

const dashboardRouter = express.Router();

/**
 * GET /api/dashboard/supplier-compliance
 * Параметры запроса:
 *   - supplierName (string, обязательный): имя поставщика
 * Пример: GET /api/dashboard/supplier-compliance?supplierName=testSupplier3
 */
dashboardRouter.get(
  "/api/dashboard/supplier-compliance",
  authenticate,
  requirePermission("Dashboard", "view"),
  dashboardController.getSupplierComplianceBreakdown
);

export default dashboardRouter;