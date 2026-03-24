import mongoose from "mongoose";

const regulationSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    aliases: {
      type: [String],
      default: [],
    },
    category: {
      type: String,
      trim: true,
      default: "general",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export default mongoose.model("Regulation", regulationSchema);