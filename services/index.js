import Material from "./schemas/material.js"
import HttpError from "../middlewares/HttpError.js";

export const listOfMaterials = async (skip, limit) => {
  return Material.find({})
                .skip(skip)
                .limit(limit)
                .exec();
};

export const getMaterialById = async (id) => {
  try {
    const result = await Material.findById(id, "-createdAt -updatedAt");
    console.log(result);
    if (!result) {
      throw HttpError(404, 'Material Not Found')
    }
    return result;
  } catch (error) {
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
      throw new Error('InvalidObjectId');
    }
    throw error;
  }
};