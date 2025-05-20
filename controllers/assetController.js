import Asset from "../services/schemas/asset.js";
import HttpError from "../middlewares/HttpError.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import logAction from "../utils/logAction.js";

// Создание нового Asset
const createAsset = async (req, res) => {
  const { name, entityType, parentEntity, ...rest } = req.body;

  // 1. Проверка родительской сущности и её состояния
  let ancestors = [];
  if (parentEntity) {
    const parent = await Asset.findById(parentEntity).lean();

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

  const newAsset = new Asset({
    name,
    entityType,
    parentEntity,
    ancestors,
    ...rest,
  });

  await newAsset.save();

  // Логируем действие
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
        `Нельзя создавать дубли. Уже есть запись с name="${newName}", entityType="${newType}".`
      );
    }
  }

  // 4) пересчёт parentEntity и ancestors
  if (
    updates.parentEntity &&
    String(updates.parentEntity) !== String(asset.parentEntity)
  ) {
    const parent = await Asset.findById(updates.parentEntity).lean();
    if (!parent || parent.isDeleted) {
      throw HttpError(400, "Parent entity not found");
    }
    asset.parentEntity = parent._id;
    asset.ancestors = [...(parent.ancestors || []), parent._id];
  }

  // 5) применяем остальные апдейты и сохраняем
  Object.assign(asset, updates);
  const updatedAsset = await asset.save();

  // 6) логируем
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
