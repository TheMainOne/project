import mongoose from "mongoose";
import Joi from "joi";
import joiObjectId from 'joi-objectid';

Joi.objectId = joiObjectId(Joi);

const RegulatoryComplianceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, default: 'pending' }, // Добавляем статус акта
  },
  { _id: false }
);

const ComponentSchema = new mongoose.Schema(
  {
    partNumber: { type: String, required: true },
    parentID: {type: mongoose.Schema.Types.ObjectId, ref: 'Material', default: null},
    description: { type: String, required: true },
    supplier: { type: String, default: "" },
    supplierItemNumber: { type: String, default: "" },
    components: { type: [this], default: [] }, // Рекурсивная вложенность
    countryOfOrigin: { type: String, default: "" },
    status: { type: String, default: "Active" },
    regulatoryCompliance: { type: [RegulatoryComplianceSchema], default: [] },
    BOMComponent: { type: String, default: "" },
    storagePath: {type: String, default: ""},
  },
  { _id: false }
);

const MaterialSchema = new mongoose.Schema(
  {
    partNumber: { type: String, required: true },
    description: { type: String, required: true },
    supplier: { type: String, default: "" },
    supplierItemNumber: { type: String, default: "" },
    parentID: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', default: null }, 
    components: { type: [ComponentSchema], default: [] }, // Вложенные компоненты
    countryOfOrigin: { type: String, default: "" },
    status: { type: String, default: "Active" },
    regulatoryCompliance: { type: [RegulatoryComplianceSchema], default: [] }, // Ссылка на регулирующие акты
    BOMComponent: { type: String, default: "" },
    storagePath: {type: String, default: ""},
  },
  {
    versionKey: false,
    timestamps: true,
  }
);


const ComponentSchemaJoi = Joi.object({
  partNumber: Joi.string().required(),
  parentID: Joi.objectId().allow(null), 
  description: Joi.string().required(),
  supplier: Joi.string().default(""),
  supplierItemNumber: Joi.string().default(""),
  components: Joi.array().items(Joi.link('#ComponentSchema')).default([]), 
  countryOfOrigin: Joi.string().default(""),
  status: Joi.string().required(),
  regulatoryCompliance: Joi.array().items(Joi.string()).default([]),
  BOMcomponent: Joi.string().default("").allow(""), 
}).id('ComponentSchema');

const validateMaterialSchema = Joi.object({
  partNumber: Joi.string().required(),
  description: Joi.string().required(),
  supplier: Joi.string().default("").allow(""),
  supplierItemNumber: Joi.string().default("").allow(""),
  parentID: Joi.objectId().allow(null), 
  components: Joi.array().items(ComponentSchemaJoi).default([]),
  countryOfOrigin: Joi.string().default(""),
  status: Joi.string().required(),
  regulatoryCompliance: Joi.array().items(Joi.string()).default([]),
  BOMcomponent: Joi.string().default("").allow(""), 
});

const updateMaterialSchema = Joi.object({
  partNumber: Joi.string(),
  description: Joi.string(),
  supplier: Joi.string().allow(""),
  supplierItemNumber: Joi.string().allow(""),
  parentID: Joi.objectId().allow(null), 
  components: Joi.array().items(ComponentSchemaJoi).optional(),
  countryOfOrigin: Joi.string(),
  status: Joi.string(),
  regulatoryCompliance: Joi.array().items(Joi.string()),
  BOMcomponent: Joi.string(), 
});

export const materialSchema = {
  validateMaterialSchema,
  updateMaterialSchema,
};

const Material = mongoose.model("Material", MaterialSchema, "materials");

export default Material;
