import mongoose from "mongoose";
import Joi from "joi";

const RegulationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // Название акта
    description: { type: String, required: true }, // Описание акта
    effectiveDate: { type: Date, required: false }, // Дата вступления в силу
    expiryDate: { type: Date, required: false }, // Дата окончания действия акта
    regulationType: {
      type: String,
      enum: ['environmental', 'safety', 'technical', 'other'],
      default: 'other',
    }, // Тип акта
    status: {
      type: String,
      enum: ['active', 'obsolete', 'pending', 'inactive'],
      default: 'active',
    }, // Статус акта
    jurisdiction: [{ type: String, required: false }], // Географическая область применения
    documentUrl: { type: String, required: false }, // Ссылка на документ регуляции
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

const validateRegulationSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().required(),
  effectiveDate: Joi.date().optional(),
  expiryDate: Joi.date().optional(),
  regulationType: Joi.string().valid('environmental', 'safety', 'technical', 'other').optional(),
  status: Joi.string().valid('active', 'obsolete', 'pending', 'inactive').optional(),
  jurisdiction: Joi.array().items(Joi.string()).optional(), 
  documentUrl: Joi.string().uri().optional(),
});

const updateRegulationSchema = Joi.object({
  title: Joi.string(),
  description: Joi.string(),
  effectiveDate: Joi.date().optional(),
  expiryDate: Joi.date().optional(),
  regulationType: Joi.string().valid('environmental', 'safety', 'technical', 'other').optional(),
  status: Joi.string().valid('active', 'obsolete', 'pending', 'inactive').optional(),
  jurisdiction: Joi.array().items(Joi.string()).optional(), 
  documentUrl: Joi.string().uri().optional(),
});

const validateRegulationWithDocumentSchema = Joi.object({
  regulationTitle: Joi.string().required().messages({
    'string.empty': 'Regulation title is required.',
  }),
  regulationDescription: Joi.string().required().messages({
    'string.empty': 'Regulation description is required.',
  }),
  status: Joi.string()
    .valid('comply', 'does_not_comply', 'pending', 'na', 'comply_with_exceptions')
    .required()
    .messages({
      'any.only': 'Status is required and must be one of [comply, does_not_comply, pending, na, comply_with_exceptions].',
    }),
  materialId: Joi.string().optional().pattern(/^[0-9a-fA-F]{24}$/).messages({
    'string.pattern.base': 'Material ID must be a valid MongoDB ObjectId.',
  }),
  supplierId: Joi.string().optional().pattern(/^[0-9a-fA-F]{24}$/).messages({
    'string.pattern.base': 'Supplier ID must be a valid MongoDB ObjectId.',
  }),
  applyToAllSupplierMaterials: Joi.boolean().optional().messages({
    'boolean.base': 'Apply to all supplier materials must be a boolean value.',
  }),
  documentTitle: Joi.string().required().messages({
    'string.empty': 'Document title is required.',
  }),
  type: Joi.string()
    .valid(
      'certificate', 'contract', 'instruction', 'other', 'statement',
      'safety_data_sheet', 'technical_data_sheet', 'manual', 'report', 
      'specification', 'license', 'declaration'
    )
    .default('other')
    .messages({
      'any.only': 'Document type must be one of the allowed values.',
    }),
  version: Joi.number().optional().default(1).min(1).messages({
    'number.base': 'Version must be a number.',
    'number.min': 'Version must be at least 1.',
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
});



export const regulationSchema = {
  validateRegulationSchema,
  updateRegulationSchema,
  validateRegulationWithDocumentSchema,
};

const Regulation = mongoose.model('Regulation', RegulationSchema);

export default Regulation;
