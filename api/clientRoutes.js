import express from "express";
import {
  createClient,
  getAllClients,
  getClient,
  updateClient,
  deleteClient,
  listClientDocuments,
  listClientUsers
} from "../controllers/clientController.js";

const clientRouter = express.Router();

clientRouter.post("/", createClient);              // POST /api/clients
clientRouter.get("/", getAllClients);              // GET /api/clients
clientRouter.get("/:id", getClient);         // GET /api/clients/:idOrSlug
clientRouter.get("/:id/documents", listClientDocuments);
clientRouter.get("/:id/users", listClientUsers);
clientRouter.put("/:idOrSlug", updateClient);      // PUT /api/clients/:idOrSlug
clientRouter.delete("/:idOrSlug", deleteClient);   // DELETE /api/clients/:idOrSlug

export default clientRouter;
