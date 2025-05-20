import express from "express";
import controllers from "../controllers/assetController.js";
import isValidId from "../middlewares/isValidId.js";
import authenticate from "../middlewares/authenticate.js";
import validateBody from "../middlewares/validateBody.js";
import filterAndSort from "../middlewares/filterAndSort.js";
import requirePermission from "../middlewares/requirePermission.js";
import {
  validateAssetSchema,
  validateAssetUpdateSchema,
} from "../services/validators/assetValidator.js";

const assetRouter = express.Router();

assetRouter.post(
  "/api/assets",
  authenticate,
  validateBody(validateAssetSchema),
  controllers.createAsset
);
assetRouter.get(
  "/api/assets",
  authenticate,
  // requirePermission("Assets", "view"), // Проверяем разрешение на просмотр
  // filterAndSort,
  controllers.getAssets
);
assetRouter.get(
  "/api/assets/:id",
  authenticate,
  // requirePermission("Assets", "view"), // Проверяем разрешение на просмотр
  isValidId,
  controllers.getAssetById
);
assetRouter.put(
  "/api/assets/:id",
  authenticate,
  // requirePermission("Assets", "update"), // Проверяем разрешение на обновление
  isValidId,
  validateBody(validateAssetUpdateSchema),
  controllers.updateAsset
);
assetRouter.delete(
  "/api/assets/:id",
  authenticate,
  isValidId,
  // requirePermission("Assets", "delete"), // Проверяем разрешение на удаление
  controllers.deleteAsset
);

export default assetRouter;
