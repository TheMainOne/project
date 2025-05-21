import express from "express";
import controllers from "../controllers/userController.js";
import isValidId from "../middlewares/isValidId.js";
import authenticate from "../middlewares/authenticate.js";
import validateBody from "../middlewares/validateBody.js";
import filterAndSort from "../middlewares/filterAndSort.js";
import { schemas } from "../services/schemas/user.js";

const userRouter = express.Router();

// Assigning new paths for the router
userRouter.get(
  "/api/users",
  authenticate,
  filterAndSort,
  controllers.getAllUsers
);
userRouter.get("/api/users/me", authenticate, controllers.getCurrentUser);
userRouter.get(
  "/api/users/:id",
  authenticate,
  isValidId,
  controllers.getUserById
);
userRouter.post("/api/users/", authenticate, controllers.addNewUser);
userRouter.put(
  "/api/users/:id",
  authenticate,
  isValidId,
  validateBody(schemas.updateUserSchema),
  controllers.updateUserByID
);

export default userRouter;
