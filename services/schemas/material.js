import mongoose from "mongoose";
import Joi from "joi";

const MaterialSchema = new mongoose.Schema(
  {
    material: { type: String, required: true },
    description: { type: String, required: true },
    supplier: { type: String, default: "" },
    supplierItemNumber: { type: String, default: "" },
    components: { type: [String], default: [] },
    countryOfOrigin: { type: String, default: "" },
    status: { type: String, default: "Active" },
    regulatoryCompliance: { type: [String], default: [] },
    BOMComponent: { type: String, default: "" },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

const validateMaterialSchema = Joi.object({
  material: Joi.string().required(),
  description: Joi.string().required(),
  supplier: Joi.string().default(""),
  supplierItemNumber: Joi.string().default(""),
  components: Joi.array().items(Joi.string()).default([]),
  countryOfOrigin: Joi.string().default(""),
  status: Joi.string().required(),
  regulatoryCompliance: Joi.array().items(Joi.string()).default([]),
  BOMComponent: Joi.string().default(""),
});

export const materialSchema = {
  validateMaterialSchema,
};

const Material = mongoose.model("Material", MaterialSchema, "materials");

export default Material;
