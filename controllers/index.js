import mongoose from "mongoose";
import { listOfMaterials } from "../services/index.js";
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

export default {
  getAll: ctrlWrapper(getAllMaterials),
};
