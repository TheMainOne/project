import express from "express";
import controllers from "../controllers/RegulationController.js";
import authenticate from "../middlewares/authenticate.js";
import isValidId from "../middlewares/isValidId.js";
import validateBody from "../middlewares/validateBody.js";
import upload from "../middlewares/multer.js";
import { regulationSchema } from "../services/schemas/regulation.js";


const regulationRouter = express.Router();

regulationRouter.get(
  "/api/regulatories",
  authenticate,
  controllers.getAllRegulations
);
regulationRouter.get(
  "/api/regulatories/search",
  authenticate,
  controllers.searchRegulationByTitle
);
regulationRouter.get(
  "/api/regulatories/:id",
  authenticate,
  isValidId,
  controllers.getRegulationById
);
regulationRouter.post(
  "/api/regulatories",
  authenticate,
  validateBody(regulationSchema.validateRegulationSchema),
  controllers.addRegulation
);
regulationRouter.post(
  "/api/regulatories/with-document",
  authenticate,
  upload.single("document"), // Middleware для загрузки документа
  validateBody(regulationSchema.validateRegulationWithDocumentSchema),
  controllers.addNewRegulationWithDocument
);
regulationRouter.put(
  "/api/regulatories/:id",
  authenticate,
  isValidId,
  validateBody(regulationSchema.updateRegulationSchema),
  controllers.updateRegulation
);
regulationRouter.delete(
  "/api/regulatories/:id",
  authenticate,
  isValidId,
  controllers.deleteRegulationById
);

export default regulationRouter;
