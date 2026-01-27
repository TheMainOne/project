import express from "express";
import {
  createNotificationDestination,
  listNotificationDestinations,
  getNotificationDestination,
  updateNotificationDestination,
  deleteNotificationDestination,
} from "../controllers/notificationDestinationsController.js";

const notificationDestinationsRouter = express.Router();

notificationDestinationsRouter.post("/", createNotificationDestination);
notificationDestinationsRouter.get("/", listNotificationDestinations);
notificationDestinationsRouter.get("/:id", getNotificationDestination);
notificationDestinationsRouter.patch("/:id", updateNotificationDestination);
notificationDestinationsRouter.delete("/:id", deleteNotificationDestination);

export default notificationDestinationsRouter;

