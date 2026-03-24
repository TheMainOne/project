import express from "express";
import {
  bulkLookup,
  bulkComponentSuppliersLookup,
  getItemById,
  searchItems
} from "../../controllers/itemsController.js";

const itemsRouter = express.Router();

itemsRouter.get("/search", searchItems);
itemsRouter.post("/bulk-lookup", bulkLookup);
itemsRouter.post("/bulk-component-suppliers", bulkComponentSuppliersLookup);
itemsRouter.get("/:id", getItemById);

export default itemsRouter;