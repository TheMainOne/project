import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Joi from "joi";

const { Schema } = mongoose;

const emailValidation = /^[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+$/;

// Создаем отдельный под-схему для actions, чтобы можно было гибко добавлять новые действия:
const actionsSchema = new Schema({
  actions: {
    type: Map,
    of: Boolean,
    default: {}
  }
}, { _id: false });

const userSchema = new Schema(
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
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
    },
    surname: {
      type: String,
      required: [true, "Surname is required"],
    },
    locale: {
      type: String,
      default: "en"
    },
    timezone: {
      type: String,
      default: "UTC"
    },
    profile: {
      avatarUrl: { type: String, default: null }
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "inactive", "suspended"]
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    lastLoginAt: {
      type: Date,
      default: null
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
    permissions: {
      type: Map,
      of: actionsSchema,
      default: {}
    },
    preferences: {
      type: Object,
      default: {}
    }
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

// Joi схемы для валидации ввода
const registerSchema = Joi.object({
  email: Joi.string().pattern(emailValidation).required().messages({
    "string.pattern.base": "Email is not valid",
    "string.empty": "Email is required"
  }),
  password: Joi.string().min(6).required().messages({
    "string.min": "Password should be at least 6 characters long",
    "string.empty": "Password is required"
  }),
  name: Joi.string().required().messages({
    "string.empty": "Name is required"
  }),
  surname: Joi.string().required().messages({
    "string.empty": "Surname is required"
  }),
  role: Joi.string().valid("employee", "admin", "manager").default("employee"),
  locale: Joi.string().default("en"),
  timezone: Joi.string().default("UTC"),
  profile: Joi.object({
    avatarUrl: Joi.string().uri().allow(null)
  }).default({}),
  preferences: Joi.object().default({}),
  token: Joi.string().allow(null)
});

const loginSchema = Joi.object({
  email: Joi.string().pattern(emailValidation).required().messages({
    "string.empty": "Email is required",
    "string.pattern.base": "Email is not valid"
  }),
  password: Joi.string().required().messages({
    "string.empty": "Password is required",
    "string.min": "Password should be at least 6 characters long"
  })
});

export const updateUserSchema = Joi.object({
  email: Joi.string().email().optional(),
  name: Joi.string().optional(),
  surname: Joi.string().optional(),
  password: Joi.string().min(6).optional(),
  role: Joi.string().valid("employee", "admin", "manager").optional(),
  locale: Joi.string().optional(),
  timezone: Joi.string().optional(),
  profile: Joi.object({
    avatarUrl: Joi.string().uri().allow(null)
  }).optional(),
  status: Joi.string().valid("active", "inactive", "suspended").optional()
}).min(1); // минимум 1 поле для обновления

export const schemas = {
  registerSchema,
  loginSchema,
  updateUserSchema
};

const User = mongoose.model("User", userSchema);

export default User;
