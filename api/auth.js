import express from "express";
import { register, login, refresh, logout, me } from "../controllers/authController.js";
import { validate, registerSchema, loginSchema } from "../validators/authValidators.js";
import { requireAuth } from "../middlewares/auth.js";


const authRouter = express.Router();

authRouter.get("/health", (req, res) => {
  res.status(200).send("OK");
});
authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/login", validate(loginSchema), login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);

export default authRouter;
