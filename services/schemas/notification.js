import mongoose from "mongoose";
import Joi from "joi";

const NotificationSchema = new mongoose.Schema(
  {
    target: {
      entityType: {
        type: String,
        enum: ["Document", "InspectionItem", "License", "Procedure", "Other"],
        required: true,
      },
      entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
    },

    recipient: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      name: String,
      role: String,
    },

    method: {
      type: String,
      enum: ["email", "telegram", "in_app"],
      required: true,
    },

    eventType: {
      type: String,
      enum: [
        "expiry",
        "check_due",
        "license_renewal",
        "document_update",
        "procedure_update",
        "compliance_deadline",
        "custom",
      ],
      required: true,
    },

    context: {
      message: { type: String },
      eventDate: { type: Date },
      relatedTitle: { type: String }, // Название сущности (например, "Лицензия №2023-55" или "Огнетушитель №14") — чтобы вставить в сообщение
      reminderOffset: { type: Number }, // аналог daysBefore
      priority: {
        type: String,
        enum: ["low", "normal", "high"],
        default: "normal",
      },
    },

    // wasViewed: { type: Boolean, default: false }, нужно только для in app уведомлений
    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },
    sendError: { type: String, default: null },
    sentAt: { type: Date },
    cancelled: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    scheduledFor: { type: Date, required: true },
  },
  { versionKey: false }
);

NotificationSchema.index(
  {
    "target.entityId": 1,
    "target.entityType": 1,
    "recipient.userId": 1,
    method: 1,
    eventType: 1,
    scheduledFor: 1,
    status: 1,
    "context.eventDate": 1,
  },
  { name: "notification_deduplication_index" }
);

const Notification = mongoose.model("Notification", NotificationSchema);

export default Notification;
