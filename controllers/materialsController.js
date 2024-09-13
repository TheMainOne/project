import Material from "../services/schemas/material.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";

const getAllMaterials = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const materials = await Material.find({})
  .sort({ createdAt: -1 }) // Сортировка по полю `createdAt`: -1 означает от новых к старым
  .skip(skip)
  .limit(limit)
  .exec();

  const count = await Material.countDocuments();

  res.json({
    status: "success",
    code: 200,
    data: {
      materials,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
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
        message: "The Regulation ID is required to perform the update operation",
      });
    }

  if (!fields || Object.keys(fields).length === 0) {
    return res.status(400).json({
      status: "error",
      code: 400,
      message: "No fields were provided for the update.",
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

const deleteMaterial = async (req, res) => {
  const { id } = req.params;

  const deletedMaterial = await Material.findByIdAndDelete(id);

  if (!deletedMaterial) {
    throw HttpError(404, "Material not found");
  }

  res.status(200).json({
    status: "success",
    code: 200,
    message: "Material deleted successfully",
    data: { deletedMaterial },
  });
};



export default {
  getAll: ctrlWrapper(getAllMaterials),
  getById: ctrlWrapper(getByID),
  updateByID: ctrlWrapper(updateByID),
  createMaterial: ctrlWrapper(createMaterial),
  deleteMaterial: ctrlWrapper(deleteMaterial),
};
