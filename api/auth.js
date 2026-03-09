import express from "express";
import { register, login, googleLogin, refresh, logout, me, issueExtensionToken } from "../controllers/authController.js";
import { validate, registerSchema, loginSchema, googleSchema, extensionTokenSchema } from "../validators/authValidators.js";
import { requireAuth } from "../middlewares/auth.js";


const authRouter = express.Router();

authRouter.get("/health", (req, res) => {
  res.status(200).send("OK");
});
authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/login", validate(loginSchema), login);
authRouter.post("/google", validate(googleSchema), googleLogin);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
authRouter.post("/extension-token", requireAuth, validate(extensionTokenSchema), issueExtensionToken);

export default authRouter;
