import express from "express";
import upload from "../middlewares/s3Upload.js";
import { requireAuth } from "../middlewares/auth.js";
import { attachAccessScope, enforceClientAccessByParam } from "../middlewares/accessScope.js";
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
import {
  listWidgetDemoScripts,
  getWidgetDemoScript,
  upsertWidgetDemoScript,
  setWidgetDemoScriptEnabled,
  deleteWidgetDemoScript,
} from "../controllers/widgetDemoScriptController.js";
import { telemetryEventsByClient, telemetrySummaryByClient } from "../controllers/telemetryController.js";

const clientRouter = express.Router();

clientRouter.get("/widget-config", getPublicWidgetConfig);

clientRouter.use(requireAuth, attachAccessScope);
clientRouter.param("id", enforceClientAccessByParam());
clientRouter.param("idOrSlug", enforceClientAccessByParam());

clientRouter.post("/", createClient);              // POST /api/clients
clientRouter.get("/", getAllClients);              // GET /api/clients
clientRouter.get("/documents/count", countAllClientDocuments); // count all documents across clients
clientRouter.get("/widget-demo-scripts", listWidgetDemoScripts);
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
clientRouter.get("/:idOrSlug/widget-demo-script", getWidgetDemoScript);
clientRouter.put("/:idOrSlug/widget-demo-script", upsertWidgetDemoScript);
clientRouter.patch("/:idOrSlug/widget-demo-script/enabled", setWidgetDemoScriptEnabled);
clientRouter.delete("/:idOrSlug/widget-demo-script", deleteWidgetDemoScript);

export default clientRouter;
