  import mongoose from "mongoose";
  import Joi from "joi";
  import joiObjectId from 'joi-objectid';

  Joi.objectId = joiObjectId(Joi);

  const RegulatoryComplianceSchema = new mongoose.Schema(
    {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Regulation' },
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
      BOMcomponent: { type: String, default: "" },
      storagePath: {type: String, default: ""},
    },
    { _id: false }
  );

  const MaterialSchema = new mongoose.Schema(
    {
      partNumber: { type: String, required: true, unique: true },
      description: { type: String, required: true },
      supplier: { type: String, default: "" },
      supplierItemNumber: { type: String, default: "" },
      parentID: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', default: null }, 
      components: { type: [ComponentSchema], default: [] }, // Вложенные компоненты
      countryOfOrigin: { type: String, default: "" },
      status: { type: String, default: "Active" },
      regulatoryCompliance: { type: [RegulatoryComplianceSchema], default: [] }, // Ссылка на регулирующие акты
      BOMcomponent: { type: String, default: "" },
      storagePath: {type: String, default: ""},
    },
    {
      versionKey: false,
      timestamps: true,
    }
  );

  const RegulatoryComplianceSchemaJoi = Joi.object({
    _id: Joi.objectId().required(),
    title: Joi.string().required(),
    description: Joi.string().required(),
    status: Joi.string().default('pending'),
  });


  const ComponentSchemaJoi = Joi.object({
    partNumber: Joi.string().required(),
    parentID: Joi.objectId().allow(null), 
    description: Joi.string().required(),
    supplier: Joi.string().default(""),
    supplierItemNumber: Joi.string().default(""),
    components: Joi.array().items(Joi.link('#ComponentSchema')).default([]), 
    countryOfOrigin: Joi.string().default(""),
    status: Joi.string().required(),
    regulatoryCompliance: Joi.array().items(RegulatoryComplianceSchemaJoi).default([]),
    BOMcomponent: Joi.string().default("").allow(""), 
    storagePath: Joi.string().default("").allow(""), 
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
    regulatoryCompliance: Joi.array().items(RegulatoryComplianceSchemaJoi).default([]),
    BOMcomponent: Joi.string().default("").allow(""),
    storagePath: Joi.string().default("").allow(""),
  });

  const ComponentSchemaJoiForUpdating = Joi.object({
    partNumber: Joi.string().allow("").optional(), 
    parentID: Joi.objectId().allow(null).optional(), 
    description: Joi.string().allow("").optional(),  
    supplier: Joi.string().allow("").optional(),  
    supplierItemNumber: Joi.string().allow("").optional(),  
    components: Joi.array().items(Joi.object({ 
      partNumber: Joi.string().allow("").optional(),
      parentID: Joi.objectId().allow(null).optional(),
      description: Joi.string().allow("").optional(),
      supplier: Joi.string().allow("").optional(),
      supplierItemNumber: Joi.string().allow("").optional(),
      components: Joi.array().items(Joi.object({})).default([]),  
      countryOfOrigin: Joi.string().allow("").optional(),
      status: Joi.string().allow("").optional(),
      regulatoryCompliance: Joi.array().items(Joi.object({
        title: Joi.string().allow("").optional(),
        description: Joi.string().allow("").optional(),
        status: Joi.string().allow("").optional(),
      })).default([]), 
      BOMcomponent: Joi.string().allow("").optional(),
      storagePath: Joi.string().allow("").optional(),
    })).default([]),  
    countryOfOrigin: Joi.string().allow("").optional(),
    status: Joi.string().allow("").optional(),
    regulatoryCompliance: Joi.array().items(Joi.object({
      title: Joi.string().allow("").optional(),
      description: Joi.string().allow("").optional(),
      status: Joi.string().allow("").optional(),
    })).default([]),
    BOMcomponent: Joi.string().allow("").optional(),
    storagePath: Joi.string().allow("").optional(),
  }).id('ComponentSchema');
  

  const updateMaterialSchema = Joi.object({
    relatedParentId: Joi.objectId().allow(null).optional().messages({
      'string.pattern.name': 'Invalid relatedParentId format. It must be a valid MongoDB ObjectId (24 characters).'
    }), // Поле relatedParentId
    partNumber: Joi.string().allow("").optional(),
    description: Joi.string().allow("").optional(),
    supplier: Joi.string().allow("").optional(),
    supplierItemNumber: Joi.string().allow("").optional(),
    parentID: Joi.objectId().allow(null).optional(),
    components: Joi.array().items(ComponentSchemaJoiForUpdating).default([]).optional(),
    countryOfOrigin: Joi.string().allow("").optional(),
    status: Joi.string().allow("").optional(),
    regulatoryCompliance: Joi.array().items(RegulatoryComplianceSchemaJoi).default([]).optional(),
    BOMcomponent: Joi.string().allow("").optional(),
    storagePath: Joi.string().allow("").optional(),
  });
  

  export const materialSchema = {
    validateMaterialSchema,
    updateMaterialSchema,
  };

  const Material = mongoose.model("Material", MaterialSchema, "materials");

  export default Material;
