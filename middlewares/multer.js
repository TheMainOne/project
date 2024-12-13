import multer from "multer";
import path from "path";

// Настройка хранения файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Указываем папку для сохранения файлов
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const originalName = file.originalname.split(".")[0];

    // Генерация уникального имени файла с добавлением временной метки
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);

    cb(
      null,
      originalName + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    "image/jpeg",
    "image/png",
    "application/pdf",
    "application/msword", // word-файлы .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // word-файлы .docx
    "text/csv", // CSV
    "application/vnd.ms-excel", // иногда CSV файлов идет с таким типом
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // XLSX
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true); // Разрешаем загрузку
  } else {
    cb(
      new Error(
        "Неверный тип файла. Разрешены: JPEG, PNG, PDF, DOC, DOCX, CSV, XLSX"
      ),
      false
    ); // Отклоняем файл
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 5 }, // Ограничение на размер файла 5MB
  fileFilter: fileFilter,
});

export default upload;
