import jwt from 'jsonwebtoken';
import dotenv from "dotenv";    
import User from "../services/schemas/user.js";
import HttpError from "../middlewares/HttpError.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import logAction from "../utils/logAction.js"

dotenv.config();

const registerUser = async (req, res) => {
  const {
    email,
    password,
    name,
    surname,
    role,
    locale,
    timezone,
    profile,
    preferences
  } = req.body;

  const userId = req.user._id;

  // Проверяем, не существует ли уже пользователь с таким email
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw HttpError(409, "User with this email already exists");
  }

  // Формируем данные для нового пользователя
  const newUserData = {
    email,
    password,
    name,
    surname,
    // Инициализируем permissions (базовые права)
    permissions: {
      // Ключ - ресурс, значение - объект с actions
      "materials": {
        actions: {
          read: true,
          edit: false,
          delete: false
        }
      }
    }
  };

  // Устанавливаем опциональные поля, если они переданы
  if (role) newUserData.role = role;
  if (locale) newUserData.locale = locale;
  if (timezone) newUserData.timezone = timezone;
  if (profile) newUserData.profile = profile;
  if (preferences) newUserData.preferences = preferences;

  const newUser = await User.create(newUserData);

  // используем переменную userData чтобы с помощью функции toObject переобразовать permissions и actions (которые в схеме БД определены как MAP) в обычный объект.
  const userData = newUser.toObject({ flattenMaps: true });

   // Логируем создание нового пользователя
   await logAction({
    userId,
    action: 'create',
    entityType: 'User',
    entityId: newUser._id.toString(),
    oldData: null,
    newData: newUser.toObject()
  });

  // Возвращаем данные о созданном пользователе
  res.status(201).json({
    status: "success",
    code: 201,
    data: {
      user: {
        id: userData._id,
        name: userData.name,
        surname: userData.surname,
        email: userData.email,
        role: userData.role,
        locale: userData.locale,
        timezone: userData.timezone,
        profile: userData.profile,
        preferences: userData.preferences,
        permissions: userData.permissions
      },
    },
  });
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user || !(await user.comparePassword(password))) {
    throw HttpError(401, 'Incorrect email or password');
  }

  const token = jwt.sign({ id: user._id }, process.env.SECRET_KEY, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  user.token = token;
  await user.save();

  res.status(200).json({
    status: 'success',
    code: 200,
    data: {
      user: {
        _id: user._id,
        name: user.name,
        surname: user.surname,
        email: user.email,
        role: user.role,
      },
      token,
    },
  });
};

const logoutUser = async (req, res) => {
  const { id } = req.user;

  await User.findByIdAndUpdate(id, { token: null });

  res.status(200).json({
    status: 'success',
    code: 200,
    message: 'Successfully logged out',
  });
};


const checkToken = async (req, res) => {
    // Получаем токен из заголовка Authorization
    const token = req.headers.authorization?.split(' ')[1]; // Bearer <token>

    if (!token) {
      throw HttpError(401, "Please provide token in the headers of your request");
    }

    // Проверяем валидность токена
    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    // Получаем данные пользователя из базы по ID из токена
    const user = await User.findById(decoded.id).select('-password -createdAt -updatedAt'); 

    if (!user) {
      throw HttpError(404, "The user with the provided token has not been found");
    }



    res.status(200).json({
      status: 'success',
      code: 200,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          role: user.role,
        }
      },
    });
};

export default {
  register: ctrlWrapper(registerUser),
  login: ctrlWrapper(loginUser),
  logout: ctrlWrapper(logoutUser),
  tokenValidation: ctrlWrapper(checkToken),
};
