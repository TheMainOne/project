import mongoose from "mongoose";
import Joi from "joi";

const RegulationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // Название акта
    description: { type: String, required: true }, // Описание акта
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

const validateRegulationSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().required(),
});

const updateRegulationSchema = Joi.object({
  title: Joi.string(),
  description: Joi.string(),
});

export const regulationSchema = {
  validateRegulationSchema,
  updateRegulationSchema,
};

const Regulation = mongoose.model('Regulation', RegulationSchema);

export default Regulation;
