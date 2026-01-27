import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
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
    eventType: {
      type: String,
      index: true,
      required: true,
    },
    channel: {
      type: String,
      enum: ["telegram"],
      default: "telegram",
      index: true,
      required: true,
    },
    destinationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NotificationDestination",
      index: true,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    message: {
      type: String,
      default: "",
    },
    scheduledFor: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      index: true,
    },
    lastError: {
      type: String,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    dedupeKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

// Основной индекс для воркера: выбирать pending, готовые к отправке, с лимитом попыток
NotificationSchema.index({ status: 1, scheduledFor: 1, attempts: 1 });

// Доп. индекс для аналитики/отладки по клиенту и событиям
NotificationSchema.index({ clientId: 1, eventType: 1, createdAt: -1 });

export default mongoose.model("Notification", NotificationSchema);

