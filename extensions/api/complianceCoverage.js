import express from "express";
import { getItemComplianceCoverage } from "../controllers/complianceCoverage.js";

const router = express.Router();

router.get("/item/:itemNumber", getItemComplianceCoverage);

export default router;