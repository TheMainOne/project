import express from "express";
import passport from 'passport';
import controllers from "../controllers/authController.js";
import "../services/passport/passport.js"

const authRouter = express.Router();
const authenticate = passport.authenticate('jwt', { session: false });

authRouter.post('/register', controllers.register);
authRouter.post('/login', controllers.login);
authRouter.post("/logout", authenticate, controllers.logout);

export default authRouter;