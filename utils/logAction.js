import ActionLog from "../services/schemas/actionLog.js";
import _ from "lodash";

/**
 * Логирует действие пользователя с сохранением диффа изменений
 * @param {Object} params
 * @param {String} params.userId - Идентификатор пользователя
 * @param {String} params.action - Действие ('create', 'update', 'delete')
 * @param {String} params.entityType - Тип сущности ('Supplier', 'Material' и т.д.)
 * @param {String} params.entityId - Идентификатор сущности
 * @param {Object} params.oldData - Данные до изменений
 * @param {Object} params.newData - Данные после изменений
 */

const logAction = async ({
  userId,
  action,
  entityType,
  entityId,
  oldData,
  newData,
}) => {
  const excludedFields = ["__v", "createdAt", "updatedAt"];
  let diff = null;

  const filteredOldData = oldData ? _.omit(oldData, excludedFields) : {};
  const filteredNewData = newData ? _.omit(newData, excludedFields) : {};

  if (oldData && newData) {
    // Оба объекта существуют, вычисляем разницу
    diff = {};
    const allKeys = new Set([
      ...Object.keys(filteredOldData),
      ...Object.keys(filteredNewData),
    ]);
    for (const key of allKeys) {
      if (!_.isEqual(filteredOldData[key], filteredNewData[key])) {
        diff[key] = {
          before: filteredOldData[key],
          after: filteredNewData[key],
        };
      }
    }
  } else if (oldData) {
    // Только oldData, значит, данные были удалены
    diff = {};
    for (const key in filteredOldData) {
      diff[key] = {
        before: filteredOldData[key],
        after: null,
      };
    }
  } else if (newData) {
    // Только newData, значит, данные были созданы
    diff = {};
    for (const key in filteredNewData) {
      diff[key] = {
        before: null,
        after: filteredNewData[key],
      };
    }
  }

  const logEntry = new ActionLog({
    userId,
    action,
    entityType,
    entityId,
    changes: {
      before:
        Object.keys(filteredOldData).length > 0 ? filteredOldData : undefined,
      after:
        Object.keys(filteredNewData).length > 0 ? filteredNewData : undefined,
      diff,
    },
  });

  await logEntry.save();
};

export default logAction;
