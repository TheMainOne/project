// models/Client.js
import mongoose from "mongoose";


const WidgetConfigSchema = new mongoose.Schema({
  widgetTitle: { type: String, default: "AI Assistant" },
  welcomeMessage: { type: String, default: "Hi! How can I help you today?" },
  primaryColor: { type: String, default: "#2927ea" },
  backgroundColor: { type: String, default: "#0f0f0f" },
  textColor: { type: String, default: "#ffffff" },
  borderColor: { type: String, default: "#2927ea" },
  logoUrl: { type: String, default: null },
  systemPrompt: { type: String, default: "" },
}, { _id: false });

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
     apiKey: { type: String },          // для Embed Code
       config: { type: WidgetConfigSchema, default: () => ({}) },
  users: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    role: { type: String, enum: ["owner", "admin", "editor", "viewer"], default: "viewer" },
    addedAt: { type: Date, default: Date.now },
  }],

  },
  { timestamps: true, versionKey: false }
);

ClientSchema.index({ slug: 1 }, { unique: true });
ClientSchema.index({ siteId: 1, isActive: 1 });

export default mongoose.model("Client", ClientSchema);
