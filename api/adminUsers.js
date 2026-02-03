// routes/adminUsers.js
import express from "express";
import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserPassword,
  updateUserRoles,
  updateUserSites,
  deactivateUser,
  deleteUserHard,
} from "../controllers/adminUsersController.js";
import { requireAuth, requireRoles } from "../middlewares/auth.js";
import {
  attachAccessScope,
  enforceSitesPayloadWithinScope,
  enforceUserAccessByParam,
} from "../middlewares/accessScope.js";

const adminUsersRouter = express.Router();

adminUsersRouter.use(requireAuth, attachAccessScope);
adminUsersRouter.param("id", enforceUserAccessByParam());

adminUsersRouter.get("/", listUsers);
adminUsersRouter.get("/:id", getUserById);
adminUsersRouter.post("/", enforceSitesPayloadWithinScope, createUser);
adminUsersRouter.patch("/:id", enforceSitesPayloadWithinScope, updateUser);
adminUsersRouter.patch("/:id/password", updateUserPassword);
adminUsersRouter.patch("/:id/roles", requireRoles(["superadmin"]), updateUserRoles);
adminUsersRouter.patch("/:id/sites", enforceSitesPayloadWithinScope, updateUserSites);
adminUsersRouter.patch("/:id/deactivate", deactivateUser);
adminUsersRouter.delete("/:id", requireRoles(["superadmin"]), deleteUserHard);

export default adminUsersRouter;
