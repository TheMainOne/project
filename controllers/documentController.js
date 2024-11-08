import mongoose from 'mongoose';
import Document from "../services/schemas/document.js";
import Regulation from "../services/schemas/regulation.js"
import Supplier from "../services/schemas/supplier.js"
import Material from "../services/schemas/material.js"
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";
import {updateParentRegulatoryCompliance} from "../utils/materialHelpers.js"
import { isValidObjectId } from "mongoose";


  // что мне нужно сделать:
  //1 переписать логику контроллера для документа, чтобы если передавались materialIds то я менял в коллекции materials поля regulatoryCompliance в зависимости от статуса загруженного документа (если уже в поле regulatoryCompliance есть этот регуляторный акт - обновить данные по статусу, если нету - добавить новый регулирующий акт со всеми необходимыми полями). 
//2 если передавались applyToAllSupplierMaterials и supplierId то ищу все материалы поставщика и обновляю им поле regulatoryCompliance как описано выше. И так же в этот документ добавлял все материалы поставщика в поле materialIds
//3 в контроллере при создании нового материала проверяю есть ли в базе данных документы, относящиеся ко всем поставщикам. Если есть, то тогда поле regulatoryCompliance обновляю в зависимости от документа, который есть.


const createDocument = async (req, res) => {
  const {
    title,
    fileUrl,
    materialIds,
    supplierId,
    type,
    version,
    applyToAllSupplierMaterials,
    regulationId,
    status,
    attachments,
    effectiveDate,
    expiryDate,
    documentNumber,
    description,
    category,
    notes
  } = req.body;

  const currentUser = req.user;

  

  // Проверка на существование документа с таким же fileUrl
  const existingDocument = await Document.findOne({ fileUrl });
  if (existingDocument) {
    throw HttpError(409, "Document with this file URL already exists");
  }

  // Проверка на наличие обоих полей materialIds и applyToAllSupplierMaterials одновременно
  if (applyToAllSupplierMaterials && materialIds && materialIds.length > 0) {
    throw HttpError(400, "Cannot set both materialIds and applyToAllSupplierMaterials to true.");
  }

  // Проверка на наличие regulationId и status
  if (!regulationId || !status) {
    throw HttpError(400, "Both regulationId and status are required.");
  }

// Проверка на наличие supplierId и applyToAllSupplierMaterials
if ((supplierId && !applyToAllSupplierMaterials) || (applyToAllSupplierMaterials && !supplierId)) {
  throw HttpError(400, "Both supplierId and applyToAllSupplierMaterials must be provided together.");
}

  // Получаем данные регуляторного акта
  const regulation = await Regulation.findById(regulationId);
  if (!regulation) {
    throw HttpError(404, `Regulation with ID ${regulationId} not found`);
  }

  const regulationTitle = regulation.title;
  const regulationDescription = regulation.description;

  let materialsForDocument = materialIds || [];

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

    // После этого обновляем родительские материалы
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

  // Отфильтровываем дочерние компоненты для текущего родительского материала из updatedMaterials
  const childMaterials = updatedMaterials.filter(
    material => Array.isArray(material.parentID) && material.parentID.some(pid => pid.toString() === parentMaterial._id.toString())
);

            const updatedRegulatoryCompliance = await updateParentRegulatoryCompliance(parentMaterial, {
                _id: regulationId,
                title: regulationTitle,
                description: regulationDescription,
                status
            }, childMaterials );

            // Обновляем regulatoryCompliance у родителя
            parentMaterial.regulatoryCompliance = updatedRegulatoryCompliance;

            // Обновляем информацию в поле components у родителя
            parentMaterial.components = parentMaterial.components.map(component => {
              const matchingMaterial = updatedMaterials.find(m => m.partNumber === component.partNumber);
              if (matchingMaterial && matchingMaterial.regulatoryCompliance && matchingMaterial.regulatoryCompliance.length > 0) {
                  // Обновляем regulatoryCompliance для компонента
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

  // Если переданы materialIds, обновляем regulatoryCompliance для этих материалов
  if (materialIds && materialIds.length > 0) {
    await updateRegulatoryComplianceForMaterials(
      materialIds,
      regulationId,
      status,
      regulation.title,
      regulation.description
    );
  }

  // Если документ применим ко всем материалам поставщика
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

    await updateRegulatoryComplianceForMaterials(materialsForDocument, regulationId, status, regulationTitle, regulationDescription);
  }

  // Создание нового документа
  const newDocument = await Document.create({
    title,
    fileUrl,
    materialIds: materialsForDocument,
    supplierId: supplierId || null,
    applyToAllSupplierMaterials: !!applyToAllSupplierMaterials,
    uploadedBy: 
    {
      _id: currentUser._id,
      name: currentUser.name,
      role: currentUser.role,
    },
    type: type || "other",
    version: version || 1,
    regulationIds: [regulationId] || null,
    status: status || "pending",
    attachments: attachments || [],
    effectiveDate: effectiveDate || null,
    expiryDate: expiryDate || null,
    documentNumber: documentNumber || "",
    description: description || "",
    category: category || "other",
    notes: notes || ""
  });

  res.status(201).json({
    status: "success",
    code: 201,
    data: {
      document: newDocument,
    },
  });
};

const getDocumentsForMaterialAndRegulation = async (req, res) => {
  const { materialId, regulationId } = req.query; // Получение параметров из запроса


    // Проверка наличия обязательных параметров
    if (!materialId || !regulationId) {
      throw HttpError(400, "Both materialId and regulationId are required");
    }

    // Проверка на валидный Mongoose ObjectID
    if (!isValidObjectId(materialId)) {
      throw HttpError(400, `${materialId} is not a valid ObjectId.`);
    }
    if (!isValidObjectId(regulationId)) {
      throw HttpError(400, `${regulationId} is not a valid ObjectId.`);
    }

    // Проверка существования материала
    const material = await Material.findById(materialId);
    if (!material) {
      throw HttpError(404, `Material with ID ${materialId} not found`);
    }

    // Проверка существования регулирования
    const regulation = await Regulation.findById(regulationId);
    if (!regulation) {
      throw HttpError(404, `Regulation with ID ${regulationId} not found`);
    }

    // Поиск документов по materialId и regulationId
    const documents = await Document.find({
      materialIds: materialId,
      regulationId: regulationId,
    }).lean();

    // Проверка наличия документов
    if (!documents || documents.length === 0) {
      throw HttpError(404, "No documents found for the specified material and regulation");
    }

    res.status(200).json({
      status: "success",
      code: 200,
      data: {
        documents,
      },
    });

};


export default {
    createDocument: ctrlWrapper(createDocument),
    getDocumentsForMaterialAndRegulation: ctrlWrapper(getDocumentsForMaterialAndRegulation),
  };
  