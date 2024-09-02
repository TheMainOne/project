import express from "express";
import passport from "passport";
import controllers from "../controllers/materialsController.js";
import isValidId from "../middlewares/isValidId.js";
import validateBody from "../middlewares/validateBody.js";
import authenticate from "../middlewares/authenticate.js";
import { materialSchema } from "../services/schemas/material.js";

// creating a new router
const router = express.Router();

// Assigning new paths for the router
router.get("/api/materials", authenticate, controllers.getAll);
router.get("/api/materials/:id", authenticate, isValidId, controllers.getById);
router.post(
  "/api/materials",
  authenticate,
  validateBody(materialSchema.validateMaterialSchema),
  controllers.createMaterial
);
router.put(
  "/api/materials/:id",
  authenticate,
  isValidId,
  validateBody(materialSchema.updateMaterialSchema),
  controllers.updateByID
);
router.delete(
  "/api/materials/:id",
  authenticate,
  isValidId,
  controllers.deleteMaterial
);

export default router;
