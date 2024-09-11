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
  // Разрешаем только определенные типы файлов
  if (
    file.mimetype === "image/jpeg" ||
    file.mimetype === "image/png" ||
    file.mimetype === "application/pdf" ||
    file.mimetype === "application/msword" || // word-файлы .doc
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" // word-файлы .docx
  ) {
    cb(null, true); // Разрешаем загрузку
  } else {
    cb(
      new Error(
        "Неверный тип файла. Разрешены только файлы с таким типом: JPEG, PNG, PDF, DOC, DOCX"
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
