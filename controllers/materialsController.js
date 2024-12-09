import Material from "../services/schemas/material.js";
import Supplier from "../services/schemas/supplier.js"
import Document from "../services/schemas/document.js";
import Regulation from "../services/schemas/regulation.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";
import filterAndSort from "../middlewares/filterAndSort.js";
import logAction from "../utils/logAction.js"
import fs from 'fs';


const getAllMaterials = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1; // Преобразуем в число или задаем значение по умолчанию
  const limit = parseInt(req.query.limit, 10) || 10; // Преобразуем в число или задаем значение по умолчанию
  const skip = (page - 1) * limit;

  // Используем фильтры и сортировку, переданные через middleware
  const filter = req.filter || {};
  const sort = req.sort || { createdAt: -1 }; // Сортировка по умолчанию по дате создания

  // Выполняем запрос с фильтрацией и сортировкой
  const materials = await Material.find(filter)
    .populate('supplierId', '_id') 
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .exec();

  // Считаем количество документов с учетом фильтрации
  const count = await Material.countDocuments(filter);

  res.json({
    status: "success",
    code: 200,
    data: {
      materials,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    },
  });
};

const getByID = async (req, res) => {
  const id = req.params.id;

  const result = await Material.findById(id, "-createdAt -updatedAt")
    .populate('supplierId', '_id name');

  if (!result) {
    throw HttpError(404, "Not found");
  }

  res.json({
    status: "success",
    code: 200,
    data: { material: result },
  });
};

const createMaterial = async (req, res) => {
  const { partNumber, supplier, supplierId: supplierIdFromBody, regulatoryCompliance = [] } = req.body;
  const userId = req.user._id;

  const existingMaterial = await Material.findOne({ partNumber });

  if (existingMaterial) {
    throw HttpError(409, "Material with this part number already exists");
  }

  // Проверяем, что регуляторные акты существуют в коллекции regulations и если существуют, присваиваем им правильный _id
  if (regulatoryCompliance.length > 0) {
    for (const compliance of regulatoryCompliance) {
      const regulation = await Regulation.findById(compliance._id);
      if (!regulation) {
        throw HttpError(
          404,
          `Regulation with ID ${compliance._id} not found. Please create a new regulation first.`
        );
      }
    }
  }

  // Инициализируем updatedRegulatoryCompliance с предоставленным regulatoryCompliance
  let updatedRegulatoryCompliance = [...regulatoryCompliance];

  let supplierId = null;
  let supplierDocuments = [];

  // Если указан поставщик, выполняем дополнительную логику
  if (!supplierId && supplier) {
    const supplierRecord = await Supplier.findOne({ name: supplier.trim() });
    if (supplierRecord) {
      supplierId = supplierRecord._id;

      // Поиск документов, применимых ко всем материалам поставщика
      supplierDocuments = await Document.find({
        applyToAllSupplierMaterials: true,
        supplierId: supplierId,
      });

      if (supplierDocuments.length > 0) {
        for (const doc of supplierDocuments) {
          if (!Array.isArray(doc.regulations) || doc.regulations.length === 0) {
            continue; // Пропускаем документ, если нет regulations
          }

          for (const reg of doc.regulations) {
            const regulationId = reg._id;
            const statusFromDoc = reg.status;

            // Получаем информацию о регуляторном акте
            const regulation = await Regulation.findById(regulationId);
            if (!regulation) {
              throw HttpError(404, `Regulation with ID ${regulationId} not found.`);
            }

            // Проверяем, есть ли уже этот регуляторный акт в regulatoryCompliance
            const existingComplianceIndex = updatedRegulatoryCompliance.findIndex(
              (comp) => comp._id.toString() === regulationId.toString()
            );

            if (existingComplianceIndex > -1) {
              // Обновляем статус на основе статуса из документа
              updatedRegulatoryCompliance[existingComplianceIndex].status = statusFromDoc;
            } else {
              // Добавляем новый регуляторный акт
              updatedRegulatoryCompliance.push({
                _id: regulationId,
                title: regulation.title,
                description: regulation.description,
                status: statusFromDoc || "pending",
              });
            }
          }
        }
      }
    } else {
      // Если поставщик не найден в базе данных
      console.warn(`Supplier with name "${supplier}" not found.`);
      throw HttpError(404, "Supplier was not found in the database");
    }
  }

  // Создаем новый материал с обновленным regulatoryCompliance
  const newMaterial = await Material.create({
    ...req.body,
    supplierId: supplierId, // Добавляем supplierId
    regulatoryCompliance: updatedRegulatoryCompliance,
  });

  // Логируем действие
  await logAction({
    userId,
    action: 'create',
    entityType: 'Material',
    entityId: newMaterial._id,
    newData: newMaterial.toObject(),
  });

  // После создания материала добавляем его _id в materialIds документов
  if (supplierId && supplierDocuments.length > 0) {
    for (const doc of supplierDocuments) {
      // Проверяем, есть ли уже _id материала в materialIds
      if (!doc.materialIds.includes(newMaterial._id)) {
        doc.materialIds.push(newMaterial._id);
        await doc.save();
      }
    }
  }


  res.status(201).json({
    status: "success",
    code: 201,
    data: {
      material: newMaterial,
    },
  });
};

const updateByID = async (req, res) => {
  const { id } = req.params;
  const { relatedParentId, regulatoryCompliance, ...fields } = req.body; // Извлекаем relatedParentId и другие поля
  const userId = req.user._id;

  if (!id) {
    throw HttpError(400, "The Material ID is required to perform the update operation");
  }

  // Проверяем, есть ли поля для обновления или relatedParentId
  if (!fields || Object.keys(fields).length === 0) {
    if (!relatedParentId) {
      throw HttpError(400, "No fields were provided for the update.");
    }
  }

  let material = await Material.findById(id); // Ищем материал по ID

  if (!material) {
    throw HttpError(404, "Material not found");
  }

  // сохраняем данные о материале, до его обновления
  const oldMaterial = material.toObject();

  // Если в запросе передан relatedParentId
  if (relatedParentId) {
    const newParentMaterial = await Material.findById(relatedParentId);
    if (!newParentMaterial) {
      throw HttpError(404, "Parent Material not found");
    }

    // Проверяем, существует ли уже этот материал как компонент у родителя, чтобы избежать дублирования
    const isComponentAlreadyExists = newParentMaterial.components.some(
      (comp) => comp &&
        comp._id &&
        comp._id.equals(material._id)

    );

    if (isComponentAlreadyExists) {
      throw HttpError(400, "This material is already a component of the parent material.");
    }


    // Обновляем поле parentID у текущего материала перед добавлением в нового родителя
    if (!material.parentID.includes(relatedParentId)) {
      material.parentID.push(relatedParentId);
      await material.save();
    }
    

 // Добавляем материал в components нового родителя
 newParentMaterial.components.push({
  _id: material._id,
  partNumber: material.partNumber,
  description: material.description,
  supplier: material.supplier,
  supplierItemNumber: material.supplierItemNumber,
  components: material.components,
  parentID: material.parentID,
  countryOfOrigin: material.countryOfOrigin,
  status: material.status,
  regulatoryCompliance: material.regulatoryCompliance,
  BOMcomponent: material.BOMcomponent,
  storagePath: material.storagePath,
});

// Собираем все уникальные regulatoryCompliance из компонентов
const complianceMap = new Map();


if (newParentMaterial.components && Array.isArray(newParentMaterial.components)) {
  for (const component of newParentMaterial.components) {
    if (component.regulatoryCompliance && Array.isArray(component.regulatoryCompliance)) {
      for (const compCompliance of component.regulatoryCompliance) {
        const key = compCompliance.title; // Предполагаем наличие уникального идентификатора регуляторного акта

        if (!complianceMap.has(key)) {
          complianceMap.set(key, {
            _id: compCompliance._id,
            title: compCompliance.title,
            description: compCompliance.description,
            status: compCompliance.status
          });
        } else {
          // Обновляем статус на основе статусов всех компонентов
          const existingStatus = complianceMap.get(key).status;
          const newStatus = getCombinedStatus(existingStatus, compCompliance.status);
          complianceMap.set(key, {
            _id: compCompliance._id,
            title: compCompliance.title,
            description: compCompliance.description,
            status: newStatus
          });
        }
      }
    }
  }
}

// Функция для определения комбинированного статуса
function getCombinedStatus(status1, status2) {
  const statusPriority = {
    'does_not_comply': 1,
    'pending': 2,
    'comply_with_exceptions': 3,
    'comply': 4,
    'na': 5
  };

  if (statusPriority[status1] < statusPriority[status2]) {
    return status1;
  } else {
    return status2;
  }
}

// Обновляем regulatoryCompliance родителя на основе данных компонентов
newParentMaterial.regulatoryCompliance = Array.from(complianceMap.values());


await newParentMaterial.save();
}

// Если обновляется supplier
if (fields.supplier) {
  const supplierRecord = await Supplier.findOne({ name: fields.supplier.trim() });
  if (supplierRecord) {
    fields.supplierId = supplierRecord._id;
  } else {
    throw HttpError(404, "Supplier not found");
  }
}

// Если обновляется supplierId
if (fields.supplierId) {
  const supplierRecord = await Supplier.findById(fields.supplierId);
  if (supplierRecord) {
    fields.supplier = supplierRecord.name;
  } else {
    throw HttpError(404, "Supplier not found");
  }
}

  // Обновляем материал с переданными полями
  const result = await Material.findByIdAndUpdate(
    id, 
    { $set: fields },
    { new: true }
  );

  if (!result) {
    throw HttpError(404, "Material not found");
  }

    // Логируем действие
    await logAction({
      userId: req.user._id,
      action: 'update',
      entityType: 'Material',
      entityId: id,
      oldData: oldMaterial,
      newData: result.toObject(),
    });
  

  return res.status(200).json({
    status: "success",
    code: 200,
    data: {
      material: result,
    },
  });
};


const deleteMaterial = async (req, res) => {
  const { id } = req.params;

  // Проверяем, существует ли материал
  const materialToDelete = await Material.findById(id);
  if (!materialToDelete) {
    throw HttpError(404, "Material not found");
  }

  // 1. Обрабатываем связанные документы, исключая те, которые применимы ко всем материалам поставщика
  const documents = await Document.find({ 
    materialIds: id,
    applyToAllSupplierMaterials: { $ne: true } // Исключаем документы с applyToAllSupplierMaterials: true
  });

  if (documents && documents.length > 0) {
    for (const doc of documents) {
      // Проверяем, документ связан только с удаляемым материалом или с другими тоже
      if (doc.materialIds.length === 1 && doc.materialIds[0].toString() === id) {
        // Документ связан только с удаляемым материалом, удаляем документ

        // Логируем удаление документа перед его удалением
        await logAction({
          userId: req.user._id,
          action: 'delete',
          entityType: 'Document',
          entityId: doc._id,
          oldData: doc.toObject(),
        });

        // Удаляем документ из базы данных
        await Document.findByIdAndDelete(doc._id);

        // Если файлы хранятся на сервере, удаляем их физически
        if (doc.fileUrl) {
          await fs.promises.unlink(doc.fileUrl); // Удаляем файл
        }
      } else {
        // Документ связан с несколькими материалами, удаляем ID из materialIds
        const oldDoc = doc.toObject(); // Для логирования

        doc.materialIds = doc.materialIds.filter((materialId) => materialId.toString() !== id);
        await doc.save();

        // Логируем обновление документа
        await logAction({
          userId: req.user._id,
          action: 'update',
          entityType: 'Document',
          entityId: doc._id,
          oldData: oldDoc,
          newData: doc.toObject(),
        });
      }
    }
  }


  // 2. Обновляем родительские материалы
  if (materialToDelete.parentID && materialToDelete.parentID.length > 0) {
    // Удаляем материал из components родительских материалов
    await Material.updateMany(
      { _id: { $in: materialToDelete.parentID } },
      {
        $pull: { components: { _id: materialToDelete._id } },
      }
    );

    // Обновляем regulatoryCompliance у родительских материалов
    for (const parentId of materialToDelete.parentID) {
      const parentMaterial = await Material.findById(parentId);
      if (parentMaterial) {
        const oldParentData = parentMaterial.toObject(); // Для логирования

        // Пересчитываем regulatoryCompliance на основе оставшихся компонентов
        const complianceMap = new Map();

        if (parentMaterial.components && Array.isArray(parentMaterial.components)) {
          for (const component of parentMaterial.components) {
            if (component.regulatoryCompliance && Array.isArray(component.regulatoryCompliance)) {
              for (const compCompliance of component.regulatoryCompliance) {
                const key = compCompliance.title;

                if (!complianceMap.has(key)) {
                  complianceMap.set(key, {
                    _id: compCompliance._id,
                    title: compCompliance.title,
                    description: compCompliance.description,
                    status: compCompliance.status,
                  });
                } else {
                  // Обновляем статус на основе статусов всех компонентов
                  const existingStatus = complianceMap.get(key).status;
                  const newStatus = getCombinedStatus(existingStatus, compCompliance.status);
                  complianceMap.set(key, {
                    _id: compCompliance._id,
                    title: compCompliance.title,
                    description: compCompliance.description,
                    status: newStatus,
                  });
                }
              }
            }
          }
        }

        // Функция для определения комбинированного статуса
        function getCombinedStatus(status1, status2) {
          const statusPriority = {
            'does_not_comply': 1,
            'pending': 2,
            'comply_with_exceptions': 3,
            'comply': 4,
            'na': 5,
          };

          if (statusPriority[status1] < statusPriority[status2]) {
            return status1;
          } else {
            return status2;
          }
        }

        parentMaterial.regulatoryCompliance = Array.from(complianceMap.values());
        await parentMaterial.save();

        // Логируем обновление родительского материала
        await logAction({
          userId: req.user._id,
          action: 'update',
          entityType: 'Material',
          entityId: parentMaterial._id,
          oldData: oldParentData,
          newData: parentMaterial.toObject(),
        });
      }
    }
  }

  // 4. Обновляем дочерние материалы
  const childMaterials = await Material.find({ parentID: id });
  if (childMaterials && childMaterials.length > 0) {
    for (const child of childMaterials) {
      const oldChildData = child.toObject(); // Для логирования

      child.parentID = child.parentID.filter((parentId) => parentId.toString() !== id);
      await child.save();

      // Логируем обновление дочернего материала
      await logAction({
        userId: req.user._id,
        action: 'update',
        entityType: 'Material',
        entityId: child._id,
        oldData: oldChildData,
        newData: child.toObject(),
      });
    }
  }

  // 5. Удаляем сам материал
  await Material.findByIdAndDelete(id);

  // Логируем действие удаления материала
  await logAction({
    userId: req.user._id,
    action: 'delete',
    entityType: 'Material',
    entityId: id,
    oldData: materialToDelete.toObject(),
  });

  res.status(200).json({
    status: "success",
    code: 200,
    message: "Material and associated data deleted successfully",
    data: { deletedMaterial: materialToDelete },
  });
};


const searchMaterialsByPartNumber = async (req, res) => {
  const { partNumber } = req.query;

  if (!partNumber) {
    throw HttpError(400, "Kindly provide a part number to search");
  }

  // Используем регулярное выражение для поиска по частичному совпадению
  const materials = await Material.find({
    partNumber: { $regex: partNumber, $options: "i" }, // 'i' делает поиск нечувствительным к регистру
  }).limit(10)
  .populate('supplierId', '_id name'); 

  res.status(200).json({
    status: "success",
    code: 200,
    data: materials,
  });
};

const updateComplianceStatusWithDocument = async (req, res) => {
  const {
    regulations: rawRegulations,
    materialIds: rawMaterialIds,
    applyToAllSupplierMaterials,
    supplierId,
    documentTitle,
    type,
    version,
    attachments,
    effectiveDate,
    expiryDate,
    documentNumber,
    category,
    notes,
  } = req.body;

  const user = req.user;

  let regulations;
  let materialIds;

  // Парсинг regulations
  if (Array.isArray(rawRegulations)) {
    regulations = rawRegulations;
  } else if (typeof rawRegulations === 'string') {
    try {
      regulations = JSON.parse(rawRegulations);
    } catch (e) {
      throw HttpError(400, 'Invalid format for regulations. Must be a valid JSON string or array.');
    }
  } else {
    throw HttpError(400, 'Regulations must be an array or a JSON string representing an array.');
  }

  if (!Array.isArray(regulations) || regulations.length === 0) {
    throw HttpError(400, 'Regulations must be a non-empty array of objects.');
  }

  // Парсинг materialIds
  if (Array.isArray(rawMaterialIds)) {
    materialIds = rawMaterialIds;
  } else if (typeof rawMaterialIds === 'string') {
    try {
      materialIds = JSON.parse(rawMaterialIds);
    } catch (e) {
      materialIds = rawMaterialIds.split(',').map((id) => id.trim());
    }
  } else if (rawMaterialIds !== undefined) {
    materialIds = [rawMaterialIds.toString()];
  } else {
    materialIds = [];
  }

  console.log('Received materialIds:', materialIds);
  console.log('Received regulations:', regulations);

  // Проверка на наличие либо materialIds, либо applyToAllSupplierMaterials и supplierId
  if (!(materialIds.length > 0 || (applyToAllSupplierMaterials && supplierId))) {
    throw HttpError(
      400,
      'Either materialIds or applyToAllSupplierMaterials with a valid supplierId must be provided.'
    );
  }

  // Определение массива идентификаторов материалов для обновления
  let materialsToUpdate = [];

  if (applyToAllSupplierMaterials && supplierId) {
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      throw HttpError(404, `Supplier with ID ${supplierId} not found`);
    }

    const supplierMaterials = await Material.find({
      supplier: { $regex: new RegExp(`^${supplier.name}$`, 'i') },
    });

    if (!supplierMaterials || supplierMaterials.length === 0) {
      throw HttpError(404, `No materials found for supplier ${supplier.name}`);
    }

    materialsToUpdate = supplierMaterials.map((material) => material._id.toString());
  } else if (materialIds.length > 0) {
    materialsToUpdate = materialIds;
  }

  // Функция для обновления regulatoryCompliance у родительских материалов
  const updateParentRegulatoryCompliance = async (parentMaterial, regulation, childMaterials) => {
    const statuses = childMaterials
      .map((material) => {
        const compliance = material.regulatoryCompliance.find(
          (comp) => comp._id && comp._id.toString() === regulation._id.toString()
        );
        return compliance ? compliance.status : null;
      })
      .filter((status) => status !== null);

    // Определяем статус для родителя на основе статусов дочерних материалов
    let parentStatus;
    if (statuses.every((status) => status === 'comply')) {
      parentStatus = 'comply';
    } else if (statuses.some((status) => status === 'does_not_comply')) {
      parentStatus = 'does_not_comply';
    } else if (statuses.some((status) => status === 'comply_with_exceptions')) {
      parentStatus = 'comply_with_exceptions';
    } else if (statuses.every((status) => status === 'pending')) {
      parentStatus = 'pending';
    } else {
      parentStatus = 'pending';
    }

    // Обновляем или добавляем запись в regulatoryCompliance родителя
    if (!Array.isArray(parentMaterial.regulatoryCompliance)) {
      parentMaterial.regulatoryCompliance = [];
    }

    const existingIndex = parentMaterial.regulatoryCompliance.findIndex(
      (comp) => comp._id && comp._id.toString() === regulation._id.toString()
    );

    if (existingIndex > -1) {
      parentMaterial.regulatoryCompliance[existingIndex].status = parentStatus;
    } else {
      parentMaterial.regulatoryCompliance.push({
        _id: regulation._id,
        title: regulation.title,
        description: regulation.description,
        status: parentStatus,
      });
    }

    return parentMaterial.regulatoryCompliance;
  };

  // Функция для обновления regulatoryCompliance для материалов
  const updateRegulatoryComplianceForMaterials = async (materialIds, regulations) => {
    const materials = await Material.find({ _id: { $in: materialIds } }).lean();

    if (!materials || materials.length === 0) {
      console.log('No materials found for given materialIds.');
      return;
    }

    // Создаем объект для быстрого доступа к данным регуляторных актов
    const regulationMap = {};
    for (const reg of regulations) {
      const regulation = await Regulation.findById(reg.regulationId);
      if (!regulation) {
        throw HttpError(404, `Regulation with ID ${reg.regulationId} not found.`);
      }
      regulationMap[reg.regulationId] = {
        _id: reg.regulationId, // Используем _id вместо regulationId
        title: regulation.title,
        description: regulation.description,
        status: reg.status,
      };
    }

    // Сначала обновляем дочерние материалы
    const bulkOperations = [];

    for (const material of materials) {
      for (const reg of regulations) {
        const regulationId = reg.regulationId;
        const status = reg.status;
        const regulationData = regulationMap[regulationId];

        // Обновление существующего compliance
        bulkOperations.push({
          updateOne: {
            filter: { _id: material._id, 'regulatoryCompliance._id': regulationId },
            update: { $set: { 'regulatoryCompliance.$.status': status } },
          },
        });

        // Добавление нового compliance, если его нет
        bulkOperations.push({
          updateOne: {
            filter: {
              _id: material._id,
              'regulatoryCompliance._id': { $ne: regulationId },
            },
            update: {
              $addToSet: {
                regulatoryCompliance: {
                  _id: regulationId,
                  title: regulationData.title,
                  description: regulationData.description,
                  status: status || 'pending',
                },
              },
            },
          },
        });
      }
    }

    if (bulkOperations.length > 0) {
      await Material.bulkWrite(bulkOperations);
    }

    // После обновления заново получаем материалы
    const updatedMaterials = await Material.find({ _id: { $in: materialIds } }).lean();

    // Обновляем родительские материалы
    const parentMaterialIds = new Set();
    materials.forEach((material) => {
      if (Array.isArray(material.parentID)) {
        material.parentID.forEach((parentId) => {
          parentMaterialIds.add(parentId.toString());
        });
      }
    });

    if (parentMaterialIds.size > 0) {
      const parentMaterials = await Material.find({ _id: { $in: Array.from(parentMaterialIds) } });
      for (const parentMaterial of parentMaterials) {
        // Отфильтровываем дочерние материалы для текущего родителя
        const childMaterials = updatedMaterials.filter(
          (material) =>
            Array.isArray(material.parentID) &&
            material.parentID.some((pid) => pid.toString() === parentMaterial._id.toString())
        );

        // Обновляем regulatoryCompliance у родителя для каждого регуляторного акта
        for (const reg of regulations) {
          const regulationId = reg.regulationId;
          const regulationData = regulationMap[regulationId];

          await updateParentRegulatoryCompliance(parentMaterial, regulationData, childMaterials);
        }

        // Обновляем компоненты родителя
        parentMaterial.components = parentMaterial.components.map((component) => {
          const matchingMaterial = updatedMaterials.find(
            (m) => m.partNumber === component.partNumber
          );
          if (matchingMaterial && matchingMaterial.regulatoryCompliance) {
            component.regulatoryCompliance = matchingMaterial.regulatoryCompliance;
          } else {
            console.log(`Нет данных regulatoryCompliance для компонента ${component.partNumber}`);
          }
          return component;
        });

        // Сохраняем родительский материал
        await parentMaterial.save();
      }
    }
  };

  // Проверка, требуется ли загрузка документа для выбранных статусов
  let fileUrl = null;
  if (req.file) {
    fileUrl = req.file.path;
  }

  const statusesThatRequireDocument = ['comply', 'does_not_comply', 'comply_with_exceptions'];

  const requiresDocument = regulations.some((reg) =>
    statusesThatRequireDocument.includes(reg.status)
  );

  if (requiresDocument && !fileUrl) {
    throw HttpError(400, 'Document is required for the selected statuses.');
  }

  // Обновление regulatoryCompliance для материалов
  await updateRegulatoryComplianceForMaterials(materialsToUpdate, regulations);

  // Если загружен документ, сохраняем его в базе данных
  let newDocument = null;
  if (fileUrl) {
    newDocument = await Document.create({
      title: documentTitle || 'Compliance Document',
      fileUrl,
      materialIds: materialsToUpdate,
      supplierId: supplierId || null,
      applyToAllSupplierMaterials: !!applyToAllSupplierMaterials,
      uploadedBy: {
        _id: user._id,
        name: user.name,
        role: user.role,
      },
      type: type || 'other',
      version: version || 1,
      regulations: regulations.map((reg) => ({
        _id: reg.regulationId, 
        status: reg.status,
      })),
      attachments: attachments || [],
      effectiveDate: effectiveDate || null,
      expiryDate: expiryDate || null,
      documentNumber: documentNumber || '',
      description: notes || '',
      category: category || 'other',
      notes: notes || '',
    });


    await logAction({
      userId: req.user._id,
      action: 'create',
      entityType: 'Document',
      entityId: newDocument._id,
      newData: newDocument.toObject(),
    });
  }

  res.status(200).json({
    status: 'success',
    code: 200,
    data: {
      message: 'Compliance statuses updated successfully.',
      document: newDocument,
    },
  });
};

export default {
  getAll: [filterAndSort, ctrlWrapper(getAllMaterials)],
  getById: ctrlWrapper(getByID),
  updateByID: ctrlWrapper(updateByID),
  createMaterial: ctrlWrapper(createMaterial),
  deleteMaterial: ctrlWrapper(deleteMaterial),
  searchMaterialsByPartNumber: ctrlWrapper(searchMaterialsByPartNumber),
  updateComplianceStatusWithDocument: ctrlWrapper(updateComplianceStatusWithDocument)
};
