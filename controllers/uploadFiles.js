import fs from 'fs';
import csv from 'fast-csv';
import XLSX from 'xlsx';
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";
import Material from "../services/schemas/material.js"
import Supplier from "../services/schemas/supplier.js"
import Regulation from "../services/schemas/regulation.js"

const uploadExcelFile = async (req, res) => {
  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const extension = originalName.split('.').pop().toLowerCase();

  try {
    if (extension === 'csv') {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csv.parse({ headers: true }))
        .on('error', (error) => {
          console.error(error);
          fs.unlinkSync(filePath);
          return res.status(500).json({ error: 'Error parsing CSV file.' });
        })
        .on('data', (row) => {
          results.push(row);
        })
        .on('end', (rowCount) => {
          fs.unlinkSync(filePath); // Удаляем временный файл
          console.log(`Parsed ${rowCount} rows`);
          res.status(200).json({ data: results });
        });
    } else if (extension === 'xlsx') {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      fs.unlinkSync(filePath);
      res.status(200).json({ data: jsonData });
    } else {
      // Если файл не CSV или XLSX
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Unsupported file type. Upload CSV or XLSX.' });
    }
  } catch (error) {
    console.error(error);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const upload = async (req, res) => {
    console.log(req.file);
    // Проверка, был ли файл загружен
    if (!req.file) {
        throw HttpError(400, "File was not uploaded");
    }
  
    res.status(201).json({
      status: "success",
      code: 201,
      message: "Файл успешно загружен",
      data: {
        fileName: req.file.filename, // Имя загруженного файла
        filePath: `/uploads/${req.file.filename}`, // Путь к файлу
      },
    });
  };

/**
 * Контроллер для импорта материалов из загруженного файла (CSV или XLSX).
 */

// Функция для обновления regulatoryCompliance у родителя
const updateParentRegulatoryCompliance = async (parentMaterial, components) => {
  // 1. Собираем все уникальные _id регуляторных актов из всех компонентов
  const allRegulationIds = new Set();
  for (const component of components) {
    for (const compliance of (component.regulatoryCompliance || [])) {
      if (compliance._id) {
        allRegulationIds.add(compliance._id.toString());
      }
    }
  }

  // 2. Создаём карту для результирующей сводки по каждому _id
  const complianceMap = new Map();
  for (const regId of allRegulationIds) {
    complianceMap.set(regId, {
      // Вы сами решаете, что сюда класть: title, description, statuses и т.д.
      statuses: new Set(),
      title: null,
      description: null,
    });
  }

  // 3. Заполняем complianceMap, учитывая, что у компонента может не быть нужного _id
  for (const component of components) {
    // Делаем “словарь” для component.regulatoryCompliance, чтобы быстро понять,
    // есть ли в компоненте конкретный regId
    const compRegMap = new Map();
    for (const c of (component.regulatoryCompliance || [])) {
      compRegMap.set(c._id?.toString(), c);
    }

    // Теперь пробегаемся по *всем* regId и проверяем, есть ли он у компонента
    for (const regId of allRegulationIds) {
      // Если регуляторного акта у компонента нет – статус “missing” (или pending)
      if (!compRegMap.has(regId)) {
        complianceMap.get(regId).statuses.add("missing");
      } else {
        // Если есть, берём из компонента title, description, status
        const { status, title, description } = compRegMap.get(regId);
        complianceMap.get(regId).statuses.add(status);
        // При желании можно title/description “обновлять”, если в коде есть необходимость
        // но аккуратнее с тем, что у двух компонентов может быть разное описание одного и того же регуляторного акта.
        complianceMap.get(regId).title = title || complianceMap.get(regId).title;
        complianceMap.get(regId).description = description || complianceMap.get(regId).description;
      }
    }
  }

  // 4. Теперь у нас в complianceMap для КАЖДОГО _id есть statuses,
  //    в том числе "missing" там, где акт не встречался у компонента
  //    Делаем итоговый массив updatedCompliance
  const updatedCompliance = [];
  for (const [regId, data] of complianceMap.entries()) {
    const { statuses, title, description } = data;
    let finalStatus;

    // Логика та же, просто добавляем проверку на "missing"
    if (statuses.has('does_not_comply')) {
      finalStatus = 'does_not_comply';
    } else if (
      statuses.has('pending') ||
      statuses.has(null) ||
      statuses.has(undefined) ||
      statuses.has('missing') // <-- вот это ключевой момент
    ) {
      finalStatus = 'comply_with_exceptions';
    } else if (statuses.size === 1 && statuses.has('comply')) {
      finalStatus = 'comply';
    } else {
      finalStatus = 'comply_with_exceptions';
    }

    updatedCompliance.push({
      _id: regId,           // строка или ObjectId, по ситуации
      title: title || 'Unknown',
      description: description || 'Unknown',
      status: finalStatus,
    });
  }

  parentMaterial.regulatoryCompliance = updatedCompliance;
  await parentMaterial.save();
};

// Вспомогательные функции остаются без изменений
const processRegulatoryCompliance = async (complianceData) => {
  const processed = [];
  for (const item of complianceData) {
    const regulation = await Regulation.findOne({ title: item.title });
    processed.push({
      _id: regulation ? regulation._id.toString() : null,
      title: item.title,
      description: item.description,
      status: item.status || 'pending',
    });
  }
  return processed;
};

const importBasicMaterials = async (req, res) => {
  if (!req.file) {
    throw HttpError(400, "File was not uploaded");
  }

  const filePath = req.file.path;
  const extension = req.file.originalname.split('.').pop().toLowerCase();

  if (extension !== 'xlsx') {
    fs.unlinkSync(filePath);
    throw HttpError(400, 'Unsupported file type. Please upload an XLSX file.');
  }

  const workbook = XLSX.readFile(filePath);

  if (!workbook.SheetNames.includes('Materials')) {
    fs.unlinkSync(filePath);
    throw HttpError(400, 'Sheet "Materials" is required but not found.');
  }

  const materialsData = XLSX.utils.sheet_to_json(workbook.Sheets['Materials'], { defval: "" });
  const regulatoryComplianceData = workbook.SheetNames.includes('RegulatoryCompliance')
    ? XLSX.utils.sheet_to_json(workbook.Sheets['RegulatoryCompliance'], { defval: "" })
    : [];
  const componentsData = workbook.SheetNames.includes('Components')
    ? XLSX.utils.sheet_to_json(workbook.Sheets['Components'], { defval: "" })
    : [];

  fs.unlinkSync(filePath);

  const validMaterials = [];
  const skippedMaterials = [];
  const materialIdMap = new Map(); // Для хранения соответствий partNumber -> _id

  // Этап 1: Вставка всех материалов
  for (const material of materialsData) {
    const newMaterial = {
      partNumber: material.partNumber || '',
      description: material.description || '',
      supplier: material.supplier || '',
      supplierItemNumber: String(material.supplierItemNumber || ''),
      countryOfOrigin: material.countryOfOrigin || '',
      status: material.status || 'Active',
      components: [], // Пока пустой
      regulatoryCompliance: [],
      parentID: [],
    };

    if (newMaterial.supplier) {
      const supplierRecord = await Supplier.findOne({ name: newMaterial.supplier });
      newMaterial.supplierId = supplierRecord ? supplierRecord._id.toString() : null;
    }

    const complianceRecords = regulatoryComplianceData.filter(
      (rc) => rc.partNumber === newMaterial.partNumber
    );
    if (complianceRecords.length > 0) {
      newMaterial.regulatoryCompliance = await processRegulatoryCompliance(complianceRecords);
    } else {
      console.warn(`No regulatoryCompliance data found for material ${newMaterial.partNumber}`);
      newMaterial.regulatoryCompliance = []; // Явно указываем пустое значение
    }
    
    const { error, value } = Material.validateMaterialSchema.validate(newMaterial);
    if (error) {
      console.error(`Validation error for material ${newMaterial.partNumber}:`, error.message);
      skippedMaterials.push(newMaterial);
      continue;
    }

    const insertedOrUpdated = await Material.findOneAndUpdate(
      { partNumber: value.partNumber },
      { $set: value },
      { upsert: true, new: true, runValidators: true }
    );
    console.log("UPSERT RESULT for", value.partNumber, insertedOrUpdated.regulatoryCompliance);

    materialIdMap.set(insertedOrUpdated.partNumber, insertedOrUpdated._id);
    validMaterials.push(insertedOrUpdated);
  }

  // Этап 2: Обновление компонентов
  for (const material of validMaterials) {
    const componentRecords = componentsData.filter(
      (comp) => comp.ParentPartNumber === material.partNumber
    );

    for (const comp of componentRecords) {
      const childMaterialId = materialIdMap.get(comp.childPartNumber);
    
      if (!childMaterialId) {
        console.warn(`Child material with partNumber ${comp.childPartNumber} not found.`);
        continue;
      }
    
      // Обновляем parentID у дочернего материала
      await Material.updateOne(
        { _id: childMaterialId },
        { $addToSet: { parentID: material._id } }
      );
    
      // Получаем дочерний материал с regulatoryCompliance
      const childMaterial = await Material.findById(childMaterialId);
    
      if (!childMaterial) {
        console.warn(`Child material ${comp.childPartNumber} not found in database.`);
        continue;
      }
    
      console.log(`Child material ${childMaterial.partNumber} has regulatoryCompliance:`, childMaterial.regulatoryCompliance);
    
      material.components.push({
        partNumber: childMaterial.partNumber,
        description: childMaterial.description,
        supplier: childMaterial.supplier,
        supplierItemNumber: childMaterial.supplierItemNumber,
        countryOfOrigin: childMaterial.countryOfOrigin,
        status: childMaterial.status,
        parentID: material._id,
        regulatoryCompliance: childMaterial.regulatoryCompliance || [],
      });
    }

    await material.save(); // Сохраняем обновленный материал
    console.log(`material.components: ${material.components}`)
    // Обновляем regulatoryCompliance у родителя
    await updateParentRegulatoryCompliance(material, material.components);
  }

  console.log("=== FINAL CHECK IN DB ===");
for (const m of validMaterials) {
  const docInDb = await Material.findOne({ partNumber: m.partNumber }).lean();
  console.log(m.partNumber, "->", docInDb?.regulatoryCompliance);
}

  res.status(201).json({
    status: 'success',
    code: 201,
    data: {
      insertedMaterials: validMaterials,
      skippedMaterials,
    },
  });
};




  export default {
    uploadFile: ctrlWrapper(upload),
    importBasicMaterials: ctrlWrapper(importBasicMaterials),
    uploadExcelFile
  };
  
  
