import express from "express";
import {
  createComplianceAssertion,
  getComplianceAssertions,
  getComplianceAssertionById,
  updateComplianceAssertion,
  deleteComplianceAssertion,
} from "../controllers/complianceAssertions.js";

const router = express.Router();

router.post("/", createComplianceAssertion);
router.get("/", getComplianceAssertions);
router.get("/:id", getComplianceAssertionById);
router.patch("/:id", updateComplianceAssertion);
router.delete("/:id", deleteComplianceAssertion);

export default router;