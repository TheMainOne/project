import jwt from 'jsonwebtoken';
import dotenv from "dotenv";    
import User from "../services/schemas/user.js";
import HttpError from "../middlewares/HttpError.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";

dotenv.config();


const registerUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  const existingUser = await User.findOne({ $or: [{ email }, { name }] });

  if (existingUser) {
    throw HttpError(409, "User with this email or username already exists");
  }

  const newUserData = { name, email, password };
  if (role) {
    newUserData.role = role;
  }

  const newUser = await User.create(newUserData);

  res.status(201).json({
    status: "success",
    code: 201,
    data: {
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
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
        username: user.username,
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
      data: {
        user,
      },
    });
};

export default {
  register: ctrlWrapper(registerUser),
  login: ctrlWrapper(loginUser),
  logout: ctrlWrapper(logoutUser),
  tokenValidation: ctrlWrapper(checkToken),
};
