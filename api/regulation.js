import express from "express";
import controllers from "../controllers/RegulationController.js";
import authenticate from "../middlewares/authenticate.js";
import isValidId from "../middlewares/isValidId.js";
import validateBody from "../middlewares/validateBody.js";
import { regulationSchema } from "../services/schemas/regulation.js";

const regulationRouter = express.Router();

regulationRouter.get(
  "/api/regulatories",
  authenticate,
  controllers.getAllRegulations
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
