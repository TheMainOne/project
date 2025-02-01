import express from "express";
import authenticate from "../middlewares/authenticate.js";
import isValidId from "../middlewares/isValidId.js";
import validateBody from "../middlewares/validateBody.js";
import controllers from "../controllers/suppliersController.js";
import filterAndSort from "../middlewares/filterAndSort.js";
import { supplierValidationSchema } from "../services/schemas/supplier.js";

const supplierRouter = express.Router();

supplierRouter.get(
    "/api/suppliers",
    authenticate, filterAndSort,
    controllers.getAllSuppliers
  );
  supplierRouter.get(
    "/api/suppliersForDictionary",
    authenticate,
    controllers.getAllSuppliersForDictionary
  );
  supplierRouter.get(
    "/api/suppliers/search",
    authenticate,
    controllers.searchSuppliersByName
  );
  supplierRouter.get(
    "/api/suppliers/:id",
    authenticate,
    isValidId,
    controllers.getSupplierByID
  );
  supplierRouter.post(
    "/api/suppliers",
    authenticate,
    validateBody(supplierValidationSchema.createSupplierSchema),
    controllers.createNewSupplier,
  );
  supplierRouter.put(
    "/api/suppliers/:id",
    authenticate,
    isValidId,
    validateBody(supplierValidationSchema.updateSupplierSchema),
    controllers.updateSupplierByID,
  );
  supplierRouter.delete(
    "/api/suppliers/:id",
    authenticate,
    isValidId,
    controllers.deleteSupplier
  );


export default supplierRouter;