import mongoose from "mongoose";
import Joi from "joi";

const supplierSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    contactPersons: [
      { 
        name: { type: String },
        email: { type: String },
        phone: { type: String },
        position: { type: String }, 
      }
    ],
    email: { type: String, required: true },
    phone: { type: String },
    website: { type: String },
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      country: { type: String },
      postalCode: { type: String },
    },
    factories: [
      {
        name: { type: String },
        location: {
          street: { type: String },
          city: { type: String },
          state: { type: String },
          country: { type: String },
          postalCode: { type: String },
        },
        productionCapacity: { type: Number },
        certifications: [{ type: String }],
      },
    ],
    licensesAndCertifications: [
      {
        name: { type: String },
        issueDate: { type: Date },
        expiryDate: { type: Date },
        issuingAuthority: { type: String },
      },
    ],
    files: [
      {
        fileName: { type: String },
        fileUrl: { type: String },
        uploadDate: { type: Date },
        uploadedBy: { type: String },
      },
    ],
    countryOfOrigin: { type: String, default: "" }, // Новое поле
    notes: { type: String, default: "" }, // Новое поле
  },
  {
    versionKey: false,
    timestamps: true,
  });


  const createSupplierSchema = Joi.object({
    name: Joi.string().required(),
    contactPersons: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        email: Joi.string().email().required(),
        phone: Joi.string().optional(),
        position: Joi.string().optional(),
      })
    ).min(1).optional(),
    email: Joi.string().email().required(),
    phone: Joi.string().optional(),
    website: Joi.string().uri().optional(),
    address: Joi.object({
      street: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      country: Joi.string().required(),
      postalCode: Joi.string().optional(),
    }).optional(),
    factories: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        location: Joi.object({
          street: Joi.string().optional(),
          city: Joi.string().optional(),
          state: Joi.string().optional(),
          country: Joi.string().required(),
          postalCode: Joi.string().optional(),
        }).required(),
        productionCapacity: Joi.number().optional(),
        certifications: Joi.array().items(Joi.string()).optional(),
      })
    ).optional(),
    licensesAndCertifications: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        issueDate: Joi.date().optional(),
        expiryDate: Joi.date().optional(),
        issuingAuthority: Joi.string().optional(),
      })
    ).optional(),
    files: Joi.array().items(
      Joi.object({
        fileName: Joi.string().required(),
        fileUrl: Joi.string().uri().required(),
        uploadDate: Joi.date().optional(),
        uploadedBy: Joi.string().optional(),
      })
    ).optional(),
    countryOfOrigin: Joi.string().optional(), // Новое поле
    notes: Joi.string().optional(), // Новое поле
  });

  const updateSupplierSchema = Joi.object({
    name: Joi.string().optional(),
    contactPersons: Joi.array().items(
      Joi.object({
        name: Joi.string().optional(),
        email: Joi.string().email().optional(),
        phone: Joi.string().optional(),
        position: Joi.string().optional(),
      })
    ).optional(),
    email: Joi.string().email().optional(),
    phone: Joi.string().optional(),
    website: Joi.string().uri().optional(),
    address: Joi.object({
      street: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      country: Joi.string().optional(),
      postalCode: Joi.string().optional(),
    }).optional(),
    factories: Joi.array().items(
      Joi.object({
        name: Joi.string().optional(),
        location: Joi.object({
          street: Joi.string().optional(),
          city: Joi.string().optional(),
          state: Joi.string().optional(),
          country: Joi.string().optional(),
          postalCode: Joi.string().optional(),
        }).optional(),
        productionCapacity: Joi.number().optional(),
        certifications: Joi.array().items(Joi.string()).optional(),
      })
    ).optional(),
    licensesAndCertifications: Joi.array().items(
      Joi.object({
        name: Joi.string().optional(),
        issueDate: Joi.date().optional(),
        expiryDate: Joi.date().optional(),
        issuingAuthority: Joi.string().optional(),
      })
    ).optional(),
    files: Joi.array().items(
      Joi.object({
        fileName: Joi.string().optional(),
        fileUrl: Joi.string().uri().optional(),
        uploadDate: Joi.date().optional(),
        uploadedBy: Joi.string().optional(),
      })
    ).optional(),
    countryOfOrigin: Joi.string().optional(), // Новое поле
    notes: Joi.string().optional(), // Новое поле
  }).min(1); // Обновление требует хотя бы одного поля

  export const supplierValidationSchema = {
    createSupplierSchema,
    updateSupplierSchema,
  };
  
  const Supplier = mongoose.model('Supplier', supplierSchema);

  
export default Supplier;