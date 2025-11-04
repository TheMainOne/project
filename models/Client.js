// models/Client.js
import mongoose from "mongoose";

const ClientSchema = new mongoose.Schema(
  {
    // Человекочитаемое имя
    name: { type: String, required: true, trim: true },

    // Короткий уникальный идентификатор для URL /demo/:slug
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

    // Технический идентификатор "сайта/тенанта" — по нему копятся статы
    siteId: { type: String, required: true, index: true }, // например: "SITE_123"

    // Состояние
    isActive: { type: Boolean, default: true },

    // Любые настройки клиента (логотипы, цвета, конфиг виджета и т.п.)
    config: {
      logoUrl: String,
      accentColor: String,
      widget: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

ClientSchema.index({ slug: 1 }, { unique: true });
ClientSchema.index({ siteId: 1, isActive: 1 });

export default mongoose.model("Client", ClientSchema);
