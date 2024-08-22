import Material from "./schemas/material.js"

export const listOfMaterials = async () => {
    return Material.find();
  };
  