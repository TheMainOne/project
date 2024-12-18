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
const importBasicMaterials = async (req, res) => {
  if (!req.file) {
    throw HttpError(400, "File was not uploaded");
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const extension = originalName.split('.').pop().toLowerCase();

  let jsonData = [];

  if (extension === 'xlsx') {
    const workbook = XLSX.readFile(filePath);
    const sheetName = 'Materials';

    if (!workbook.SheetNames.includes(sheetName)) {
      fs.unlinkSync(filePath);
      throw HttpError(400, `Sheet "${sheetName}" not found in the uploaded file.`);
    }

    const worksheet = workbook.Sheets[sheetName];
    jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  } else if (extension === 'csv') {
    jsonData = await new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csv.parse({ headers: true }))
        .on('error', error => reject(error))
        .on('data', row => results.push(row))
        .on('end', () => resolve(results));
    });
  } else {
    fs.unlinkSync(filePath);
    throw HttpError(400, 'Unsupported file type. Please upload an XLSX or CSV file.');
  }

  // После успешного парсинга удаляем файл
  fs.unlinkSync(filePath);

  // Очистка пустых полей
  const cleanedData = jsonData.map(row => {
    const cleaned = {};
    for (const key in row) {
      if (row[key] !== "") {
        cleaned[key] = row[key];
      }
    }
    return cleaned;
  });

  // Обработка supplierId и regulatoryCompliance
  for (const mat of cleanedData) {
    if (mat.supplier && mat.supplier !== "") {
      const supplierRecord = await Supplier.findOne({ name: mat.supplier });
      if (supplierRecord) {
        mat.supplierId = supplierRecord._id.toString();
      }
    }

    if (mat.regulatoryCompliance && typeof mat.regulatoryCompliance === 'string') {
      const complianceData = JSON.parse(mat.regulatoryCompliance);

      for (const item of complianceData) {
        if (item.title) {
          const regulationRecord = await Regulation.findOne({ title: item.title });
          if (regulationRecord) {
            // Подставляем данные из БД
            item._id = regulationRecord._id.toString();
            item.title = regulationRecord.title;
            item.description = regulationRecord.description;
            // item.status оставляем из файла, не меняем
          } else {
            // Если нет такой регуляции в БД, пока бросаем ошибку (дальше логику надо усложнять) 
            throw HttpError(400, `Regulation with title "${item.title}" not found`);
          }
        }
      }

      mat.regulatoryCompliance = complianceData;
    }
  }

  // Валидация данных
  const validMaterials = [];
  for (const mat of cleanedData) {
    const { error, value } = Material.validateMaterialSchema.validate(mat);
    if (error) {
      throw HttpError(400, `Validation error: ${error.message}`);
    }
    validMaterials.push(value);
  }


  // Вставка в БД
  const inserted = await Material.insertMany(validMaterials);

  res.status(201).json({
    status: 'success',
    code: 201,
    data: inserted,
  });
      // // Поддерживаем только XLSX
      // if (extension !== 'xlsx') {
      //   fs.unlinkSync(filePath);
      //   throw HttpError(400, 'Unsupported file type. Please upload an XLSX file.');
      // }

      // try {
      //   const workbook = XLSX.readFile(filePath);
      //   const sheetName = 'Materials';

      //   if (!workbook.SheetNames.includes(sheetName)) {
      //     fs.unlinkSync(filePath);
      //     throw HttpError(400, `Sheet "${sheetName}" not found in the uploaded file.`);
      //   }

      //   const worksheet = workbook.Sheets[sheetName];
      //   // Преобразуем лист в массив объектов. defval: "" - пустые ячейки будут пустыми строками.
      //   const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      //   fs.unlinkSync(filePath); // Удаляем файл после прочтения

      //   // Теперь jsonData будет массивом, например:
      //   // [
      //   //   { partNumber: "PN001", description: "Desc1", supplier: "Sup1", supplierItemNumber: "S-001", countryOfOrigin: "USA", status: "active" },
      //   //   { partNumber: "PN002", description: "Desc2", ... },
      //   //   ...
      //   // ]

      //   // Очищаем пустые строки (если поле пустое, удаляем его, чтобы Joi правильно отработал валидацию)
      //   const cleanedData = jsonData.map(row => {
      //     const cleaned = {};
      //     for (const key in row) {
      //       if (row[key] !== "") {
      //         cleaned[key] = row[key];
      //       }
      //     }
      //     return cleaned;
      //   });

      //   // Для каждого материала, если указан supplier, находим его в базе
      //   // и добавляем supplierId. Если не нашли - supplierId не ставим.
      //   for (const mat of cleanedData) {
      //     if (mat.supplier && mat.supplier !== "") {
      //       const supplierRecord = await Supplier.findOne({ name: mat.supplier });
      //       if (supplierRecord) {
      //         mat.supplierId = supplierRecord._id.toString(); // Преобразуем ObjectId в строку чтобы пройти валидацию Joi
      //       } else {
      //         // Пока просто пропускаем, если поставщика нет
      //       }
      //     }
      //   }

      //     // Обработка regulatoryCompliance, если есть колонка regulatoryCompliance
      //     // и она содержит JSON-строку
      //     if (mat.regulatoryCompliance && typeof mat.regulatoryCompliance === 'string') {

      //         const complianceData = JSON.parse(mat.regulatoryCompliance);
      //         // complianceData ожидается как массив объектов { title, description, status, ... }
              
      //         // Обрабатываем каждый объект: ищем регуляцию по title
      //         for (const item of complianceData) {
      //           if (item.title) {
      //             const regulationRecord = await Regulation.findOne({ title: item.title });
      //             if (regulationRecord) {
      //               item._id = regulationRecord._id; // Подставляем найденный _id
      //             } else {
      //               // Если не нашли акт, можно или пропустить или создать новый.
      //               // Например, можно бросить ошибку:
      //               // throw HttpError(400, `Regulation with title "${item.title}" not found`);
      //               // Или оставить без _id, если это допустимо.
      //             }
      //           }
      //         }
      //         mat.regulatoryCompliance = complianceData;
      //     }
        
      //   // Валидируем данные по Joi-схеме
      //   const validMaterials = [];
      //   for (const mat of cleanedData) {
      //     const { error, value } = Material.validateMaterialSchema.validate(mat);
      //     if (error) {
      //       throw HttpError(400, `Validation error: ${error.message}`);
      //     }
      //     validMaterials.push(value);
      //   }

      //   // Вставляем в БД
      //   const inserted = await Material.insertMany(validMaterials);

      //   res.status(201).json({
      //     status: 'success',
      //     code: 201,
      //     data: inserted,
      //   });

      // } catch (error) {
      //   console.error(error);
      //   if (fs.existsSync(filePath)) {
      //     fs.unlinkSync(filePath);
      //   }
      //   throw HttpError(500, "Internal server error", { details: error.message });
      // }
};

  export default {
    uploadFile: ctrlWrapper(upload),
    importBasicMaterials: ctrlWrapper(importBasicMaterials),
    uploadExcelFile
  };
  
  
