import mongoose from "mongoose";

const { Schema } = mongoose;

const AssetSchema = new Schema(
  {
    name: { type: String, required: true },

    entityType: {
      type: String,
      enum: ["equipment", "document", "event", "contract", "location"],
      required: true,
    },

    assetCategory: { type: String }, // например: HVAC, Fire Extinguisher, license

    description: { type: String },
    notes: { type: String },

    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
    },

    location: {
      site: String, // название объекта: "Завод №1", "Кампус A", "Офис в Чикаго"
      building: String, // здание: "Корпус B", "Главное здание"
      floor: String, // этаж: "3", "подвал", "Мезонин"
      room: String, // комната: "Кабинет 101", "Лаборатория 2"
      zone: String, // зона: "Зона А", "Зона опасности", "Северное крыло"
      address: {
        street: String,
        city: String,
        state: String,
        country: String,
        postalCode: String,
      },
      gps: {
        lat: Number,
        lng: Number,
      },
    },

    lifecycleStatus: {
      type: String,
      enum: [
        "draft",
        "pending",
        "under_review",
        "active",
        "under_maintenance",
        "suspended",
        "expired",
        "decommissioned",
        "archived",
        "cancelled",
      ],
      default: "active",
    },

    parentEntity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      default: null,
    },
    ancestors: [{ type: mongoose.Schema.Types.ObjectId, ref: "Asset" }],

    // --- Контракт ---
    contractDetails: {
      contractNumber: String,
      contractType: String,
      provider: {
        name: String,
        taxId: String, // ИНН / VAT / налоговый номер (важен для отчётности)
        contactEmail: String,
        contactPhone: String,
        contactPerson: {
          name: String,
          email: String,
          phone: String,
          position: String,
        },
        address: {
          street: String,
          city: String,
          state: String,
          country: String,
          postalCode: String,
        },
        website: String,
        notes: String, // Комментарии, условия работы, примечания
      },
      coverageScope: String,
      serviceLevel: String,
      contractValue: Number,
      currency: String,
      billingCycle: String,
      issuedDate: Date,
      effectiveDate: Date,
      expiryDate: Date,
    },

    // --- Техническое состояние (оборудование) ---
    conditionStatus: {
      type: String,
      enum: ["operational", "faulty", "under_maintenance", "normal"],
    },

    lastInspectionDate: { type: Date },
    nextInspectionDueDate: { type: Date },
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high"],
    },

    effectiveDate: { type: Date },
    expiryDate: { type: Date },

    responsiblePerson: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: String,
      email: String,
      phone: String,
      department: String,
      position: String,
      external: { type: Boolean, default: false }, // если это сторонний подрядчик
      notes: String,
    },

    // --- Документы ---
    fileDetails: {
      fileUrl: String,
      fileType: String,
      uploadedBy: String,
      documentNumber: String,
      documentType: String,
      issuingAuthority: String,
      issuedDate: Date,
      revisionNumber: String,
      uploadedAt: Date,
    },

    // --- События ---
    eventDetails: {
      scheduledDate: Date,
      completedDate: Date,
      eventType: String,
      participants: [
        {
          name: String,
          role: String,
          userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        },
      ],
      performedBy: String,
      result: {
        type: String,
        enum: ["passed", "failed", "postponed", "pending"],
        default: "pending",
      },
      eventOutcomeNotes: String,
    },

    // --- Оборудование ---
    manufacturer: String,
    model: String,
    assetTag: String,
    serialNumber: String,
    installationDate: Date,
    warrantyExpiryDate: Date,

    linkedAssets: [{ type: mongoose.Schema.Types.ObjectId, ref: "Asset" }],

    notificationPreferences: [
      {
        type: {
          type: String,
          enum: [
            "expiryReminder",
            "maintenanceSchedule",
            "inspectionReminder",
            "contractRenewal",
            "warrantyExpiry",
            "licenseRenewal",
            "custom",
          ],
        },
        daysBefore: Number,
        onExactDate: Date,
        repeat: {
          type: String,
          enum: ["none", "daily", "weekly", "monthly", "yearly"],
          default: "none",
        },
        cancelIfLifecycleStatusIn: [String],
      },
    ],

    customFields: { type: Schema.Types.Mixed },
    isDeleted: { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

AssetSchema.index({ name: 1, entityType: 1 }, { unique: true });

const Asset = mongoose.model("Asset", AssetSchema);

export default Asset;
