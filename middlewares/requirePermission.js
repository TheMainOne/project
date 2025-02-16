import Role from "../services/schemas/role.js";
import HttpError from "./HttpError.js";

/**
 * Middleware для проверки разрешений.
 * @param {String} moduleName - Название модуля (например, "Dashboard", "Supplier", "partManagement")
 * @param {String} action - Действие (например, "view", "create", "update", "delete")
 */
function requirePermission(moduleName, action) {
  return async (req, res, next) => {
    try {
      // Дополнительная проверка аутентификации
      if (!req.user) {
        throw HttpError(401, "Not authenticated");
      }

      const user = req.user;

      const role = await Role.findById(req.user.role);
      if (!role) {
        throw HttpError(403, "No role assigned to the user");
      }
      // Получаем разрешения для указанного модуля из Map
      const modulePermissions = role.permissions.get(moduleName);
      if (modulePermissions && modulePermissions[action]) {
        return next();
      } else {
        throw HttpError(403, "Insufficient permissions");
      }
    } catch (error) {
      next(error);
    }
  };
}

export default requirePermission;
