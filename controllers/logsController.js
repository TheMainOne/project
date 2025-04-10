import mongoose from "mongoose";
import ActionLog from "../services/schemas/actionLog.js";
import HttpError from "../middlewares/HttpError.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";

const getLogs = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const logs = await ActionLog.find(req.filter)
    .sort(req.sort)
    .skip(skip)
    .limit(parseInt(limit))
    .populate({
      path: "userId",
      select: "name email role",
      populate: {
        path: "role",
        select: "name",
      },
    })
    .lean();

  // Преобразуем userId в user и вытаскиваем название роли
  const transformedLogs = logs.map((log) => {
    if (log.userId) {
      log.user = {
        ...log.userId,
        role:
          typeof log.userId.role === "object"
            ? log.userId.role.name
            : log.userId.role,
      };
      delete log.userId;
    }
    return log;
  });

  const total = await ActionLog.countDocuments(req.filter);

  res.status(200).json({
    status: "success",
    code: 200,
    data: {
      logs: transformedLogs,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
    },
  });
};

const getLogById = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw HttpError(400, "Log ID is required");
  }

  const log = await ActionLog.findById(id)
    .populate({
      path: "userId",
      select: "name email role",
      populate: {
        path: "role",
        select: "name",
      },
    })
    .lean();

  if (!log) {
    throw HttpError(404, "Log not found");
  }

  if (log.userId) {
    log.user = {
      ...log.userId,
      role:
        typeof log.userId.role === "object"
          ? log.userId.role.name
          : log.userId.role,
    };
    delete log.userId;
  }

  res.status(200).json({
    status: "success",
    code: 200,
    data: {
      log,
    },
  });
};

const deleteOldLogs = async (req, res) => {
  const { olderThanDays = "90", dryRun = "false" } = req.query;
  const daysNumber = parseInt(olderThanDays);

  // Защита от отрицательных и некорректных значений
  if (isNaN(daysNumber) || daysNumber <= 0) {
    throw HttpError(400, "Invalid number of days. Must be a positive integer.");
  }
  const cutoffDate = new Date(Date.now() - daysNumber * 24 * 60 * 60 * 1000);

  if (dryRun === "true") {
    const count = await ActionLog.countDocuments({
      timestamp: { $lt: cutoffDate },
    });

    return res.status(200).json({
      status: "dry-run",
      code: 200,
      message: `Dry run: ${count} log(s) would be deleted if executed.`,
    });
  }

  const result = await ActionLog.deleteMany({ timestamp: { $lt: cutoffDate } });

  res.status(200).json({
    status: "success",
    code: 200,
    message: `Deleted ${result.deletedCount} log(s) older than ${daysNumber} days`,
  });
};

const getLogsForEntity = async (req, res) => {
  const { entityType, entityId } = req.params;

  if (!entityType || !entityId) {
    throw HttpError(
      400,
      "Missing required parameters: entityType and entityId"
    );
  }

  const logs = await ActionLog.find({
    entityType: new RegExp(`^${entityType}$`, "i"), // нечувствительный к регистру поиск
    entityId: mongoose.Types.ObjectId.isValid(entityId)
      ? new mongoose.Types.ObjectId(entityId)
      : entityId,
  })
    .sort({ timestamp: -1 })
    .populate({
      path: "userId",
      select: "name email role",
      populate: {
        path: "role",
        select: "name",
      },
    })
    .lean();

  // Преобразуем userId → user и role → role.name
  const transformedLogs = logs.map((log) => {
    if (log.userId) {
      log.user = {
        ...log.userId,
        role:
          typeof log.userId.role === "object"
            ? log.userId.role.name
            : log.userId.role,
      };
      delete log.userId;
    }
    return log;
  });

  res.status(200).json({
    status: "success",
    code: 200,
    data: {
      logs: transformedLogs,
    },
  });
};

export default {
  getLogs: ctrlWrapper(getLogs),
  getLogById: ctrlWrapper(getLogById),
  deleteOldLogs: ctrlWrapper(deleteOldLogs),
  getLogsForEntity: ctrlWrapper(getLogsForEntity),
};
