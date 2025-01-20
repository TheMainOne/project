import express from "express";
import controllers from "../controllers/userController.js";
import isValidId from "../middlewares/isValidId.js";
import authenticate from "../middlewares/authenticate.js";

const userRouter = express.Router(); 

// Assigning new paths for the router
userRouter.get("/api/users", authenticate, controllers.getAllUsers);
userRouter.get("/api/users/:id", authenticate, isValidId, controllers.getUserById);
userRouter.post("/api/users/", authenticate, controllers.addNewUser);

export default userRouter;
