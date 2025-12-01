import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema({
  clientId:  { type: mongoose.Types.ObjectId, ref: "Client" },
  siteId:    { type: String, index: true },
  sessionId: { type: String, index: true },
  visitorId: { type: String, index: true },

  answers:   { type: Object, default: {} }, // { fullName: "...", email: "..." }
  meta:      { type: Object, default: {} },

  status:    { type: String, enum: ["new", "processed"], default: "new" },

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Lead", LeadSchema);