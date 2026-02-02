import mongoose from "mongoose";

const TelemetryEventSchema = new mongoose.Schema(
  {
    siteId: { type: String, required: true, index: true },
    pagePath: { type: String, required: true },
    referrerDomain: { type: String, default: "" },
    deviceType: { type: String, enum: ["mobile", "desktop"], required: true },
    viewportW: { type: Number, min: 0, default: null },
    viewportH: { type: Number, min: 0, default: null },
    countryCode: { type: String, default: null },
    country: { type: String, default: null },
    regionCode: { type: String, default: null },
    region: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

TelemetryEventSchema.index({ siteId: 1, createdAt: -1 });
TelemetryEventSchema.index({ siteId: 1, pagePath: 1, createdAt: -1 });
TelemetryEventSchema.index({ siteId: 1, countryCode: 1, createdAt: -1 });

export default mongoose.model("TelemetryEvent", TelemetryEventSchema);
