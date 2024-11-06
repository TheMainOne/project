import Regulation from "../services/schemas/regulation.js";
import Supplier from '../services/schemas/supplier.js';
import Document from "../services/schemas/document.js";
import Material from "../services/schemas/material.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";
import {updateParentRegulatoryCompliance} from "../utils/materialHelpers.js"



const getAllRegulations = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const results = await Regulation.find({}).skip(skip).limit(limit).exec();

  const count = await Regulation.countDocuments();

  res.json({
    status: "success",
    code: 200,
    data: {
      regulations: results,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    },
  }); 
}

const getRegulationByID = async (req, res) => {
  const {id} = req.params;

  const result = await Regulation.findById(id, "-createdAt -updatedAt");

  if (!result) {
    throw HttpError(404, "Not found");
  }

  res.json({
    status: "success",
    code: 200,
    data: { material: result },
  });
};


const addNewRegulation = async (req, res) => {
  const { title, description } = req.body;
  
  //checking if the request body was sent with request
  if (!title || !description) {
    throw HttpError(400, "Request body is missing");
  }

  const existingRegulation = await Regulation.findOne({ title });

  //checking if the same regulation already exist
  if (existingRegulation) {
    throw HttpError(409, "Regulation with this title already exists");
  }

  const newRegulation = await Regulation.create({ ...req.body });

  res.status(201).json({
    status: "success",
    code: 201,
    data: {
      regulation: newRegulation,
    },
  });
};


const addNewRegulationWithDocument = async (req, res) => {
  const {
    regulationTitle,
    regulationDescription,
    documentTitle,
    status,
    applyToAllSupplierMaterials,
    materialId,
    supplierId,
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

  // Проверка на обязательные поля
  if (!regulationTitle || !regulationDescription) {
    throw HttpError(400, "Request body is missing required fields. Please add regulationTitle and regulationDescription");
  }

  // Проверка наличия либо materialId, либо applyToAllSupplierMaterials и supplierId
  if (!(materialId || (applyToAllSupplierMaterials && supplierId))) {
    throw HttpError(400, "Either materialId or applyToAllSupplierMaterials with a valid supplierId must be provided.");
  }

  // Проверка на существование регуляторного акта с таким названием
  let regulation = await Regulation.findOne({ title: regulationTitle });
  if (regulation) {
    throw HttpError(409, "Regulation with this title already exists.");
  }

  // Создание нового регуляторного акта
  regulation = await Regulation.create({ title: regulationTitle, description: regulationDescription });

  // Получение пути к файлу из req.file
  let fileUrl = null;
  if (req.file) {
    fileUrl = req.file.path;
  }

  // Определение массива идентификаторов материалов
  let materialsForDocument = [];

  if (applyToAllSupplierMaterials && supplierId) {
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      throw HttpError(404, `Supplier with ID ${supplierId} not found`);
    }

    const supplierName = supplier.name; // Получаем имя поставщика
    const supplierMaterials = await Material.find({ supplier: { $regex: new RegExp(`^${supplierName}$`, 'i') } });

    if (!supplierMaterials || supplierMaterials.length === 0) {
      throw HttpError(404, `No materials found for supplier ${supplierName}`);
    }

    materialsForDocument = supplierMaterials.map((material) => material._id);

    if (materialsForDocument.length === 0) {
      throw HttpError(404, `No materials found for supplier ${supplierName}`);
    }
  } else if (materialId) {
    materialsForDocument = [materialId];
  }

  // Функция для обновления regulatoryCompliance для указанных материалов и их родителей
  const updateRegulatoryComplianceForMaterials = async (materialIds, regulationId, status, regulationTitle, regulationDescription) => {
    const materials = await Material.find({ _id: { $in: materialIds } }).lean();

    if (!materials || materials.length === 0) {
      console.log('No materials found for given materialIds.');
      return;
    }

    // Сначала обновляем дочерние материалы
    const bulkOperations = materials.map((material) => {
      const updateOps = {
        updateOne: {
          filter: { _id: material._id, "regulatoryCompliance._id": regulationId },
          update: { $set: { "regulatoryCompliance.$.status": status } }
        }
      };

      const addRegulationOps = {
        updateOne: {
          filter: { _id: material._id, "regulatoryCompliance._id": { $ne: regulationId } },
          update: {
            $addToSet: {
              regulatoryCompliance: {
                _id: regulationId,
                title: regulationTitle,
                description: regulationDescription,
                status: status || "pending",
              }
            }
          }
        }
      };

      return [updateOps, addRegulationOps];
    }).flat();

    if (bulkOperations.length > 0) {
      await Material.bulkWrite(bulkOperations);
    }

    // После обновления в базе данных заново получаем материалы
    const updatedMaterials = await Material.find({ _id: { $in: materialIds } }).lean();

    // Обновляем родительские материалы
    const parentMaterialIds = new Set();
    materials.forEach(material => {
      if (Array.isArray(material.parentID)) {
        material.parentID.forEach(parentId => {
          parentMaterialIds.add(parentId.toString());
        });
      }
    });

    if (parentMaterialIds.size > 0) {
      const parentMaterials = await Material.find({ _id: { $in: Array.from(parentMaterialIds) } });
      for (const parentMaterial of parentMaterials) {

        // Отфильтровываем дочерние материалы для текущего родителя
        const childMaterials = updatedMaterials.filter(
          material => Array.isArray(material.parentID) && material.parentID.some(pid => pid.toString() === parentMaterial._id.toString())
        );

        const updatedRegulatoryCompliance = await updateParentRegulatoryCompliance(parentMaterial, {
          _id: regulationId,
          title: regulationTitle,
          description: regulationDescription,
          status
        }, childMaterials);

        // Обновляем regulatoryCompliance у родителя
        parentMaterial.regulatoryCompliance = updatedRegulatoryCompliance;

        // Обновляем компоненты родителя
        parentMaterial.components = parentMaterial.components.map(component => {
          const matchingMaterial = updatedMaterials.find(m => m.partNumber === component.partNumber);
          if (matchingMaterial && matchingMaterial.regulatoryCompliance && matchingMaterial.regulatoryCompliance.length > 0) {
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

  // Функция updateParentRegulatoryCompliance (оставьте как есть или обновите по аналогии с createDocument)

  // Обновление regulatoryCompliance для материалов
  if (materialsForDocument.length > 0) {
    await updateRegulatoryComplianceForMaterials(
      materialsForDocument,
      regulation._id,
      status,
      regulationTitle,
      regulationDescription
    );
  }

  // Создание нового документа
  const newDocument = await Document.create({
    title: documentTitle,
    fileUrl,
    materialIds: materialsForDocument,
    supplierId: supplierId || null,
    applyToAllSupplierMaterials: !!applyToAllSupplierMaterials,
    uploadedBy: {
      _id: user._id,
      name: user.name,
      role: user.role,
    },
    type: type || "other",
    version: version || 1,
    regulationId: regulation._id,
    status: status || "pending",
    attachments: attachments || [],
    effectiveDate: effectiveDate || null,
    expiryDate: expiryDate || null,
    documentNumber: documentNumber || "",
    description: regulationDescription || "",
    category: category || "other",
    notes: notes || "",
  });

  res.status(201).json({
    status: "success",
    code: 201,
    data: {
      regulation,
      document: newDocument,
    },
  });
};


const updateRegulationByID = async (req, res) => {
  const { id } = req.params;
  const fields = req.body;

     if (!id) {
      throw HttpError(400, "The Regulation ID is required to perform the update operation");
    }

  if (!fields || Object.keys(fields).length === 0) {
    throw HttpError(400, "No fields were provided for the update");
  }
  
  const result = await Regulation.findByIdAndUpdate(id, fields, { new: true });

    if (!result) {
      return res.status(404).json({
        status: "error",
        code: 404,
        message: "Contact not found",
      });
    }

    return res.status(200).json({
      status: "success",
      code: 200,
      data: {
        regulation: result,
      }
    });
}

const deleteRegulationById = async (req, res) => {
  const { id } = req.params;

  const deletedRegulation = await Regulation.findByIdAndDelete(id);

  if (!deletedRegulation) {
    throw HttpError(404, "Regulation not found");
  }

  res.status(200).json({
    status: "success",
    code: 200,
    message: "Regulation deleted successfully",
    data: { deletedRegulation },
  });
};

const searchRegulationByTitle = async (req, res) => {
  const { title } = req.query;

  if (!title) {
    throw HttpError(400, "Please provide a title to search");
  }

  // Используем регулярное выражение для поиска по частичному совпадению
  const regulations = await Regulation.find({
    title: { $regex: title, $options: 'i' }, // 'i' делает поиск нечувствительным к регистру
  }).limit(10); // Ограничиваем количество результатов до 10


    // Если ничего не найдено, возвращаем пустой массив и сообщение
    if (regulations.length === 0) {
      return res.status(200).json({
        status: 'success',
        code: 200,
        message: 'No regulations found',
        data: [],
      });
    }

  res.status(200).json({
    status: 'success',
    code: 200,
    data: regulations,
  });
};



export default {
  addRegulation: ctrlWrapper(addNewRegulation),
  getAllRegulations: ctrlWrapper(getAllRegulations),
  updateRegulation: ctrlWrapper(updateRegulationByID),
  getRegulationById: ctrlWrapper(getRegulationByID),
  deleteRegulationById: ctrlWrapper(deleteRegulationById),
  searchRegulationByTitle: ctrlWrapper(searchRegulationByTitle),
  addNewRegulationWithDocument: ctrlWrapper(addNewRegulationWithDocument)
};
