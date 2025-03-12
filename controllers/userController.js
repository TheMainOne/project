import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../services/schemas/user.js";
import Role from "../services/schemas/role.js";
import HttpError from "../middlewares/HttpError.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import logAction from "../utils/logAction.js";
import sendEmail from "../utils/sendEmail.js";

const getUserList = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  if (page <= 0 || limit <= 0) {
    throw HttpError(400, "Page and limit must be positive integers.");
  }

  const skip = (page - 1) * limit;

      // Используем фильтры и сортировку, переданные через middleware
      const filter = req.filter || {};
      const sort = req.sort || { createdAt: -1 }; // Сортировка по умолчанию по дате создания

 // Применяем фильтрацию и сортировку
 const results = await User.find(filter)
 .populate("role", "name")
 .sort(sort)
 .skip(skip)
 .limit(limit)
 .lean()
 .exec();

  //  // Добавляем новое поле roleName, если роль подгружена
  //  const usersWithRoleName = results.map(user => ({
  //   ...user,
  //   roleName: user.role ? user.role.name : null
  // }));


  const count = await User.countDocuments(filter);

  res.json({
    status: "success",
    code: 200,
    data: {
      users: results,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    },
  });
};

const getUserByID = async (req, res) => {
    const { id } = req.params;
  
    const result = await User.findById(id, "-createdAt -updatedAt");
  
    if (!result) {
      throw HttpError(404, "Not found");
    }
  
    res.json({
      status: "success",
      code: 200,
      data: { user: result },
    });
  };    
  
const addNewUser = async (req, res) => {
  const { email, name, surname, locale, timezone, profile, status } = req.body;
  let { role } = req.body;

  // Проверка на обязательные поля
  if (!email || !name || !surname) {
    throw HttpError(400, "Email, name, and surname are required.");
  }

  // Проверка на существующий email
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw HttpError(409, "Email already exists.");
  }

  // Генерация случайного пароля
  const temporaryPassword = crypto.randomBytes(8).toString("hex");
console.log(temporaryPassword)
  // Создаем нового пользователя

  // Если поле role передано (как строка), ищем роль по имени (регистронезависимо)
  if (role) {
    const roleDoc = await Role.findOne({
      name: { $regex: `^${role}$`, $options: "i" }
    });
    if (!roleDoc) {
      throw HttpError(404, `Role with name '${role}' not found`);
    }
    role = roleDoc._id;
  } 

  const newUserData = {
    email,
    password: temporaryPassword,
    name,
    surname,
    role,
    locale: locale || "en",
    timezone: timezone || "UTC",
    profile: profile || { avatarUrl: null },
    status: status || "active",
  };

  // Создаем нового пользователя
  const newUser = new User(newUserData);
  await newUser.save();

  // Отправка email с временным паролем 
  const emailSubject = "Welcome to Our Application!";
  const emailBody = `Hello ${name} ${surname},\n\nYour account has been created successfully. Here are your login details:\n\nEmail: ${email}\nTemporary Password: ${temporaryPassword}\n\nPlease log in and change your password as soon as possible.\n\nBest regards,\nYour Application team`;

  // await sendEmail({ to: email, subject: emailSubject, text: emailBody });

  // Логируем действие
  await logAction({
    userId: req.user._id, // ID текущего пользователя
    action: "create",
    entityType: "User",
    entityId: newUser._id,
    newData: newUser.toObject(),
  });

  res.status(201).json({
    status: "success",
    code: 201,
    data: {
      user: {
        _id: newUser._id,
        email: newUser.email,
        password: temporaryPassword, // для отладки; в продакшене пароль не возвращают
        name: newUser.name,
        surname: newUser.surname,
        role: newUser.role,
        locale: newUser.locale,
        timezone: newUser.timezone,
        status: newUser.status,
        emailVerified: newUser.emailVerified,
      },
    },
  });
};  

// const updateUserByID = async (req, res) => {
//   const { id } = req.params;
//   const updateData = req.body; // поля, которые хотим изменить

//   // 1. Ищем пользователя
//   const user = await User.findById(id);
//   if (!user) {
//     throw HttpError(404, "User not found");
//   }

//   // 2. Если в теле запроса пришёл новый email — проверяем, нет ли конфликта
//   if (updateData.email && updateData.email !== user.email) {
//     const existingUser = await User.findOne({ email: updateData.email });
//     if (existingUser && existingUser._id.toString() !== id) {
//       throw HttpError(409, "Email already in use");
//     }
//   }

//    // 3. Получаем роль текущего пользователя из базы для проверки глобальных разрешений
//    const currentUserRole = await Role.findById(req.user.role);
//    if (!currentUserRole) {
//      throw HttpError(403, "Current user's role not found");
//    }
 

//  // 4. Проверка прав обновления
//  if (req.user._id.toString() === id) {
//   // Если пользователь обновляет свою учётную запись:
//   // Проверяем, имеет ли он право редактировать свою учётную запись
//   if (
//     !currentUserRole.globalPermissions ||
//     !currentUserRole.globalPermissions.canEditOwnProfile
//   ) {
//     throw HttpError(403, "You are not allowed to edit your profile");
//   }
//   // Даже если в запросе передана роль, её игнорируем (изменять свою роль нельзя)
//   if (updateData.role) {
//     delete updateData.role;
//   }
// } else {
//   // Если обновляются данные другого пользователя:
//   if (
//     !currentUserRole.globalPermissions ||
//     !currentUserRole.globalPermissions.canChangeUserRoles
//   ) {
//     throw HttpError(403, "You are not allowed to update other users' data");
//   }
//   // Если передана роль, проверяем, что она существует и приводим к ObjectId
//   if (updateData.role) {
//     const newRole = await Role.findById(updateData.role);
//     if (!newRole) {
//       throw HttpError(404, "Role not found");
//     }
//     updateData.role = newRole._id;
//   }
// }

//   // 5. Обновляем поля пользователя
//   //    (Object.assign выполняет «частичное обновление»: не изменяем те поля, которых нет в updateData)
//    Object.assign(user, updateData);

//   // 6. Сохраняем. Это вызовет userSchema.pre('save'), если изменили пароль
//   await user.save();

//   // 7. Логируем действие
//   //    Например, пишем, что пользователь с id = req.user._id обновил пользователя user._id
  // await logAction({
  //   userId: req.user._id,
  //   action: "update",
  //   entityType: "User",
  //   entityId: user._id,
  //   newData: user.toObject(),
  // });

//   // 8. Возвращаем ответ
//  //  Формируем безопасный ответ (без пароля, токена и прочих конфиденциальных данных)
//   const { password, token, ...safeUserData } = user.toObject();

//   res.json({
//     status: "success",
//     code: 200,
//     data: {
//       user: safeUserData, 
//     },
//   });
// };

const updateUserByID = async (req, res) => {
  const { id } = req.params;
  const updateData = { ...req.body };

  // 1. Ищем пользователя
  const user = await User.findById(id);
  if (!user) {
    throw HttpError(404, "User not found");
  }

  // 2. Проверка на уникальность email
  if (updateData.email) {
    const existingUser = await User.findOne({ email: updateData.email });
    if (existingUser && existingUser._id.toString() !== id) {
      throw HttpError(409, "Email already in use");
    }
  }

  // 3. Получаем роль текущего пользователя (тот, кто отправил запрос)
  const currentUserRole = await Role.findById(req.user.role);
  if (!currentUserRole) {
    throw HttpError(403, "Your role does not exist");
  }

  // 3. Проверка разрешений текущего пользователя
  if (req.user._id.toString() === id) {
    // Пользователь редактирует сам себя
    if (
      !currentUserRole.globalPermissions ||
      !currentUserRole.globalPermissions.canEditOwnProfile
    ) {
      throw HttpError(403, "You are not allowed to edit your profile");
    }
  } else {
    // Если обновляется другой пользователь
    if (
      !currentUserRole.globalPermissions ||
      !currentUserRole.globalPermissions.canChangeUserRoles
    ) {
      throw HttpError(403, "You are not allowed to update other users' data");
    }
  }

  // 4. Проверяем и конвертируем роль, если передано имя роли
  if (updateData.role && typeof updateData.role === "string") {
    const roleFromDB = await Role.findOne({ name: updateData.role });
    if (!roleFromDB) {
      throw HttpError(400, `Role '${updateData.role}' does not exist`);
    }
    updateData.role = roleFromDB._id; // Меняем название на ObjectId
  }

  // 5. Частичное обновление данных пользователя
  Object.assign(user, updateData);

  // 6. Сохраняем обновлённого пользователя
  await user.save();

  // 7. Логируем действие
  await logAction({
    userId: req.user._id,
    action: "update",
    entityType: "User",
    entityId: user._id,
    newData: user.toObject(),
  });

  // 7. Безопасный ответ
  const { password, token, ...safeUserData } = user.toObject();

  res.json({
    status: "success",
    data: safeUserData,
  });
};

export default {
    getAllUsers: ctrlWrapper(getUserList),
    getUserById: ctrlWrapper(getUserByID),
    addNewUser: ctrlWrapper(addNewUser),
    updateUserByID: ctrlWrapper(updateUserByID),
  };
  