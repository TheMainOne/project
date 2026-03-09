import express from "express";
import {
  analyzeComplianceCase,
  getComplianceCaseReport,
} from "../controllers/complianceCasesController.js";

const complianceRouter = express.Router();

complianceRouter.post("/cases/:sfCaseId/analyze", analyzeComplianceCase);
complianceRouter.get("/cases/:sfCaseId/report", getComplianceCaseReport);

export default complianceRouter;