import mongoose from "mongoose";
import Joi from "joi";

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
  regulationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Regulation',
    required: false,
  }, // Связь с регулирующим актом
  applyToAllSupplierMaterials: { type: Boolean, default: false }, // Применение ко всем материалам поставщика
  type: {
    type: String,
    enum: ['certificate', 'contract', 'instruction', 'other', 'statement', 'safety_data_sheet', 'technical_data_sheet', 'manual', 'report', 'specification', 'license', 'declaration'],
    default: "other",
  }, // Тип документа
  status: {
    type: String,
    enum: ['comply', 'does_not_comply', 'pending', 'na', 'comply_with_exceptions'],
    required: true,
  }, // Статус соответствия
  effectiveDate: { type: Date, required: false },
  expiryDate: { type: Date, required: false },
  documentNumber: { type: String, required: false },
  description: { type: String, required: false },
  category: { type: String, enum: ['legal', 'technical', 'environmental', 'other'], default: 'other' },
  notes: { type: String, required: false },
  version: { type: Number, default: 1 }, // Версия документа

}, 
{
    versionKey: false,
    timestamps: true,
  });

const Document = mongoose.model("Document", DocumentSchema);



const documentValidationSchema = Joi.object({
  title: Joi.string().required().messages({
    'string.empty': 'Title is required.',
  }),
  
  fileUrl: Joi.string().uri().required().messages({
    'string.empty': 'File URL is required.',
    'string.uri': 'File URL must be a valid URI.',
  }),
  
  attachments: Joi.array().items(Joi.string().uri().messages({
    'string.uri': 'Attachment must be a valid URI.',
  })).optional().messages({
    'array.base': 'Attachments must be an array of valid URIs.',
  }),

  materialIds: Joi.array().items(
    Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({
      'string.pattern.base': 'Material ID must be a valid MongoDB ObjectId.',
    })
  ).optional().messages({
    'array.base': 'Material IDs must be an array of valid MongoDB ObjectIds.',
  }),
  
  supplierId: Joi.string().optional().allow(null).pattern(/^[0-9a-fA-F]{24}$/).messages({
    'string.pattern.base': 'Supplier ID must be a valid MongoDB ObjectId.',
  }),

  regulationId: Joi.string().required().pattern(/^[0-9a-fA-F]{24}$/).messages({
    'string.pattern.base': 'Regulation ID is required.',
  }),

  applyToAllSupplierMaterials: Joi.boolean().default(false).messages({
    'boolean.base': 'Apply to all supplier materials must be a boolean value.',
  }),
  
  type: Joi.string().valid('certificate', 'contract', 'instruction', 'other', 'statement', 'safety_data_sheet', 'technical_data_sheet', 'manual', 'report', 'specification', 'license', 'declaration').default('other').messages({
    'any.only': 'Type must be one of [certificate, contract, instruction, other, statement, safety data sheet, technical data sheet, manual, report, specification, license, declaration].',
  }),

  status: Joi.string().valid('comply', 'does_not_comply', 'pending', 'na', 'comply_with_exceptions').required().messages({
    'any.only': 'Status is required and must be one of [comply, does_not_comply, pending, na, comply_with_exceptions].',
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
