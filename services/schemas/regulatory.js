import mongoose from "mongoose";

const RegulatoryActSchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // Название акта
    description: { type: String, required: true }, // Описание акта
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

const RegulatoryAct = mongoose.model('RegulatoryAct', RegulatoryActSchema);