import mongoose from "mongoose";

const TokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    refreshToken: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    userAgent: String,
    ip: String
  },
  { timestamps: true }
);

export default mongoose.model("Token", TokenSchema);
