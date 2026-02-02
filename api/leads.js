import express from "express";
import {
  listLeads,
  getLeadById,
  updateLead,
  deleteLead,
} from "../controllers/leadsController.js";

const leadsRouter = express.Router();

leadsRouter.get("/", listLeads);
leadsRouter.get("/:id", getLeadById);
leadsRouter.patch("/:id", updateLead);
leadsRouter.delete("/:id", deleteLead);

export default leadsRouter;
