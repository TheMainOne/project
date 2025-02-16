import mongoose from "mongoose";

const { Schema } = mongoose;

// Под-схема для разрешений в одном модуле
const permissionSchema = new Schema({
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  }, { _id: false });
  

  // Схема роли
const roleSchema = new Schema({
    // Уникальное имя роли (например, "admin", "manager", "employee")
    name: {
      type: String,
      unique: true,
      required: true,
    },
    // Описание роли
    description: {
      type: String,
      default: "",
    },
    // Карта разрешений: ключ – название модуля (например, "Dashboard", "Supplier", "partManagement"),
    // значение – объект с разрешениями для данного модуля
    permissions: {
      type: Map,
      of: permissionSchema,
      default: {},
    },
    globalPermissions: {
      canChangeUserRoles: { type: Boolean, default: false },
      canViewReports: { type: Boolean, default: false },
      canExport: { type: Boolean, default: false },
      canEditOwnProfile: { type: Boolean, default: false },
      // можно добавить другие глобальные разрешения
    }
  }, {
    timestamps: true,
    versionKey: false,
  });
  
  const Role = mongoose.model("Role", roleSchema);
  
  export default Role;