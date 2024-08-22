import express from "express";
import { getAllMaterials } from "../controllers/index.js";


// creating a new router
const router = express.Router();


// Assigning new paths for the router
router.get("/", getAllMaterials);


export default router;