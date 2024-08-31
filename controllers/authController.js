import jwt from 'jsonwebtoken';
import User from "../services/schemas/user.js";
import HttpError from "../middlewares/HttpError.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";

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
        id: user._id,
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

export default {
  register: ctrlWrapper(registerUser),
  login: ctrlWrapper(loginUser),
  logout: ctrlWrapper(logoutUser)
};
