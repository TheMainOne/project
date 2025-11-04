import express from "express";
import { createClient } from "../controllers/clientController.js";

const clientRouter = express.Router();


// Требуем авторизацию (замени на свою миддлварь)
router.post("/createClient", /* requireAuth, */ createClient);

export default clientRouter;