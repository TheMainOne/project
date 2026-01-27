import mongoose from "mongoose";

const NotificationDestinationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["telegram"],
      default: "telegram",
      index: true,
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      index: true,
      required: true,
    },
    siteId: {
      type: String,
      index: true,
      default: null,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    config: {
      chatId: {
        type: String,
        required: true,
        trim: true,
      },
      botToken: {
        type: String,
        trim: true,
        default: null,
      },
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true, versionKey: false }
);

// Быстрый роутинг по клиенту / типу / статусу, c возможной привязкой к сайту
NotificationDestinationSchema.index({ clientId: 1, type: 1, enabled: 1, siteId: 1 });

export default mongoose.model("NotificationDestination", NotificationDestinationSchema);
