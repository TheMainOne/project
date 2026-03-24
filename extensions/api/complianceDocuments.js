import express from "express";
import {
  createComplianceDocument,
  getComplianceDocuments,
  getComplianceDocumentById,
  updateComplianceDocument,
  deleteComplianceDocument,
} from "../controllers/complianceDocuments.js";

const router = express.Router();

router.post("/", createComplianceDocument);
router.get("/", getComplianceDocuments);
router.get("/:id", getComplianceDocumentById);
router.patch("/:id", updateComplianceDocument);
router.delete("/:id", deleteComplianceDocument);

export default router;