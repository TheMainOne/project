import mongoose from 'mongoose';
import Document from "../services/schemas/document.js";
import Regulation from "../services/schemas/regulation.js"
import Supplier from "../services/schemas/supplier.js"
import Material from "../services/schemas/material.js"
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";
import logAction from '../utils/logAction.js';
// import {updateParentRegulatoryCompliance} from "../utils/materialHelpers.js"
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
    regulations: rawRegulations,
    attachments,
    effectiveDate,
    expiryDate,
    documentNumber,
    description,
    category,
    notes,
  } = req.body;

  const currentUser = req.user;
  const userId = req.user._id;

  // Проверка на существование документа с таким же fileUrl
  const existingDocument = await Document.findOne({ fileUrl });
  if (existingDocument) {
    throw HttpError(409, 'Document with this file URL already exists');
  }

  // Проверка на наличие обоих полей materialIds и applyToAllSupplierMaterials одновременно
  if (applyToAllSupplierMaterials && materialIds && materialIds.length > 0) {
    throw HttpError(400, 'Cannot set both materialIds and applyToAllSupplierMaterials to true.');
  }

  // Проверка на наличие regulations
  let regulations;
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
    throw HttpError(400, 'Regulations are required and must be a non-empty array.');
  }

  // Получаем данные регуляторных актов и проверяем их существование
  const regulationIds = regulations.map((reg) => reg._id);
  const fetchedRegulations = await Regulation.find({ _id: { $in: regulationIds } });
  if (fetchedRegulations.length !== regulations.length) {
    throw HttpError(404, 'One or more regulations not found.');
  }

  let materialsForDocument = materialIds || [];

  // Функция для обновления regulatoryCompliance для указанных материалов и их родителей
  const updateRegulatoryComplianceForMaterials = async (materialIds, regulations) => {
    const materials = await Material.find({ _id: { $in: materialIds } });

    if (!materials || materials.length === 0) {
      console.log('No materials found for given materialIds.');
      return;
    }

    // Создаем объект для быстрого доступа к данным регуляторных актов
    const regulationMap = {};
    for (const reg of regulations) {
      const regulationData = fetchedRegulations.find((r) => r._id.toString() === reg._id);
      if (regulationData) {
        regulationMap[reg._id] = {
          _id: reg._id,
          title: regulationData.title,
          description: regulationData.description,
          status: reg.status,
        };
      }
    }

    // Сначала обновляем дочерние материалы
    const bulkOperations = [];

    for (const material of materials) {
      for (const reg of regulations) {
        const regulationId = reg._id;
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
            filter: { _id: material._id, 'regulatoryCompliance._id': { $ne: regulationId } },
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

    // После обновления в базе данных заново получаем материалы
    const updatedMaterials = await Material.find({ _id: { $in: materialIds } });

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
          const regulationId = reg._id;
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

        // Логируем обновление родительского материала
        await logAction({
          userId,
          action: 'update',
          entityType: 'Material',
          entityId: parentMaterial._id,
          description: `Updated regulatoryCompliance for parent material ${parentMaterial._id}`,
        });
      }
    }

   // Логируем обновление материалов
   for (const material of materials) {
    await logAction({
      userId,
      action: 'update',
      entityType: 'Material',
      entityId: material._id,
      description: `Updated regulatoryCompliance for material ${material._id}`,
    });
  }

  };

  // Функция для обновления regulatoryCompliance у родительского материала
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

  // Обновление regulatoryCompliance для материалов
  if (materialsForDocument.length > 0) {
    await updateRegulatoryComplianceForMaterials(materialsForDocument, regulations);
  }

  // Если документ применим ко всем материалам поставщика
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

    materialsForDocument = supplierMaterials.map((material) => material._id);

    await updateRegulatoryComplianceForMaterials(materialsForDocument, regulations);
  }

  // Создание нового документа
  const newDocument = await Document.create({
    title,
    fileUrl,
    materialIds: materialsForDocument,
    supplierId: supplierId || null,
    applyToAllSupplierMaterials: !!applyToAllSupplierMaterials,
    uploadedBy: {
      _id: currentUser._id,
      name: currentUser.name,
      role: currentUser.role,
    },
    type: type || 'other',
    version: version || 1,
    regulations: regulations.map((reg) => ({
      _id: reg._id,
      status: reg.status,
    })),
    attachments: attachments || [],
    effectiveDate: effectiveDate || null,
    expiryDate: expiryDate || null,
    documentNumber: documentNumber || '',
    description: description || '',
    category: category || 'other',
    notes: notes || '',
  });

    // Логируем создание документа
    await logAction({
      userId,
      action: 'create',
      entityType: 'Document',
      entityId: newDocument._id,
      newData: newDocument.toObject(),
    });

  res.status(201).json({
    status: 'success',
    code: 201,
    data: {
      document: newDocument,
    },
  });
};

const getDocumentsForMaterialAndRegulation = async (req, res) => {
  const { materialId, regulationId } = req.query;

  // Проверка наличия обязательных параметров
  if (!materialId || !regulationId) {
    throw HttpError(400, 'Both materialId and regulationId are required');
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

  // Проверка существования регуляторного акта
  const regulation = await Regulation.findById(regulationId);
  if (!regulation) {
    throw HttpError(404, `Regulation with ID ${regulationId} not found`);
  }

  // Поиск документов по materialId и regulationId
  const documents = await Document.find({
    materialIds: materialId,
    'regulations._id': regulationId,
  }).lean();

  // Проверка наличия документов
  if (!documents || documents.length === 0) {
    throw HttpError(
      404,
      'No documents found for the specified material and regulation'
    );
  }

  res.status(200).json({
    status: 'success',
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
  