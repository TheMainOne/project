import Asset from "../services/schemas/asset.js";
import HttpError from "../middlewares/HttpError.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import logAction from "../utils/logAction.js";

// Создание нового Asset
const createAsset = async (req, res) => {
  const { name, entityType, parentEntity, ...rest } = req.body;

  // 1. Проверка родительской сущности и её состояния
  let ancestors = [];
  let parent = null;

  if (parentEntity) {
    parent = await Asset.findById(parentEntity);

    if (!parent || parent.isDeleted) {
      throw HttpError(400, "Parent entity not found");
    }
    ancestors = [...(parent.ancestors || []), parent._id];
  }

  // 2. Проверка на дубли (имя + тип)
  const exists = await Asset.findOne({ name, entityType, isDeleted: false });
  if (exists) {
    throw HttpError(
      409,
      `Сan't create duplicates. There is already a recording with name="${name}", entityType="${entityType}".`
    );
  }

  // 3. Создаём новый ассет
  const newAsset = new Asset({
    name,
    entityType,
    parentEntity,
    ancestors,
    ...rest,
  });

  await newAsset.save();
  console.log("Parent before found:", parent);
  // 4. Если есть родитель — добавляем новый ассет в его linkedAssets
  if (parent) {
    console.log("Parent found:", parent);
    // Извлекаем массив, если нет — делаем пустой
    parent.linkedAssets = Array.isArray(parent.linkedAssets)
      ? parent.linkedAssets
      : [];
    // Проверяем, чтобы не было дубля (на всякий случай)
    if (!parent.linkedAssets.some((id) => id.equals(newAsset._id))) {
      parent.linkedAssets.push(newAsset._id);
      await parent.save();
    }
  }

  // 5. Логируем действие
  await logAction({
    userId: req.user._id, // ID текущего пользователя
    action: "create",
    entityType: "Asset",
    entityId: newAsset._id,
    newData: newAsset.toObject(),
  });

  res.status(201).json({
    status: "success",
    code: 201,
    data: {
      asset: newAsset,
    },
  });
};

// Получение одного Asset по ID
const getAssetById = async (req, res) => {
  const { id } = req.params;
  const includeDeleted = req.query.includeDeleted === "true"; // если true — разрешаем возвращать удалённые

  // Формируем фильтр: если includeDeleted=false, добавляем isDeleted:false
  const filter = {
    _id: id,
    ...(includeDeleted ? {} : { isDeleted: false }),
  };

  // сразу фильтруем по isDeleted
  const asset = await Asset.findOne(filter).lean();

  if (!asset) {
    throw HttpError(404, "Asset not found");
  }
  res.json({
    status: "success",
    code: 200,
    data: { asset },
  });
};

// Получение списка всех активов
const getAssets = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1; // Преобразуем в число или задаем значение по умолчанию
  const limit = parseInt(req.query.limit, 10) || 10; // Преобразуем в число или задаем значение по умолчанию
  const skip = (page - 1) * limit;
  const includeDeleted = req.query.includeDeleted === "true"; // возможность получить удаленные Assets

  // Формируем фильтр
  const baseFilter = includeDeleted
    ? {} // все записи
    : { isDeleted: false }; // только не удалённые

  const filter = {
    ...baseFilter,
    ...(typeof req.filter === "object" ? req.filter : {}),
  };
  const sort = typeof req.sort === "object" ? req.sort : { createdAt: -1 }; // Сортировка по умолчанию по дате создания

  // Параллельно запрашиваем записи и общее число
  const [assets, totalItems] = await Promise.all([
    Asset.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Asset.countDocuments(filter),
  ]);

  res.json({
    status: "success",
    code: 200,
    data: {
      assets,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
    },
  });
};

// Обновление Asset
const updateAsset = async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };
  const userId = req.user._id;

  if (!id) throw HttpError(400, "Asset ID is required");
  if (!Object.keys(updates).length)
    throw HttpError(400, "No fields provided for update");

  // 1) загрузили asset и проверили
  const asset = await Asset.findById(id);
  if (!asset || asset.isDeleted) throw HttpError(404, "Asset not found");

  // 2) сохранили старые данные
  const oldData = asset.toObject();

  // 3) дублирование по name+entityType
  const newName = updates.name ?? asset.name;
  const newType = updates.entityType ?? asset.entityType;
  if (newName !== asset.name || newType !== asset.entityType) {
    const conflict = await Asset.findOne({
      _id: { $ne: asset._id },
      name: newName,
      entityType: newType,
      isDeleted: false,
    });
    if (conflict) {
      throw HttpError(
        409,
        `You can't create duplicates. There is already a recording with name="${newName}", entityType="${newType}".`
      );
    }
  }

  // 4) пересчёт parentEntity и ancestors
  // if (
  //   updates.parentEntity &&
  //   String(updates.parentEntity) !== String(asset.parentEntity)
  // ) {
  //   const parent = await Asset.findById(updates.parentEntity).lean();
  //   if (!parent || parent.isDeleted) {
  //     throw HttpError(400, "Parent entity not found");
  //   }
  //   asset.parentEntity = parent._id;
  //   asset.ancestors = [...(parent.ancestors || []), parent._id];
  // }

  // helpers --------------------------------------------
  function hasCycle(currentId, potentialParent) {
    if (!potentialParent) return false; // parentEntity = null
    if (potentialParent._id.equals(currentId)) return true; // A → A
    return (
      Array.isArray(potentialParent.ancestors) &&
      potentialParent.ancestors.some((aId) => aId.equals(currentId))
    ); // A в цепочке B
  }

  function uniqIds(arr = []) {
    const seen = new Set();
    return arr.filter((id) => {
      const key = id.toString(); // работаем и с ObjectId, и со строками
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // собрать путь «ancestors + parent»
  function buildAncestors(parent) {
    return uniqIds([...(parent.ancestors || []), parent._id]);
  }

  // 4) обработка смены родителя (parentEntity)
  if (
    Object.prototype.hasOwnProperty.call(updates, "parentEntity") &&
    String(updates.parentEntity ?? "") !== String(asset.parentEntity ?? "")
  ) {
    const newParentId = updates.parentEntity;
    const oldParentId = asset.parentEntity;

    // 4.1 Проверка нового родителя
    let newParent = null;
    if (newParentId) {
      newParent = await Asset.findById(newParentId);
      if (!newParent || newParent.isDeleted) {
        throw HttpError(400, "New parent entity not found");
      }

      // если новый родитель сейчас ребёнок того же ассета – убираем петлю
      if (newParent.parentEntity?.toString() === asset._id.toString()) {
        newParent.parentEntity = null;
        newParent.ancestors = []; // он станет «корневым»
        await newParent.save(); // сохраняем сразу
      }

      if (hasCycle(asset._id, newParent)) {
        throw HttpError(
          400,
          "Circular parent relationship detected — изменение приведёт к зацикливанию."
        );
      }
    }
    // 4.2 Удаляем из linkedAssets старого родителя (если был)
    if (oldParentId) {
      const oldParent = await Asset.findById(oldParentId);
      if (oldParent) {
        oldParent.linkedAssets = (oldParent.linkedAssets || []).filter(
          (aId) => String(aId) !== String(asset._id)
        );
        await oldParent.save();
      }
    }

    // 4.3 Добавляем в linkedAssets нового родителя (если есть)
    if (newParent) {
      newParent.linkedAssets = Array.isArray(newParent.linkedAssets)
        ? newParent.linkedAssets
        : [];
      if (
        !newParent.linkedAssets.some(
          (id) => id.toString() === asset._id.toString()
        )
      ) {
        newParent.linkedAssets.push(asset._id);
        await newParent.save();
      }
      asset.ancestors = buildAncestors(newParent).filter(
        (id) => id.toString() !== asset._id.toString()
      );
      asset.parentEntity = newParent._id;
    } else {
      // Если parentEntity = null — ассет верхнего уровня
      asset.ancestors = [];
      asset.parentEntity = null;
    }
  }

  // 5) применяем остальные апдейты (кроме parentEntity и ancestors — их обработали выше)
  const skipFields = ["parentEntity", "ancestors"];
  Object.entries(updates).forEach(([key, value]) => {
    if (!skipFields.includes(key)) {
      asset[key] = value;
    }
  });

  asset.ancestors = uniqIds(asset.ancestors || []);

  // 6) сохраняем ассет
  const updatedAsset = await asset.save();

  // 7) рекурсивно обновить ancestors у всех потомков
  // (опционально, если у ассета могут быть вложенные ассеты)
  async function updateChildrenAncestors(parent, visited = new Set()) {
    const parentIdStr = String(parent._id);
    if (visited.has(parentIdStr)) return;
    visited.add(parentIdStr);

    const children = await Asset.find({ parentEntity: parent._id });
    for (const child of children) {
      child.ancestors = buildAncestors(parent).filter(
        (id) => id.toString() !== child._id.toString()
      );
      await child.save();
      await updateChildrenAncestors(child, visited); // передаём visited
    }
  }
  await updateChildrenAncestors(asset);

  // 8) логируем
  await logAction({
    userId,
    action: "update",
    entityType: "Asset",
    entityId: updatedAsset._id,
    oldData,
    newData: updatedAsset.toObject(),
  });

  return res.status(200).json({
    status: "success",
    code: 200,
    data: { asset: updatedAsset },
  });
};

// Логическое удаление
const deleteAsset = async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const asset = await Asset.findById(id);
  if (!asset) {
    throw HttpError(404, "Asset not found");
  } else if (asset.isDeleted) {
    throw HttpError(404, "Asset was already deleted");
  }

  const oldData = asset.toObject();
  asset.isDeleted = true;
  await asset.save();

  // Логирование действия
  await logAction({
    userId,
    action: "delete",
    entityType: "Asset",
    entityId: asset._id,
    oldData,
  });

  res.status(200).json({
    status: "success",
    code: 200,
    message: "Asset deleted successfully",
    data: { asset },
  });
};

export default {
  createAsset: ctrlWrapper(createAsset),
  getAssetById: ctrlWrapper(getAssetById),
  getAssets: ctrlWrapper(getAssets),
  updateAsset: ctrlWrapper(updateAsset),
  deleteAsset: ctrlWrapper(deleteAsset),
};
