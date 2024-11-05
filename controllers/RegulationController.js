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

  const userId = req.user._id;

  // Проверка на обязательные поля
  if (!regulationTitle || !regulationDescription) {
    throw HttpError(400, "Request body is missing required fields. Please add regulationTitle and regulationDescription");
  }

  // Проверка наличия либо materialId, либо applyToAllSupplierMaterials и supplierId
  if (!(materialId || (applyToAllSupplierMaterials && supplierId))) {
    throw HttpError(400, "Either materialId or applyToAllSupplierMaterials with a valid supplierId must be provided.");
  }

  const existingRegulation = await Regulation.findOne({ title: regulationTitle });
  if (existingRegulation) {
    throw HttpError(409, "Regulation with this title already exists.");
  }

  // Создание нового regulation 
  const newRegulation = await Regulation.create({ title: regulationTitle, description: regulationDescription });

  let fileUrl = null;
  if (req.file) {
    fileUrl = req.file.path; 
  }

  // Определяем массив идентификаторов материалов
  let materialIds = applyToAllSupplierMaterials ? [] : [materialId];
  
  // Функция для обновления regulatoryCompliance для указанных материалов и их родителей
  const updateRegulatoryComplianceForMaterials = async (materialIds, regulationId, status, regulationTitle, regulationDescription) => {
    const materials = await Material.find({ _id: { $in: materialIds } }).lean();

    if (!materials || materials.length === 0) {
      console.log('No materials found for given materialIds.');
      return;
    }

    // Обновляем compliance для дочерних материалов
    const bulkOperations = materials.map((material) => {
      console.log("Processing material ID:", material._id);
      const updateOps = {
        updateOne: {
          filter: { _id: material._id, "regulatoryCompliance.regulationId": regulationId },
          update: { $set: { "regulatoryCompliance.$.status": status } }
        }
      };

      const addRegulationOps = {
        updateOne: {
          filter: { _id: material._id, "regulatoryCompliance.regulationId": { $ne: regulationId } },
          update: {
            $addToSet: {
              regulatoryCompliance: {
                regulationId: regulationId,
                title: regulationTitle,
                description: regulationDescription,
                status: status || "pending",
              }
            }
          }
        }
      };
      console.log("Adding operations for material:", material._id);
      return [updateOps, addRegulationOps];
    }).flat();

    if (bulkOperations.length > 0) {
      await Material.bulkWrite(bulkOperations);
    }

    const updatedMaterials = await Material.find({ _id: { $in: materialIds } }).lean();
   

    const parentMaterialIds = materials.filter(m => m.parentID).map(m => m.parentID);
    if (parentMaterialIds.length > 0) {
      const parentMaterials = await Material.find({ _id: { $in: parentMaterialIds } });
      for (const parentMaterial of parentMaterials) {
      

        const updatedRegulatoryCompliance = await updateParentRegulatoryCompliance(parentMaterial, {
          regulationId,
          title: regulationTitle,
          description: regulationDescription,
          status
        });
 

        parentMaterial.regulatoryCompliance = updatedRegulatoryCompliance;
        parentMaterial.components = parentMaterial.components.map(component => {
          const matchingMaterial = updatedMaterials.find(m => m.partNumber === component.partNumber);
          if (matchingMaterial && matchingMaterial.regulatoryCompliance && matchingMaterial.regulatoryCompliance.length > 0) {

            component.regulatoryCompliance = matchingMaterial.regulatoryCompliance;
          }
          return component;
        });

        await parentMaterial.save();
      }
    }
  };

  if (applyToAllSupplierMaterials && supplierId) {
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      throw HttpError(404, `Supplier with ID ${supplierId} not found`);
    }
  
    // Поиск материалов по имени поставщика, если поле supplier в материалах — это строка
    const supplierMaterials = await Material.find({ supplier: { $regex: new RegExp(`^${supplier.name}$`, 'i') } });
    
    if (supplierMaterials.length === 0) {
      throw HttpError(404, `No materials found for supplier with ID ${supplierId}`);
    }
    
    materialIds = supplierMaterials.map((material) => material._id);
    await updateRegulatoryComplianceForMaterials(materialIds, newRegulation._id, status, regulationTitle, regulationDescription);
  }

  const newDocument = await Document.create({
    title: documentTitle,
    fileUrl,
    materialIds,
    supplierId: supplierId || null,
    applyToAllSupplierMaterials: !!applyToAllSupplierMaterials,
    uploadedBy: userId,
    type: type || "other",
    version: version || 1,
    regulationId: newRegulation._id,
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
      regulation: newRegulation,
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
