import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../services/schemas/user.js";
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

  const results = await User.find({}).skip(skip).limit(limit).exec();

  const count = await User.countDocuments();

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
  const { email, name, surname, role, locale, timezone, profile, status } = req.body;

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

  // Создаем нового пользователя
  const newUser = new User({
    email,
    password: temporaryPassword,
    name,
    surname,
    role: role || "employee", // Роль по умолчанию
    locale: locale || "en", // Язык по умолчанию
    timezone: timezone || "UTC", // Часовой пояс по умолчанию
    profile: profile || { avatarUrl: null },
    status: status || "active", // Статус по умолчанию
  });

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

const updateUserByID = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body; // поля, которые хотим изменить

  // 1. Ищем пользователя
  const user = await User.findById(id);
  if (!user) {
    throw HttpError(404, "User not found");
  }

  // 2. Если в теле запроса пришёл новый email — проверяем, нет ли конфликта
  if (updateData.email && updateData.email !== user.email) {
    const existingUser = await User.findOne({ email: updateData.email });
    if (existingUser && existingUser._id.toString() !== id) {
      throw HttpError(409, "Email already in use");
    }
  }

  // 3. Проверка роли 
  //    только админ может менять role других пользователей
  // if (!req.user || req.user.role !== "admin") {
  //   // Если не админ, удаляем из updateData поле role
  //   delete updateData.role;
  // }

  // 4. Обновляем поля пользователя
  //    (Object.assign выполняет «частичное обновление»: не изменяем те поля, которых нет в updateData)
  Object.assign(user, updateData);

  // 5. Сохраняем. Это вызовет userSchema.pre('save'), если изменили пароль
  await user.save();

  // 6. Логируем действие
  //    Например, пишем, что пользователь с id = req.user._id обновил пользователя user._id
  await logAction({
    userId: req.user._id,
    action: "update",
    entityType: "User",
    entityId: user._id,
    newData: user.toObject(),
  });

  // 7. Возвращаем ответ
  //    Не включаем password, token, и прочие поля, которые не хотим показывать
  const { password, token, ...safeUserData } = user.toObject();

  res.json({
    status: "success",
    code: 200,
    data: {
      user: safeUserData, 
    },
  });
};

export default {
    getAllUsers: ctrlWrapper(getUserList),
    getUserById: ctrlWrapper(getUserByID),
    addNewUser: ctrlWrapper(addNewUser),
    updateUserByID: ctrlWrapper(updateUserByID),
  };
  