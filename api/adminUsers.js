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

const adminUsersRouter = express.Router();

// adminUsersRouter.use(requireAuth, requireRoles(["superadmin", "admin"]));    

adminUsersRouter.get("/", listUsers);
adminUsersRouter.get("/:id", getUserById);
adminUsersRouter.post("/", createUser);
adminUsersRouter.patch("/:id", updateUser);
adminUsersRouter.patch("/:id/password", updateUserPassword);
adminUsersRouter.patch("/:id/roles", requireRoles(["superadmin"]), updateUserRoles);
adminUsersRouter.patch("/:id/sites", updateUserSites);
adminUsersRouter.patch("/:id/deactivate", deactivateUser);
adminUsersRouter.delete("/:id", requireRoles(["superadmin"]), deleteUserHard);

export default adminUsersRouter;
