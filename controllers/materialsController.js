import Material from "../services/schemas/material.js";
import Supplier from "../services/schemas/supplier.js"
import Document from "../services/schemas/document.js";
import Regulation from "../services/schemas/regulation.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";
import filterAndSort from "../middlewares/filterAndSort.js";


const getAllMaterials = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  // Используем фильтры и сортировку, переданные через middleware
  const filter = req.filter || {};
  const sort = req.sort || { createdAt: -1 }; // Сортировка по умолчанию по дате создания

  // Выполняем запрос с фильтрацией и сортировкой
  const materials = await Material.find(filter)
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

  const result = await Material.findById(id, "-createdAt -updatedAt");

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
  const { partNumber, supplier, regulatoryCompliance = [] } = req.body;

  const existingMaterial = await Material.findOne({ partNumber });

  if (existingMaterial) {
    return res.status(409).json({
      status: "error",
      code: 409,
      message: "Material with this part number already exists",
      data: {
        material: existingMaterial,
      },
    });
  }

  // Проверяем, что регуляторные акты существуют в коллекции regulations и если существуют присваиваем им правильный _id
  if (regulatoryCompliance.length > 0) {
    for (const compliance of regulatoryCompliance) {
      const regulation = await Regulation.findById(compliance._id);
      if (!regulation) {
        return res.status(404).json({
          status: "error",
          code: 404,
          message: `Regulation with ID ${compliance._id} not found. Please create a new regulation first.`,
        });
      }
    }
  }

   // Инициализируем updatedRegulatoryCompliance с предоставленным regulatoryCompliance
   let updatedRegulatoryCompliance = [...regulatoryCompliance];

  let supplierId = null;
  let supplierDocuments = [];

  // Если указан поставщик, выполняем дополнительную логику
  if (supplier) {
    const supplierRecord = await Supplier.findOne({ name: supplier });
    if (supplierRecord) {
      supplierId = supplierRecord._id;

  // Поиск документов, применимых ко всем материалам поставщика
  supplierDocuments = await Document.find({
    applyToAllSupplierMaterials: true,
    supplierId: supplierId,
  });

      if (supplierDocuments.length > 0) {
        for (const doc of supplierDocuments) {
          // Получаем информацию о регуляторном акте
          const regulation = await Regulation.findById(doc.regulationId);
          if (!regulation) {
            return res.status(404).json({
              status: "error",
              code: 404,
              message: `Regulation with ID ${doc.regulationId} not found.`,
            });
          }

          // Проверяем, есть ли уже этот регуляторный акт в regulatoryCompliance
          const existingComplianceIndex = updatedRegulatoryCompliance.findIndex(
            (comp) => comp._id.toString() === doc.regulationId.toString()
          );

          if (existingComplianceIndex > -1) {
            // Обновляем статус на основе статуса из документа
            updatedRegulatoryCompliance[existingComplianceIndex].status = doc.status;
          } else {
            // Добавляем новый регуляторный акт
            updatedRegulatoryCompliance.push({
              _id: doc.regulationId,
              title: regulation.title,
              description: regulation.description,
              status: doc.status || "pending",
            });
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
    regulatoryCompliance: updatedRegulatoryCompliance,
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

  if (!id) {
    return res.status(400).json({
      status: "error",
      code: 400,
      message: "The Material ID is required to perform the update operation",
    });
  }

  // Проверяем, есть ли поля для обновления или relatedParentId
  if (!fields || Object.keys(fields).length === 0) {
    if (!relatedParentId) {
      return res.status(400).json({
        status: "error",
        code: 400,
        message: "No fields were provided for the update.",
      });
    }
  }

  let material = await Material.findById(id); // Ищем материал по ID

  if (!material) {
    return res.status(404).json({
      status: "error",
      code: 404,
      message: "Material not found",
    });
  }

  // Если в запросе передан relatedParentId
  if (relatedParentId) {
    const newParentMaterial = await Material.findById(relatedParentId);
    if (!newParentMaterial) {
      return res.status(404).json({
        status: "error",
        code: 404,
        message: "Parent Material not found",
      });
    }

    // Проверяем, существует ли уже этот материал как компонент у родителя, чтобы избежать дублирования
    const isComponentAlreadyExists = newParentMaterial.components.some(
      (comp) => comp &&
        comp._id &&
        comp._id.equals(material._id)

    );

    if (isComponentAlreadyExists) {
      return res.status(400).json({
        status: "fail",
        code: 400,
        message: "This material is already a component of the parent material.",
      });
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

  // Обновляем материал с переданными полями
  const result = await Material.findByIdAndUpdate(
    id, 
    { $set: fields },
    { new: true }
  );

  if (!result) {
    return res.status(404).json({
      status: "error",
      code: 404,
      message: "Material not found",
    });
  }

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

  const deletedMaterial = await Material.findByIdAndDelete(id);

  if (!deletedMaterial) {
    throw HttpError(404, "Material not found");
  }

  res.status(200).json({
    status: "success",
    code: 200,
    message: "Material deleted successfully",
    data: { deletedMaterial },
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
  }).limit(10); // Ограничиваем количество результатов до 10

  res.status(200).json({
    status: "success",
    code: 200,
    data: materials,
  });
};

export default {
  getAll: [filterAndSort, ctrlWrapper(getAllMaterials)],
  getById: ctrlWrapper(getByID),
  updateByID: ctrlWrapper(updateByID),
  createMaterial: ctrlWrapper(createMaterial),
  deleteMaterial: ctrlWrapper(deleteMaterial),
  searchMaterialsByPartNumber: ctrlWrapper(searchMaterialsByPartNumber),
};
