import mongoose from "mongoose";
import Joi from "joi";

const UploadedBySchema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: { type: String, required: true },
    role: { type: String, required: true },
  },
  { _id: true } 
);

const DocumentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  fileUrl: { type: String, required: true }, // Ссылка на документ
  attachments: [{ type: String }], // Ссылки на дополнительные файлы 
  materialIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: false }], // связь с одним или несколькими материалами
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Supplier",
    required: false,
  }, // Связь с поставщиком
  regulations: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Regulation', required: true },
      status: {
        type: String,
        enum: ['comply', 'does_not_comply', 'pending', 'na', 'comply_with_exceptions'],
        required: true,
      },
    },
    { _id: false } 
  ],
  applyToAllSupplierMaterials: { type: Boolean, default: false }, // Применение ко всем материалам поставщика
  type: {
    type: String,
    enum: ['certificate', 'contract', 'instruction', 'other', 'statement', 'safety_data_sheet', 'technical_data_sheet', 'manual', 'report', 'specification', 'license', 'declaration'],
    default: "other",
  }, // Тип документа
  effectiveDate: { type: Date, required: false },
  expiryDate: { type: Date, required: false },
  documentNumber: { type: String, required: false },
  description: { type: String, required: false },
  category: { type: String, enum: ['legal', 'technical', 'environmental', 'other'], default: 'other' },
  notes: { type: String, required: false },
  version: { type: Number, default: 1 }, // Версия документа
  uploadedBy: { type: UploadedBySchema, required: true },
}, 
{
    versionKey: false,
    timestamps: true,
  });

const Document = mongoose.model("Document", DocumentSchema);



const documentValidationSchema = Joi.object({
  title: Joi.string().required(),
  fileUrl: Joi.string().uri().required(),
  materialIds: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).optional(),
  supplierId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  applyToAllSupplierMaterials: Joi.boolean().optional(),
  regulations: Joi.array()
    .items(
      Joi.object({
        _id: Joi.string()
          .required()
          .pattern(/^[0-9a-fA-F]{24}$/)
          .messages({
            'string.pattern.base': 'Regulation ID must be a valid MongoDB ObjectId.',
            'any.required': 'Regulation ID is required.',
          }),
        status: Joi.string()
          .valid('comply', 'does_not_comply', 'pending', 'na', 'comply_with_exceptions')
          .required()
          .messages({
            'any.only':
              'Status must be one of [comply, does_not_comply, pending, na, comply_with_exceptions].',
            'any.required': 'Status is required.',
          }),
      })
    )
    .required()
    .messages({
      'array.base': 'Regulations must be an array.',
      'any.required': 'Regulations are required.',
    }),
  applyToAllSupplierMaterials: Joi.boolean().default(false).messages({
    'boolean.base': 'Apply to all supplier materials must be a boolean value.',
  }),
  
  type: Joi.string().valid('certificate', 'contract', 'instruction', 'other', 'statement', 'safety_data_sheet', 'technical_data_sheet', 'manual', 'report', 'specification', 'license', 'declaration').default('other').messages({
    'any.only': 'Type must be one of [certificate, contract, instruction, other, statement, safety data sheet, technical data sheet, manual, report, specification, license, declaration].',
  }),

  effectiveDate: Joi.date().optional().messages({
    'date.base': 'Effective date must be a valid date.',
  }),
  
  expiryDate: Joi.date().optional().messages({
    'date.base': 'Expiry date must be a valid date.',
  }),

  documentNumber: Joi.string().optional().messages({
    'string.base': 'Document number must be a string.',
  }),

  description: Joi.string().optional().messages({
    'string.base': 'Description must be a string.',
  }),

  category: Joi.string().valid('legal', 'technical', 'environmental', 'other').default('other').messages({
    'any.only': 'Category must be one of [legal, technical, environmental, other].',
  }),

  notes: Joi.string().optional().messages({
    'string.base': 'Notes must be a string.',
  }),
  
  version: Joi.number().default(1).min(1).messages({
    'number.base': 'Version must be a number.',
    'number.min': 'Version must be at least 1.',
  }),
});
  
  export const documentValidation = {
    documentValidationSchema
  };

  export default Document;
