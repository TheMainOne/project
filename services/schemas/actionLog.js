import mongoose from "mongoose";

const { Schema } = mongoose;

const actionLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true }, // Например, 'create', 'update', 'delete'
    entityType: { type: String, required: true }, // Например, 'Supplier', 'Material'
    entityId: { type: Schema.Types.ObjectId, required: true },
    timestamp: { type: Date, default: Date.now },
    changes: {
      before: { type: Object }, // Значения до изменений
      after: { type: Object }, // Значения после изменений
      diff: { type: Object }, // Разница между before и after
    },
  },
  { timestamps: true, versionKey: false }
);

const ActionLog = mongoose.model("ActionLog", actionLogSchema);

export default ActionLog;
