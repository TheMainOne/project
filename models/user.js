import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const SiteAccessSchema = new mongoose.Schema(
  {
    // Твой формат siteId уже есть в виджете: host::label (например, "mysite.com::default")
    siteId: { type: String, required: true, index: true },
    role: {
      type: String,
      enum: ["owner", "admin", "editor", "viewer", "support"],
      default: "viewer"
    },
    // При необходимости — точечные флаги доступа (R/W на конкретные разделы)
    permissions: { type: [String], default: [] }, // напр. ["sessions.read","content.write"]
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    joinedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    roles: { type: [String], default: ["user"] }, // глобальные роли (суперадмин и т.д.)
    isActive: { type: Boolean, default: true },

    // 🔗 Привязка к сайтам (мульти-тенант)
    sites: { type: [SiteAccessSchema], default: [] },
    defaultSiteId: { type: String }, // денормализованно: чем открывать админку по умолчанию

    tokenVersion: { type: Number, default: 0 }, // инкремент — инвалидировать все refresh токены
    emailVerified: { type: Boolean, default: false },

    locale: { type: String, default: "en" },
    timezone: { type: String, default: "UTC" },

    lastLoginAt: { type: Date },
    lastSeenAt: { type: Date },
    loginCount: { type: Number, default: 0 }
  },
  { timestamps: true, versionKey: false }
);

// Индексы
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ "sites.siteId": 1 });               // быстрые проверки членства
UserSchema.index({ "sites.siteId": 1, _id: 1 });        // часто удобно для фильтров

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
