import mongoose from "mongoose";
import Joi from "joi";

const UploadedBySchema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true },
    role: { type: String, required: true },
  },
  { _id: true }
);

const DocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    fileUrl: { type: String, required: true }, // Ссылка на документ
    originalName: { type: String, required: true },
    contentType: { type: String, required: true },
    attachments: [{ type: String }], // Ссылки на дополнительные файлы
    materialIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Material",
        required: false,
      },
    ], // связь с одним или несколькими материалами
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: false,
    }, // Связь с поставщиком
    regulations: [
      {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Regulation",
          required: true,
        },
        status: {
          type: String,
          enum: [
            "comply",
            "does_not_comply",
            "pending",
            "na",
            "comply_with_exceptions",
          ],
          required: true,
        },
      },
      { _id: false },
    ],
    applyToAllSupplierMaterials: { type: Boolean, default: false }, // Применение ко всем материалам поставщика
    type: {
      type: String,
      enum: [
        "certificate",
        "contract",
        "instruction",
        "other",
        "statement",
        "safety_data_sheet",
        "technical_data_sheet",
        "manual",
        "report",
        "specification",
        "license",
        "declaration",
      ],
      default: "other",
    }, // Тип документа
    effectiveDate: { type: Date, required: false },
    expiryDate: { type: Date, required: false },
    notificationPreferences: {
      type: [
        {
          daysBefore: { type: Number }, // За сколько дней до события
          onExactDate: { type: Date }, // Альтернатива daysBefore — точная дата

          repeat: {
            type: String,
            enum: ["none", "daily", "weekly", "monthly"],
            default: "none",
          },

          cancelAfterDate: { type: Date }, // После этой даты уведомления не отправляются
          cancelIfStatusChanged: { type: String }, // Если статус документа изменился — прекратить

          lastTriggeredAt: { type: Date }, // Когда последний раз сработало уведомление
          disabled: { type: Boolean, default: false }, // Чтобы больше не проверять (если всё уже отправлено)

          methods: {
            type: [String],
            enum: ["email", "telegram", "in_app"],
            default: ["in_app"],
          },

          recipients: [
            {
              userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true,
              },
              name: String,
              role: String,
            },
          ],

          eventType: {
            type: String,
            enum: [
              "expiry",
              "check_due",
              "license_renewal",
              "procedure_update",
              "document_update",
              "compliance_deadline",
              "custom",
            ],
            default: "expiry",
          },

          priority: {
            type: String,
            enum: ["low", "normal", "high"],
            default: "low",
          },
        },
      ],
      default: [],
    },
    documentNumber: { type: String, required: false },
    description: { type: String, required: false },
    category: {
      type: String,
      enum: ["legal", "technical", "environmental", "other"],
      default: "other",
    },
    notes: { type: String, required: false },
    version: { type: Number, default: 1 }, // Версия документа
    uploadedBy: { type: UploadedBySchema, required: true },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

const Document = mongoose.model("Document", DocumentSchema);

const documentValidationSchema = Joi.object({
  title: Joi.string().required(),
  fileUrl: Joi.string().uri().required(),
  materialIds: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .optional(),
  supplierId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  applyToAllSupplierMaterials: Joi.boolean().optional(),
  regulations: Joi.array()
    .items(
      Joi.object({
        _id: Joi.string()
          .required()
          .pattern(/^[0-9a-fA-F]{24}$/)
          .messages({
            "string.pattern.base":
              "Regulation ID must be a valid MongoDB ObjectId.",
            "any.required": "Regulation ID is required.",
          }),
        status: Joi.string()
          .valid(
            "comply",
            "does_not_comply",
            "pending",
            "na",
            "comply_with_exceptions"
          )
          .required()
          .messages({
            "any.only":
              "Status must be one of [comply, does_not_comply, pending, na, comply_with_exceptions].",
            "any.required": "Status is required.",
          }),
      })
    )
    .required()
    .messages({
      "array.base": "Regulations must be an array.",
      "any.required": "Regulations are required.",
    }),
  applyToAllSupplierMaterials: Joi.boolean().default(false).messages({
    "boolean.base": "Apply to all supplier materials must be a boolean value.",
  }),

  type: Joi.string()
    .valid(
      "certificate",
      "contract",
      "instruction",
      "other",
      "statement",
      "safety_data_sheet",
      "technical_data_sheet",
      "manual",
      "report",
      "specification",
      "license",
      "declaration"
    )
    .default("other")
    .messages({
      "any.only":
        "Type must be one of [certificate, contract, instruction, other, statement, safety data sheet, technical data sheet, manual, report, specification, license, declaration].",
    }),

  effectiveDate: Joi.date().optional().messages({
    "date.base": "Effective date must be a valid date.",
  }),

  expiryDate: Joi.date().optional().messages({
    "date.base": "Expiry date must be a valid date.",
  }),

  documentNumber: Joi.string().optional().messages({
    "string.base": "Document number must be a string.",
  }),

  description: Joi.string().optional().messages({
    "string.base": "Description must be a string.",
  }),

  category: Joi.string()
    .valid("legal", "technical", "environmental", "other")
    .default("other")
    .messages({
      "any.only":
        "Category must be one of [legal, technical, environmental, other].",
    }),

  notes: Joi.string().optional().messages({
    "string.base": "Notes must be a string.",
  }),

  version: Joi.number().default(1).min(1).messages({
    "number.base": "Version must be a number.",
    "number.min": "Version must be at least 1.",
  }),
  notificationPreferences: Joi.array()
    .items(
      Joi.object({
        daysBefore: Joi.number().integer().min(0).max(365).messages({
          "number.base": "`daysBefore` must be a number.",
          "number.min": "`daysBefore` cannot be negative.",
          "number.max": "`daysBefore` cannot exceed 365.",
        }),

        onExactDate: Joi.date().messages({
          "date.base": "`onExactDate` must be a valid date.",
        }),

        repeat: Joi.string()
          .valid("none", "daily", "weekly", "monthly")
          .default("none")
          .messages({
            "any.only":
              "`repeat` must be one of [none, daily, weekly, monthly].",
          }),

        cancelAfterDate: Joi.date().messages({
          "date.base": "`cancelAfterDate` must be a valid date.",
        }),

        cancelIfStatusChanged: Joi.string().messages({
          "string.base": "`cancelIfStatusChanged` must be a string.",
        }),

        lastTriggeredAt: Joi.date().optional().messages({
          "date.base": "`lastTriggeredAt` must be a valid date.",
        }),

        disabled: Joi.boolean().optional().messages({
          "boolean.base": "`disabled` must be a boolean.",
        }),

        methods: Joi.array()
          .items(Joi.string().valid("email", "telegram", "in_app"))
          .default(["in_app"])
          .messages({
            "array.base": "`methods` must be an array.",
            "any.only":
              "`methods` must include only: email, telegram, or in_app.",
          }),

        recipients: Joi.array()
          .items(
            Joi.object({
              userId: Joi.string()
                .pattern(/^[0-9a-fA-F]{24}$/)
                .messages({
                  "string.pattern.base":
                    "`userId` must be a valid MongoDB ObjectId.",
                }),
              name: Joi.string().messages({
                "string.base": "`name` must be a string.",
              }),
              role: Joi.string().messages({
                "string.base": "`role` must be a string.",
              }),
            })
          )
          .messages({
            "array.base": "`recipients` must be an array.",
          }),

        eventType: Joi.string()
          .valid(
            "expiry",
            "check_due",
            "license_renewal",
            "procedure_update",
            "document_update",
            "compliance_deadline",
            "custom"
          )
          .default("expiry")
          .messages({
            "any.only": "`eventType` must be one of the predefined types.",
          }),

        priority: Joi.string()
          .valid("low", "normal", "high")
          .default("low")
          .messages({
            "any.only": "`priority` must be one of [low, normal, high].",
          }),
      })
    )
    .optional()
    .messages({
      "array.base": "`notificationPreferences` must be an array of objects.",
    }),
});

export const documentValidation = {
  documentValidationSchema,
};

export default Document;
