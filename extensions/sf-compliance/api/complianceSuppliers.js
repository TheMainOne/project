import express from "express";
import multer from "multer";
import importSupplierMatrixFromBuffer from "../services/importSupplierMatrix.js";

const complianceSuppliersRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

complianceSuppliersRouter.post("/suppliers/import", upload.single("file"), async (req, res, next) => {
  try {
    const fileBuffer = req.file?.buffer;

    if (!fileBuffer) {
      return res.status(400).json({
        error: "Multipart file is required in field 'file'",
      });
    }

    const report = await importSupplierMatrixFromBuffer(fileBuffer);
    return res.json(report);
  } catch (error) {
    return next(error);
  }
});

export default complianceSuppliersRouter;
