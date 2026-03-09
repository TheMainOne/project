import { Router } from "express";
import { getHealth } from "../controllers/healthController.js";

const sfComplianceRouter = Router();

sfComplianceRouter.get("/health", getHealth);

export default sfComplianceRouter;