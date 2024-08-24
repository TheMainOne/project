import Material from "./schemas/material.js"

export const listOfMaterials = async (skip, limit) => {
  return Material.find({})
                .skip(skip)
                .limit(limit)
                .exec();
};