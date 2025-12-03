import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const SiteAccessSchema = new mongoose.Schema(
  {
    siteId: { type: String, required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    role: {
      type: String,
      enum: ["owner", "admin", "editor", "viewer", "support"],
      default: "viewer"
    },
    permissions: { type: [String], default: [] },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    joinedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:  { type: String, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    roles: { type: [String], default: ["user"] },
    isActive: { type: Boolean, default: true },

    // 🔗 Привязка к сайтам (как и было)
    sites: { type: [SiteAccessSchema], default: [] },
    defaultSiteId: { type: String },

    // 🔗 ССЫЛКА НА КЛИЕНТОВ (новое)
    clientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Client"}],

    tokenVersion: { type: Number, default: 0 },
    emailVerified: { type: Boolean, default: false },

    locale: { type: String, default: "en" },
    timezone: { type: String, default: "UTC" },

    lastLoginAt: { type: Date },
    lastSeenAt: { type: Date },
    loginCount: { type: Number, default: 0 }
  },
  { timestamps: true, versionKey: false }
);

// ——— Индексы ———
UserSchema.index({ "sites.siteId": 1 });
UserSchema.index({ "sites.siteId": 1, _id: 1 });
UserSchema.index({ clientIds: 1 }); // быстрый поиск по клиентам

// Удобная виртуалка: user.clients -> массив документов Client (через populate)
UserSchema.virtual("clients", {
  ref: "Client",
  localField: "clientIds",
  foreignField: "_id",
  justOne: false,
});

// Хеш пароля
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model("User", UserSchema);
