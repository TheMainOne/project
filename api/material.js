import express from "express";
import controllers from "../controllers/materialsController.js";
import isValidId from "../middlewares/isValidId.js";
import validateBody from "../middlewares/validateBody.js";
import authenticate from "../middlewares/authenticate.js";
import upload from "../middlewares/multer.js";
import filterAndSort from "../middlewares/filterAndSort.js";
import requirePermission from "../middlewares/requirePermission.js";
import { materialSchema } from "../services/schemas/material.js";

// creating a new router
const router = express.Router();

// Assigning new paths for the router
router.get(
  "/api/materials",
  authenticate,
  requirePermission("partManagement", "view"), // Проверяем разрешение на просмотр
  filterAndSort,
  controllers.getAll
);
router.get(
  "/api/materials/search",
  authenticate,
  requirePermission("partManagement", "view"), // Проверяем разрешение на просмотр
  controllers.searchMaterialsByPartNumber
);
router.get("/api/materials/:id", authenticate, 
  requirePermission("partManagement", "view"), // Проверяем разрешение на просмотр
  isValidId, controllers.getById);
router.post(
  "/api/materials",
  authenticate,
  requirePermission("partManagement", "create"), // Проверяем разрешение на создание
  validateBody(materialSchema.validateMaterialSchema),
  controllers.createMaterial
);
router.put(
  "/api/materials/compliance",
  authenticate,
  requirePermission("partManagement", "update"), // Проверяем разрешение на обновление
  upload.single("document"), // Middleware для загрузки документа
  validateBody(materialSchema.validateUpdateComplianceStatusWithDocumentSchema),
  controllers.updateComplianceStatusWithDocument
);
router.put(
  "/api/materials/:id",
  authenticate,
  isValidId,
  requirePermission("partManagement", "update"), // Проверяем разрешение на обновление
  validateBody(materialSchema.updateMaterialSchema),
  controllers.updateByID
);
router.delete(
  "/api/materials/:id",
  authenticate,
  isValidId,
  requirePermission("partManagement", "delete"), // Проверяем разрешение на удаление
  controllers.deleteMaterial
);

export default router;
