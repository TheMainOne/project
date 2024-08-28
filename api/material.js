import express from "express";
import controllers from "../controllers/index.js";


// creating a new router
const router = express.Router();


// Assigning new paths for the router
router.get("/", controllers.getAll);
router.get("/:id", controllers.getById);



export default router;