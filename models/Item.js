import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    Plant: { type: String, trim: true, index: true },
    Material: { type: String, trim: true, index: true },
    Component: { type: String, trim: true, index: true },
    ItemTextLine: { type: String, trim: true },
    Name: { type: String, trim: true, index: true },
    VendorMaterialNumber: { type: String, trim: true, index: true },
    CatalogNumber: { type: String, trim: true, index: true },
  },
  {
    versionKey: false,
    collection: "items",
  }
);

const Item = mongoose.models.Item || mongoose.model("Item", itemSchema);

export default Item;