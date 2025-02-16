import express from "express";
import authenticate from "../middlewares/authenticate.js";
import isValidId from "../middlewares/isValidId.js";
import validateBody from "../middlewares/validateBody.js";
import controllers from "../controllers/suppliersController.js";
import filterAndSort from "../middlewares/filterAndSort.js";
import requirePermission from "../middlewares/requirePermission.js";
import { supplierValidationSchema } from "../services/schemas/supplier.js";

const supplierRouter = express.Router();

supplierRouter.get(
    "/api/suppliers",
    authenticate,
    requirePermission("Supplier", "view"), // Проверяем разрешение на просмотр
    filterAndSort,
    controllers.getAllSuppliers
  );
  supplierRouter.get(
    "/api/suppliersForDictionary",
    authenticate,
    requirePermission("Supplier", "view"), // Проверяем разрешение на просмотр
    controllers.getAllSuppliersForDictionary
  );
  supplierRouter.get(
    "/api/suppliers/search",
    authenticate,
    requirePermission("Supplier", "view"), // Проверяем разрешение на просмотр
    controllers.searchSuppliersByName
  );
  supplierRouter.get(
    "/api/suppliers/:id",
    authenticate,
    requirePermission("Supplier", "view"), // Проверяем разрешение на просмотр
    isValidId,
    controllers.getSupplierByID
  );
  supplierRouter.post(
    "/api/suppliers",
    authenticate,
    requirePermission("Supplier", "create"), // Проверяем разрешение на создание
    validateBody(supplierValidationSchema.createSupplierSchema),
    controllers.createNewSupplier,
  );
  supplierRouter.put(
    "/api/suppliers/:id",
    authenticate,
    isValidId,
    requirePermission("Supplier", "update"), // Проверяем разрешение на обновление
    validateBody(supplierValidationSchema.updateSupplierSchema),
    controllers.updateSupplierByID,
  );
  supplierRouter.delete(
    "/api/suppliers/:id",
    authenticate,
    isValidId,
    requirePermission("Supplier", "delete"), // Проверяем разрешение на обновление
    controllers.deleteSupplier
  );


export default supplierRouter;