import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema({
  clientId:  { type: mongoose.Types.ObjectId, ref: "Client" },
  siteId:    { type: String, index: true },
  sessionId: { type: String, index: true },
  visitorId: { type: String, index: true },

  answers:   { type: Object, default: {} },
  meta:      { type: Object, default: {} },

  status:    { type: String, enum: ["new", "processed"], default: "new" },

  createdAt: { type: Date, default: Date.now },
}, { timestamps: true, versionKey: false });

LeadSchema.index({ siteId: 1, createdAt: -1 });
LeadSchema.index({ clientId: 1, createdAt: -1 });
LeadSchema.index({ status: 1, createdAt: -1 });
LeadSchema.index({ siteId: 1, sessionId: 1 });

export default mongoose.model("Lead", LeadSchema);
