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
      parentID: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Material' }], default: [] },
      description: { type: String, required: true },
      supplier: { type: String, default: "" },
      supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: false, default: null },
      supplierItemNumber: { type: String, default: "" },
      components: { type: [this], default: [] }, // Recursive nesting
      countryOfOrigin: { type: String, default: "" },
      status: { type: String, default: "active" },
      regulatoryCompliance: { type: [RegulatoryComplianceSchema], default: [] },
      BOMcomponent: { type: String, default: "" },
      storagePath: { type: String, default: "" },
      notes: { type: String, default: "" }, // Added notes field
      category: { type: String, default: "other" }, // Added category field
      unitOfMeasure: { type: String, default: "" }, // Added unit of measure
      leadTime: { type: String, default: null }, // Added lead time
      customFields: { type: Map, of: String, default: {} }, // Added custom fields
    },
    { _id: true }
  );
  

  const MaterialSchema = new mongoose.Schema(
    {
      partNumber: { type: String, required: true, unique: true },
      description: { type: String, required: true },
      supplier: { type: String, default: "" },
      supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: false, default: null },
      supplierItemNumber: { type: String, default: "" },
      parentID: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Material' }], default: [] },
      components: { type: [ComponentSchema], default: [] }, // Nested components
      countryOfOrigin: { type: String, default: "" },
      status: { type: String, default: "active" },
      regulatoryCompliance: { type: [RegulatoryComplianceSchema], default: [] }, // Reference to regulations
      BOMcomponent: { type: String, default: "" },
      storagePath: { type: String, default: "" },
      notes: { type: String, default: "" }, // Added notes field
      category: { type: String, default: "other" }, // Added category field
      unitOfMeasure: { type: String, default: "" }, // Added unit of measure
      leadTime: { type: String, default: null }, // Added lead time
      customFields: { type: Map, of: String, default: {} }, // Added custom fields
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
    parentID: Joi.array().items(Joi.objectId()).default([]),
    description: Joi.string().required(),
    supplier: Joi.string().default(""),
    supplierId: Joi.objectId().allow(null),
    supplierItemNumber: Joi.string().default(""),
    components: Joi.array().items(Joi.link('#ComponentSchema')).default([]), 
    countryOfOrigin: Joi.string().default(""),
    status: Joi.string().required(),
    regulatoryCompliance: Joi.array().items(RegulatoryComplianceSchemaJoi).default([]),
    BOMcomponent: Joi.string().default("").allow(""), 
    storagePath: Joi.string().default("").allow(""), 
    notes: Joi.string().default("").allow("").empty(), // Added notes validation
    category: Joi.string().valid("packaging", "raw_material", "component", "other").default("other").empty(), // Category validation
    unitOfMeasure: Joi.string().default("").allow(""), // Unit of measure validation
    leadTime: Joi.string().allow('').allow(null).default(null).optional(),// Поле leadTime теперь строка
    customFields: Joi.object().pattern(Joi.string(), Joi.string()).default({}), // Custom fields validation
  }).id('ComponentSchema');


  const validateMaterialSchema = Joi.object({
    partNumber: Joi.string().required(),
    description: Joi.string().required(),
    supplier: Joi.string().default("").allow(""),
    supplierId: Joi.objectId().allow(null), 
    supplierItemNumber: Joi.string().default("").allow(""),
    parentID: Joi.array().items(Joi.objectId()).default([]),
    components: Joi.array().items(ComponentSchemaJoi).default([]),
    countryOfOrigin: Joi.string().default("").allow(""),
    status: Joi.string().required(),
    regulatoryCompliance: Joi.array().items(RegulatoryComplianceSchemaJoi).default([]),
    BOMcomponent: Joi.string().default("").allow(""),
    storagePath: Joi.string().default("").allow(""),
    notes: Joi.string().default("").allow("").empty(),
    category: Joi.string().valid("packaging", "raw_material", "component", "other").empty("").default("other").optional(), 
    unitOfMeasure: Joi.string().default("").allow(""), 
    leadTime: Joi.string().allow('').allow(null).default(null).optional(), // Поле leadTime теперь строка
    customFields: Joi.object().pattern(Joi.string(), Joi.string()).default({}), // Custom fields validation
  });

  const ComponentSchemaJoiForUpdating = Joi.object({
    partNumber: Joi.string().allow("").optional(),
    parentID: Joi.array().items(Joi.objectId()).default([]).optional(),
    description: Joi.string().allow("").optional(),
    supplier: Joi.string().allow("").optional(),
    supplierId: Joi.objectId().allow(null).optional(), 
    supplierItemNumber: Joi.string().allow("").optional(),
    components: Joi.array().items(Joi.link('#ComponentSchema')).default([]).optional(), // Recursive link for components
    countryOfOrigin: Joi.string().allow("").optional(),
    status: Joi.string().allow("").optional(),
    regulatoryCompliance: Joi.array().items(Joi.object({
      title: Joi.string().allow("").optional(),
      description: Joi.string().allow("").optional(),
      status: Joi.string().allow("").optional(),
    })).default([]),
    BOMcomponent: Joi.string().allow("").optional(),
    storagePath: Joi.string().allow("").optional(),
    notes: Joi.string().allow("").optional().empty(), // Added notes validation
    category: Joi.string().valid("packaging", "raw_material", "component", "other").default("other").optional().empty(), // Category validation
    unitOfMeasure: Joi.string().allow("").optional(), // Unit of measure validation
    leadTime: Joi.string().allow('').allow(null).optional(), // Поле leadTime теперь строка
    customFields: Joi.object().pattern(Joi.string(), Joi.string()).default({}).optional(), // Custom fields validation
  }).id('ComponentSchema');
  
  const updateMaterialSchema = Joi.object({
    relatedParentId: Joi.objectId().allow(null).optional().messages({
      'string.pattern.name': 'Invalid relatedParentId format. It must be a valid MongoDB ObjectId (24 characters).'
    }), // Поле relatedParentId
    partNumber: Joi.string().allow("").optional(),
    description: Joi.string().allow("").optional(),
    supplier: Joi.string().allow("").optional(),
    supplierId: Joi.objectId().allow(null).optional(), 
    supplierItemNumber: Joi.string().allow("").optional(),
    parentID: Joi.array().items(Joi.objectId()).default([]).optional(),
    components: Joi.array().items(ComponentSchemaJoiForUpdating).default([]).optional(),
    countryOfOrigin: Joi.string().allow("").optional(),
    status: Joi.string().allow("").optional(),
    regulatoryCompliance: Joi.array().items(RegulatoryComplianceSchemaJoi).default([]).optional(),
    BOMcomponent: Joi.string().allow("").optional(),
    storagePath: Joi.string().allow("").optional(),
    notes: Joi.string().allow("").optional(), // Added notes validation
    category: Joi.string().valid("packaging", "raw_material", "component", "other").default("other").optional(), // Category validation
    unitOfMeasure: Joi.string().allow("").optional(), // Unit of measure validation
    leadTime: Joi.string().allow('').allow(null).optional(), // Поле leadTime теперь строка
    customFields: Joi.object().pattern(Joi.string(), Joi.string()).default({}).optional(), // Custom fields validation
  });

  const validateUpdateComplianceStatusWithDocumentSchema = Joi.object({
    regulations: Joi.alternatives()
      .try(
        Joi.array().items(
          Joi.object({
            regulationId: Joi.string()
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
        ),
        Joi.string().custom((value, helpers) => {
          try {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) {
              throw new Error('Regulations must be an array.');
            }
            return parsed;
          } catch (err) {
            return helpers.error('any.invalid', { message: 'Regulations must be a valid JSON array.' });
          }
        })
      )
      .required()
      .messages({
        'any.required': 'Regulations are required.',
        'any.invalid': '{{#message}}',
      }),
  
    materialIds: Joi.alternatives()
      .try(
        Joi.array().items(
          Joi.string()
            .pattern(/^[0-9a-fA-F]{24}$/)
            .messages({
              'string.pattern.base': 'Material ID must be a valid MongoDB ObjectId.',
            })
        ),
        Joi.string().custom((value, helpers) => {
          try {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) {
              throw new Error('Material IDs must be an array.');
            }
            return parsed;
          } catch (err) {
            return helpers.error('any.invalid', { message: 'Material IDs must be a valid JSON array.' });
          }
        })
      )
      .messages({
        'any.invalid': '{{#message}}',
      }),
  
    applyToAllSupplierMaterials: Joi.boolean().messages({
      'boolean.base': 'Apply to all supplier materials must be a boolean value.',
    }),
  
    supplierId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .messages({
        'string.pattern.base': 'Supplier ID must be a valid MongoDB ObjectId.',
      }),
  
    documentTitle: Joi.string().optional().messages({
      'string.base': 'Document title must be a string.',
    }),
  
    type: Joi.string()
      .valid(
        'certificate',
        'contract',
        'instruction',
        'other',
        'statement',
        'safety_data_sheet',
        'technical_data_sheet',
        'manual',
        'report',
        'specification',
        'license',
        'declaration'
      )
      .default('other')
      .messages({
        'any.only': 'Type must be one of the allowed values.',
      }),
  
    version: Joi.number().optional().default(1).min(1).messages({
      'number.base': 'Version must be a number.',
      'number.min': 'Version must be at least 1.',
    }),
  
    attachments: Joi.array().items(Joi.string()).optional().messages({
      'array.base': 'Attachments must be an array of strings.',
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
  
    category: Joi.string()
      .valid('legal', 'technical', 'environmental', 'other')
      .default('other')
      .messages({
        'any.only': 'Category must be one of [legal, technical, environmental, other].',
      }),
  
    notes: Joi.string().optional().messages({
      'string.base': 'Notes must be a string.',
    }),
  })
    .custom((value, helpers) => {
      // Кастомная валидация: либо materialIds должны быть предоставлены и не пусты,
      // либо applyToAllSupplierMaterials и supplierId должны быть предоставлены вместе
      const materialIdsValid = Array.isArray(value.materialIds) && value.materialIds.length > 0;
      const supplierValid = value.applyToAllSupplierMaterials === true && value.supplierId;
  
      if (!materialIdsValid && !supplierValid) {
        return helpers.error('any.custom', {
          message:
            'Either materialIds or applyToAllSupplierMaterials with a valid supplierId must be provided.',
        });
      }
      return value;
    })
    .messages({
      'any.custom': '{{#message}}',
    });
  

  export const materialSchema = {
    validateMaterialSchema,
    updateMaterialSchema,
    validateUpdateComplianceStatusWithDocumentSchema
  };

  const Material = mongoose.model("Material", MaterialSchema, "materials");

Material.validateMaterialSchema = validateMaterialSchema;

  export default Material;


