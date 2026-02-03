import express from "express";
import upload from "../middlewares/s3Upload.js";
import { createClientDocument, setClientDocumentActive, deleteClientDocument, countAllClientDocuments } from "../controllers/clientDocumentsController.js";
import {
  createClient,
  getAllClients,
  getClient,
  updateClient,
  deleteClient,
  listClientDocuments,
  listClientUsers
} from "../controllers/clientController.js";
import { getWidgetConfig, upsertWidgetConfig, getPublicWidgetConfig, uploadWidgetFont } from "../controllers/widgetConfigController.js";
import { telemetryEventsByClient, telemetrySummaryByClient } from "../controllers/telemetryController.js";

const clientRouter = express.Router();

clientRouter.post("/", createClient);              // POST /api/clients
clientRouter.get("/", getAllClients);              // GET /api/clients
clientRouter.get("/widget-config", getPublicWidgetConfig);
clientRouter.get("/documents/count", countAllClientDocuments); // count all documents across clients
clientRouter.get("/:id", getClient);         // GET /api/clients/:idOrSlug
clientRouter.post("/:id/documents", upload.single("file"), createClientDocument);
clientRouter.get("/:id/documents", listClientDocuments);
clientRouter.get("/:id/users", listClientUsers);
clientRouter.get("/:id/telemetry/events", telemetryEventsByClient);
clientRouter.get("/:id/telemetry/summary", telemetrySummaryByClient);
clientRouter.put("/:idOrSlug", updateClient);      // PUT /api/clients/:idOrSlug
clientRouter.delete("/:idOrSlug", deleteClient);   // DELETE /api/clients/:idOrSlug
clientRouter.patch("/:id/documents/:docId", setClientDocumentActive); // PATCH /api/clients/:id/documents/:docId
clientRouter.delete("/:id/documents/:docId", deleteClientDocument); // DELETE /api/clients/:id/documents/:docId

// Widget Config routes

clientRouter.get("/:idOrSlug/widget-config", getWidgetConfig);
clientRouter.put("/:idOrSlug/widget-config", upload.single("logo"), upsertWidgetConfig);
clientRouter.post("/:idOrSlug/widget-font", upload.single("font"), uploadWidgetFont);

export default clientRouter;
