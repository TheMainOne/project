import express from "express";
import { bulkLookup, getItemById, searchItems } from "../controllers/itemsController.js";

const itemsRouter = express.Router();

itemsRouter.get("/search", searchItems);
itemsRouter.post("/bulk-lookup", bulkLookup);
itemsRouter.get("/:id", getItemById);

export default itemsRouter;