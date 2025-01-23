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

  // Хеширование пароля
  const hashedPassword = await bcrypt.hash(temporaryPassword, 10);


  // Создаем нового пользователя
  const newUser = new User({
    email,
    password: hashedPassword,
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

  await sendEmail({ to: email, subject: emailSubject, text: emailBody });

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
        id: newUser._id,
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

export default {
    getAllUsers: ctrlWrapper(getUserList),
    getUserById: ctrlWrapper(getUserByID),
    addNewUser: ctrlWrapper(addNewUser),
  };
  