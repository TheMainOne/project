import express from "express";
import {
  createClient,
  getAllClients,
  getClient,
  updateClient,
  deleteClient,
} from "../controllers/clientController.js";

const clientRouter = express.Router();

clientRouter.post("/", createClient);              // POST /api/clients
clientRouter.get("/", getAllClients);              // GET /api/clients
clientRouter.get("/:idOrSlug", getClient);         // GET /api/clients/:idOrSlug
clientRouter.put("/:idOrSlug", updateClient);      // PUT /api/clients/:idOrSlug
clientRouter.delete("/:idOrSlug", deleteClient);   // DELETE /api/clients/:idOrSlug

export default clientRouter;
