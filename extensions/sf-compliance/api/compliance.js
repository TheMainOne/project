import express from "express";

import {
  analyzeComplianceCase,
  getComplianceCaseReport,
} from "../controllers/complianceCasesController.js";

import { reviewSupplierResponse } from "../controllers/supplierReviewController.js";

const complianceRouter = express.Router();

complianceRouter.post("/cases/:sfCaseId/analyze", analyzeComplianceCase);
complianceRouter.get("/cases/:sfCaseId/report", getComplianceCaseReport);

// Power Automate Desktop → supplier response AI review
complianceRouter.post(
  "/supplier-review",
  reviewSupplierResponse
);

export default complianceRouter;