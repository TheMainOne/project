import express from "express";
import controllers from "../controllers/roleController.js";
import isValidId from "../middlewares/isValidId.js";
import validateBody from "../middlewares/validateBody.js";
import authenticate from "../middlewares/authenticate.js";

const roleRouter = express.Router();

roleRouter.get("/api/roles", authenticate, controllers.getRoles);
roleRouter.get("/api/roles/:id", authenticate, isValidId, controllers.getRoleByID);
roleRouter.post(
    "/api/roles",
    authenticate,
    controllers.createRole
  );
  roleRouter.put(
    "/api/roles/:id",
    authenticate,
    isValidId,
    controllers.updateRole
  );
  roleRouter.delete("/api/roles/:id", authenticate, isValidId, controllers.deleteRole);


export default roleRouter;