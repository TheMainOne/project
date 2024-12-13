import fs from 'fs';
import csv from 'fast-csv';
import XLSX from 'xlsx';
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";

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

  export default {
    uploadFile: ctrlWrapper(upload),
    uploadExcelFile
  };
  
  
