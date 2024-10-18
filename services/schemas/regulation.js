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
      enum: ['active', 'obsolete', 'pending'],
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
  status: Joi.string().valid('active', 'obsolete', 'pending').optional(),
  jurisdiction: Joi.array().items(Joi.string()).optional(), 
  documentUrl: Joi.string().uri().optional(),
});

const updateRegulationSchema = Joi.object({
  title: Joi.string(),
  description: Joi.string(),
  effectiveDate: Joi.date().optional(),
  expiryDate: Joi.date().optional(),
  regulationType: Joi.string().valid('environmental', 'safety', 'technical', 'other').optional(),
  status: Joi.string().valid('active', 'obsolete', 'pending').optional(),
  jurisdiction: Joi.array().items(Joi.string()).optional(), 
  documentUrl: Joi.string().uri().optional(),
});

export const regulationSchema = {
  validateRegulationSchema,
  updateRegulationSchema,
};

const Regulation = mongoose.model('Regulation', RegulationSchema);

export default Regulation;
