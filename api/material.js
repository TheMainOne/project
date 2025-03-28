import express from "express";
import controllers from "../controllers/materialsController.js";
import isValidId from "../middlewares/isValidId.js";
import validateBody from "../middlewares/validateBody.js";
import authenticate from "../middlewares/authenticate.js";
import upload from "../middlewares/s3Upload.js";
import filterAndSort from "../middlewares/filterAndSort.js";
import requirePermission from "../middlewares/requirePermission.js";
import { materialSchema } from "../services/schemas/material.js";

// creating a new router
const router = express.Router();

// Assigning new paths for the router
router.get(
  "/api/materials",
  authenticate,
  requirePermission("PartManagement", "view"), // Проверяем разрешение на просмотр
  filterAndSort,
  controllers.getAll
);
router.get(
  "/api/materials/search",
  authenticate,
  requirePermission("PartManagement", "view"), // Проверяем разрешение на просмотр
  controllers.searchMaterialsByPartNumber
);
router.get(
  "/api/materials/:id",
  authenticate,
  requirePermission("PartManagement", "view"), // Проверяем разрешение на просмотр
  isValidId,
  controllers.getById
);
router.post(
  "/api/materials",
  authenticate,
  requirePermission("PartManagement", "create"), // Проверяем разрешение на создание
  validateBody(materialSchema.validateMaterialSchema),
  controllers.createMaterial
);
router.put(
  "/api/materials/compliance",
  authenticate,
  requirePermission("PartManagement", "update"), // Проверяем разрешение на обновление
  upload.single("document"), // Middleware для загрузки документа в Amazon S3
  validateBody(materialSchema.validateUpdateComplianceStatusWithDocumentSchema),
  controllers.updateComplianceStatusWithDocument
);
router.put(
  "/api/materials/:id",
  authenticate,
  isValidId,
  requirePermission("PartManagement", "update"), // Проверяем разрешение на обновление
  validateBody(materialSchema.updateMaterialSchema),
  controllers.updateByID
);
router.delete(
  "/api/materials/:id",
  authenticate,
  isValidId,
  requirePermission("PartManagement", "delete"), // Проверяем разрешение на удаление
  controllers.deleteMaterial
);

export default router;
