import express from "express";
import controllers from "../controllers/authController.js";
import authenticate from "../middlewares/authenticate.js";
import "../services/passport/passport.js";

const authRouter = express.Router();

authRouter.post("/signup", controllers.register);
authRouter.post("/login", controllers.login);
authRouter.post("/logout", authenticate, controllers.logout);
authRouter.post("/token", controllers.tokenValidation);

export default authRouter;
