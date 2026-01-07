import mongoose from "mongoose";

const WidgetReleaseSettingsSchema = new mongoose.Schema(
  {
    // singleton-документ: всегда один и тот же _id
    _id: { type: String, required: true, default: "global" },

    // версия "по умолчанию" для всех клиентов без override
    defaultWidgetVersion: { type: String, required: true, trim: true },

    // опционально: для удобства/комментов
    note: { type: String, default: "", trim: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export default mongoose.model("WidgetReleaseSettings", WidgetReleaseSettingsSchema);
