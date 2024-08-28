import mongoose from "mongoose";
import { listOfMaterials, getMaterialById } from "../services/index.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";

const getAllMaterials = async (req, res, next) => {

  const {page=1, limit=10} = req.query;
  const skip = (page - 1) * limit;

  const results = await listOfMaterials(skip, limit);

  res.json({
    status: "success",
    code: 200,
    data: {
      materials: results,
    },
  });
};

export const getByID = async (req, res, next) => {
  const materialId = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(materialId)) {
      return res.status(400).json({ status: "error", code: 400, message: 'Invalid material ID' });
    }
  
    try {
      const result = await getMaterialById(materialId);
      res.json({
          status: "success",
          code: 200,
          data: { material: result },
        });
    } catch (error) {
      console.error("Error getting material:", error);
      if (error.message === 'Material Not Found') {
          return   res.status(404).json({
              status: "error",
              code: 404,
              message: `Not found material id: ${materialId}`,
              data: "Not Found",
            });
      }
      res.status(500).json({ message: 'Error getting material', error: error.message });
    }

};


export default {
  getAll: ctrlWrapper(getAllMaterials),
  getById: ctrlWrapper(getByID),
};
