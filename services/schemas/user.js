import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Joi from "joi";

const emailValidation = /^[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+$/;

const userSchema = new mongoose.Schema(
  {
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    email: {
      type: String,
      match: emailValidation,
      unique: true,
      required: [true, "Email is required"],
    },
    name: {
      type: String,
      required: [true, "Name is required"],
    },
    role: {
      type: String,
      enum: ["employee", "admin", "manager"],
      default: "employee",
    },
    token: {
      type: String,
      default: null,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

// Хеширование пароля перед сохранением
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Метод для проверки пароля при логине
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const registerSchema = Joi.object({
  password: Joi.string().required(),
  email: Joi.string().pattern(emailValidation).required(),
  name: Joi.string().required(),
  role: Joi.string().valid("employee", "admin", "manager").default("employee"),
  token: Joi.string().allow(null),
});

const loginSchema = Joi.object({
  email: Joi.string().pattern(emailValidation).required(),
  password: Joi.string().min(6).required(),
});

export const schemas = {
  registerSchema,
  loginSchema,
};

const User = mongoose.model("User", userSchema);

export default User;
