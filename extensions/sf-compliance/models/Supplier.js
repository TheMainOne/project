import mongoose from "mongoose";

const { Schema } = mongoose;

function normalizeAlias(value) {
  return String(value || "").trim();
}

const supplierSchema = new Schema(
  {
    supplierCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    supplierName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    aliases: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

supplierSchema.index({ supplierCode: 1 }, { unique: true });
supplierSchema.index({ supplierName: 1 });

supplierSchema.pre("save", function (next) {
  this.supplierCode = String(this.supplierCode || "").trim().toUpperCase();
  this.supplierName = String(this.supplierName || "").trim();

  if (Array.isArray(this.aliases)) {
    this.aliases = [...new Set(
      this.aliases.map(normalizeAlias).filter(Boolean)
    )];
  }

  next();
});

export default mongoose.model("Supplier", supplierSchema);