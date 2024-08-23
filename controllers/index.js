import mongoose from "mongoose";
import { listOfMaterials } from "../services/index.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js"

const getAllMaterials = async (req, res, next) => {

  
      const results = await listOfMaterials();
      console.log(results);
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
  }