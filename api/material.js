import express from "express";
import controllers from "../controllers/materialsController.js";
import isValidId from "../middlewares/isValidId.js";
import validateBody from "../middlewares/validateBody.js";
import { materialSchema } from "../services/schemas/material.js";


// creating a new router
const router = express.Router();


// Assigning new paths for the router
router.get("/", controllers.getAll);
router.get("/:id", isValidId, controllers.getById);
router.post("/", validateBody(materialSchema.validateMaterialSchema), controllers.createMaterial);
router.put("/:id", isValidId, validateBody(materialSchema.updateMaterialSchema), controllers.updateByID);
router.delete("/:id", isValidId, controllers.deleteMaterial);



export default router;