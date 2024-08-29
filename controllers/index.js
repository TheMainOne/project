import mongoose from "mongoose";
import Material from "../services/schemas/material.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";

const getAllMaterials = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const results = await Material.find({}).skip(skip).limit(limit).exec();

  res.json({
    status: "success",
    code: 200,
    data: {
      materials: results,
    },
  });
};

const getByID = async (req, res) => {
  const id = req.params.id;

  const result = await Material.findById(id, "-createdAt -updatedAt");

  if (!result) {
    throw HttpError(404, "Not found");
  }

  res.json({
    status: "success",
    code: 200,
    data: { material: result },
  });
};

const createMaterial = async (req, res) => {
  const { partNumber } = req.body;

  const existingMaterial = await Material.findOne({ partNumber });

  if (existingMaterial) {
    return res.status(409).json({
      status: "error",
      code: 409,
      message: "Material with this part number already exists",
      data: {
        material: existingMaterial,
      },
    });
  }

  const newMaterial = await Material.create({ ...req.body });

  res.status(201).json({
    status: "success",
    code: 201,
    data: {
      material: newMaterial,
    },
  });
}

const updateByID = async (req, res) => {
  const { id } = req.params;
  const fields = req.body;

     if (!id) {
      return res.status(400).json({
        status: "error",
        code: 400,
        message: "Contact ID is required",
      });
    }

  if (!fields || Object.keys(fields).length === 0) {
    return res.status(400).json({
      status: "error",
      code: 400,
      message: "No fields sent for update",
    });
  }
  
  const result = await Material.findByIdAndUpdate(id, fields, { new: true });

    if (!result) {
      return res.status(404).json({
        status: "error",
        code: 404,
        message: "Contact not found",
      });
    }

    return res.status(200).json({
      status: "success",
      code: 200,
      data: {
        material: result
      }
    });
}

export default {
  getAll: ctrlWrapper(getAllMaterials),
  getById: ctrlWrapper(getByID),
  updateByID: ctrlWrapper(updateByID),
  createMaterial: ctrlWrapper(createMaterial),
};
