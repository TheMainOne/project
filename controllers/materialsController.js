import Material from "../services/schemas/material.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";
import { isValidObjectId } from "mongoose";

const getAllMaterials = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;


  const materials = await Material.find({})
  .sort({ createdAt: -1 }) // Сортирует материалы от новых к более старым 
  .skip(skip)
  .limit(limit)
  .exec();

  const count = await Material.countDocuments();

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
  const { partNumber } = req.body;

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

  const newMaterial = await Material.create({ ...req.body });

  res.status(201).json({
    status: "success",
    code: 201,
    data: {
      material: newMaterial,
    },
  });
}


function updateParentRegulatoryCompliance(parentMaterial) {
  const allRegulations = new Map();

  // Рекурсивная функция для обхода всех компонентов
  function traverseComponents(components) {
    components.forEach(component => {
      component.regulatoryCompliance.forEach(regulation => {
        if (!allRegulations.has(regulation.title)) {
          allRegulations.set(regulation.title, { ...regulation, status: [] });
        }

        // Добавляем статус для каждой регуляции
        const regulationData = allRegulations.get(regulation.title);
        regulationData.status.push(regulation.status);
      });

      // Если у компонента есть вложенные компоненты, продолжаем обход рекурсивно
      if (component.components && component.components.length > 0) {
        traverseComponents(component.components);
      }
    });
  }

  // Запускаем рекурсивную функцию для компонентов родителя
  traverseComponents(parentMaterial.components);

  // Определяем статус для каждой регуляции у родителя
  const updatedRegulatoryCompliance = [];
  allRegulations.forEach((regulationData, title) => {
    const statuses = regulationData.status;

    let finalStatus;
    
    // Приоритет статусов
    if (statuses.every(status => status === 'na')) {
      finalStatus = 'na';
    } else if (statuses.every(status => status === 'comply')) {
      finalStatus = 'comply';
    } else if (statuses.includes('does_not_comply')) {
      finalStatus = 'does_not_comply';
    } else if (statuses.includes('pending')) {
      finalStatus = 'pending';
    } else if (statuses.includes('comply') && statuses.some(status => status !== 'comply')) {
      finalStatus = 'comply_with_exceptions';
    }

    // Устанавливаем итоговый статус
    regulationData.status = finalStatus;
    updatedRegulatoryCompliance.push(regulationData);
  });

  return updatedRegulatoryCompliance;
}

const updateByID = async (req, res) => {
  const { id } = req.params;
  const { relatedParentId, ...fields } = req.body;  // Извлекаем relatedParentId, если оно есть

  if (!id) {
    return res.status(400).json({
      status: "error",
      code: 400,
      message: "The Material ID is required to perform the update operation",
    });
  }
  console.log(isValidObjectId(relatedParentId));



  // Если нет полей для обновления и нет relatedParentId, выкидываем ошибку
  if (!fields || Object.keys(fields).length === 0) {
    if (!relatedParentId) {
      return res.status(400).json({
        status: "error",
        code: 400,
        message: "No fields were provided for the update.",
      });
    }
  }

  let material = await Material.findById(id);  // Ищем материал по ID

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


   // Проверяем, существует ли уже этот материал как компонент у родителя чтобы избежать дублирования 
   const isComponentAlreadyExists = newParentMaterial.components.some(
    (comp) => comp && comp.partNumber && comp.partNumber === material.partNumber
  );

  if (isComponentAlreadyExists) {
    return res.status(400).json({
      status: "fail",
      code: 400,
      message: "This material is already a component of the parent material.",
    });
  }


   // Если материал уже был компонентом другого материала
   if (material.parentID) {
    const previousParent = await Material.findById(material.parentID);
    if (previousParent) {
      // Убедимся, что у previousParent есть компоненты и _id у компонента
      previousParent.components = previousParent.components.filter(
        comp => comp && comp._id && comp._id.toString() !== id
      );
      await previousParent.save();
    }
  }
  
  // Обновляем поле parentID у текущего материала перед добавлением в нового родителя
  material.parentID = relatedParentId;

      // Добавляем материал в components нового родителя
      newParentMaterial.components.push(material);

    // Обновляем regulatoryCompliance для родителя
    const updatedRegulatoryCompliance = updateParentRegulatoryCompliance(newParentMaterial);
    newParentMaterial.regulatoryCompliance = updatedRegulatoryCompliance;


    await newParentMaterial.save();
  }

  // Обновляем материал с переданными полями
  const result = await Material.findByIdAndUpdate(id, { $set: fields }, { new: true });

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
      material: result
    }
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
      partNumber: { $regex: partNumber, $options: 'i' }, // 'i' делает поиск нечувствительным к регистру
    }).limit(10); // Ограничиваем количество результатов до 10

    res.status(200).json({
      status: 'success',
      code: 200,
      data: materials,
    });
};



export default {
  getAll: ctrlWrapper(getAllMaterials),
  getById: ctrlWrapper(getByID),
  updateByID: ctrlWrapper(updateByID),
  createMaterial: ctrlWrapper(createMaterial),
  deleteMaterial: ctrlWrapper(deleteMaterial),
  searchMaterialsByPartNumber: ctrlWrapper(searchMaterialsByPartNumber)
};
