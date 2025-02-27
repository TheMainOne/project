import Role from "../services/schemas/role.js";
import User from "../services/schemas/user.js";
import HttpError from "../middlewares/HttpError.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";

const getRoles = async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
  
    if (page <= 0 || limit <= 0) {
      throw HttpError(400, "Page and limit must be positive integers.");
    }
  
    const skip = (page - 1) * limit;

    const results = await Role.find({})
    .sort(req.sort) 
    .collation({ locale: 'en', strength: 2 }) // регистронезависимая сортировка
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
  
    const count = await Role.countDocuments({});
  
    res.json({
      status: "success",
      code: 200,
      data: {
        roles: results,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
      },
    });
  };

const getRoleByID = async (req, res) => {
    const { id } = req.params;
  
    const result = await Role.findById(id, "-createdAt -updatedAt");
  
    if (!result) {
      throw HttpError(404, "Not found");
    }
  
    res.json({
      status: "success",
      code: 200,
      data: { role: result },
    });
  };    

const createRole = async (req, res) => {
  let { name, description, permissions, globalPermissions } = req.body;

  // Проверка обязательного поля name
  if (!name) {
    throw HttpError(400, "The 'name' field is required.");
  }

   // Проверка на дублирование: если роль с таким именем уже существует
   const existingRole = await Role.findOne({ name });
   if (existingRole) {
     throw HttpError(409, `A role with the name '${name}' already exists`);
   }
    // Проверка типа поля permissions
  if (permissions && typeof permissions !== 'object') {
    throw HttpError(400, "The 'permissions' field must be an object");
  }

    // Проверка типа поля globalPermissions, если передано
    if (globalPermissions && typeof globalPermissions !== "object") {
      throw HttpError(400, "The 'globalPermissions' field must be an object");
    }

  // Если создаётся роль "admin", автоматически задаём полный доступ
  if (name.toLowerCase() === "admin") {
    permissions = {
      Dashboard: { view: true, create: true, update: true, delete: true },
      Supplier: { view: true, create: true, update: true, delete: true },
      partManagement: { view: true, create: true, update: true, delete: true }
      // Добавляем другие модули по необходимости
    };
    globalPermissions = {
      canChangeUserRoles: true,
      canViewReports: true,
      canExport: true,
      canEditOwnProfile: true
    };
  }

    // Создание новой роли. Если description или permissions не переданы,
  // будут использованы значения по умолчанию из схемы.
  const role = new Role({ name, description, permissions, globalPermissions });
  await role.save();

    res.status(201).json({
      status: "success",
      code: 201,
      data: {
        role,
      },
    });
  }

  const updateRole = async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

      // Если в теле запроса передается новое имя, проверяем на дублирование
  if (updateData.name) {
    const duplicateRole = await Role.findOne({
      name: updateData.name,
      _id: { $ne: id },
    });
    if (duplicateRole) {
      throw HttpError(409, `A role with the name '${updateData.name}' already exists`);
    }
  }

  // Валидация поля permissions, если оно передано
  if (updateData.permissions && typeof updateData.permissions !== "object") {
    throw HttpError(400, "The 'permissions' field must be an object");
  }

    // Валидация поля globalPermissions, если оно передано
    if (updateData.globalPermissions && typeof updateData.globalPermissions !== "object") {
      throw HttpError(400, "The 'globalPermissions' field must be an object");
    }
  

   // Обновление роли с возвратом нового документа и применением валидаторов
   const updatedRole = await Role.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!updatedRole) {
    throw HttpError(404, "Role not found");
  }
  
  res.status(200).json({
    status: "success",
    code: 200,
    data: { role: updatedRole },
  });
  };   

  const deleteRole = async (req, res) => {
    const { id } = req.params;
  
    // Проверяем, используется ли роль у какого-либо пользователя
    const userWithRole = await User.findOne({ role: id });
    if (userWithRole) {
      throw HttpError(409, "Unable to delete role: role is still in use by users");
    }
  
    // Если роль не используется, пробуем её удалить
    const deletedRole = await Role.findByIdAndDelete(id);
  
    if (!deletedRole) {
      throw HttpError(404, "Role not found");
    }
  
    res.status(200).json({
      status: "success",
      code: 200,
      data: { role: deletedRole },
    });
  };

export default {
    getRoles: ctrlWrapper(getRoles),
    getRoleByID: ctrlWrapper(getRoleByID),
    createRole: ctrlWrapper(createRole),
    updateRole: ctrlWrapper(updateRole),
    deleteRole: ctrlWrapper(deleteRole),
  };