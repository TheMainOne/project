import express from "express";
import controllers from "../controllers/documentController.js";
import authenticate from "../middlewares/authenticate.js";
import validateBody from "../middlewares/validateBody.js";
import { documentValidation } from "../services/schemas/document.js";

const documentsRouter = express.Router();

documentsRouter.post(
  "/api/documents",
  authenticate,
  validateBody(documentValidation.documentValidationSchema),
  controllers.createDocument
);

documentsRouter.get(
  "/api/documents",
  authenticate,
  controllers.getDocumentsForMaterialAndRegulation
);

export default documentsRouter;
