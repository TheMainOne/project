import express from "express";
import controllers from "../controllers/authController.js";
import authenticate from "../middlewares/authenticate.js";
import validateBody from "../middlewares/validateBody.js";
import { schemas } from "../services/schemas/user.js";
import "../services/passport/passport.js";

const authRouter = express.Router();

authRouter.post("/signup", authenticate, validateBody(schemas.registerSchema), controllers.register);
authRouter.post("/login", validateBody(schemas.loginSchema), controllers.login);
authRouter.post("/logout", authenticate, controllers.logout);
authRouter.post("/token", controllers.tokenValidation);

export default authRouter;
