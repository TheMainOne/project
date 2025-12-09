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

/* ========= NEW: companyInfo ========= */

const CompanyEmailSchema = new mongoose.Schema({
  label: { type: String, trim: true },            // "General", "Sales", "Support"
  address: { type: String, trim: true },
  isPrimary: { type: Boolean, default: false },
}, { _id: false });

const CompanyPhoneSchema = new mongoose.Schema({
  label: { type: String, trim: true },            // "Main", "Sales", "Support"
  number: { type: String, trim: true },
  isPrimary: { type: Boolean, default: false },
}, { _id: false });

const CompanyAddressSchema = new mongoose.Schema({
  label: { type: String, trim: true },            // "HQ", "Office", "Warehouse"
  country: { type: String, trim: true },
  state: { type: String, trim: true },
  city: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  addressLine1: { type: String, trim: true },
  addressLine2: { type: String, trim: true },
}, { _id: false });

const CompanyBusinessHoursSchema = new mongoose.Schema({
  label: { type: String, trim: true },            // "Main office hours"
  days: [{ type: String, trim: true }],           // ["Mon-Fri"], или ["Mon","Tue",...]
  openTime: { type: String, trim: true },         // "09:00"
  closeTime: { type: String, trim: true },        // "18:00"
  timezone: { type: String, trim: true },         // "Europe/Riga"
}, { _id: false });

const CompanySocialLinksSchema = new mongoose.Schema({
  website: { type: String, trim: true },
  linkedin: { type: String, trim: true },
  instagram: { type: String, trim: true },
  facebook: { type: String, trim: true },
  twitter: { type: String, trim: true },
  youtube: { type: String, trim: true },
  tiktok: { type: String, trim: true },
  telegram: { type: String, trim: true },
  whatsapp: { type: String, trim: true },
}, { _id: false });

const CompanyInfoSchema = new mongoose.Schema({
  // Базовая инфа
  legalName: { type: String, trim: true },        // "Zorka.Agency SIA"
  brandName: { type: String, trim: true },        // "Zorka.Agency"
  shortDescription: { type: String, trim: true }, // 1–2 предложения "кто мы"
  tagline: { type: String, trim: true },          // "Smart. Efficient. Worldwide."

  industries: [{ type: String, trim: true }],     // ["Marketing", "Gaming", "SaaS"]
  regionsServed: [{ type: String, trim: true }],  // ["USA", "EU", "MENA", ...]
  languages: [{ type: String, trim: true }],      // ["English", "Russian", "Spanish"]

  // Контакты
  emails: { type: [CompanyEmailSchema], default: [] },
  phones: { type: [CompanyPhoneSchema], default: [] },

  // Адреса / офисы / склады
  addresses: { type: [CompanyAddressSchema], default: [] },

  // График работы
  businessHours: { type: [CompanyBusinessHoursSchema], default: [] },

  // Соцсети, сайт и пр.
  social: { type: CompanySocialLinksSchema, default: () => ({}) },

  // Доп. свободные поля на будущее
  notes: { type: String, trim: true },
  meta: {
    type: Map,
    of: String,                                   // любое key-value: "support_form_url" и т.п.
    default: () => ({}),
  },
}, { _id: false });

/* ========= Client ========= */

const ClientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    siteId: { type: String, required: true, index: true }, // например: "SITE_123"

    isActive: { type: Boolean, default: true },
    apiKey: { type: String },

    config: { type: WidgetConfigSchema, default: () => ({}) },

    // NEW: companyInfo
    companyInfo: { type: CompanyInfoSchema, default: () => ({}) },

    users: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      role: {
        type: String,
        enum: ["owner", "admin", "editor", "viewer"],
        default: "viewer",
      },
      addedAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true, versionKey: false }
);

ClientSchema.index({ siteId: 1, isActive: 1 });

export default mongoose.model("Client", ClientSchema);
