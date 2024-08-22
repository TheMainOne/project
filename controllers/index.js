import mongoose from "mongoose";
import { listOfMaterials } from "../services/index.js";

  export const getAllMaterials = async (req, res, next) => {
    try {
  
      const results = await listOfMaterials();
      console.log(results);
      res.json({
        status: "success",
        code: 200,
        data: {
          materials: results,
        },
      });
    } catch (e) {
      console.error(e);
      next(e);
    }
  };
  