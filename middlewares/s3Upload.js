// middlewares/s3Upload.js
import multer from "multer";
import multerS3 from "multer-s3";
import s3 from "../services/amazon/s3Client.js";
import HttpError from "./HttpError.js";
import { v4 as uuidv4 } from "uuid";

const bucketName = process.env.AWS_BUCKET_NAME;

// Разрешённые MIME-типы для документов / картинок
const allowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "text/plain",
];

// Разрешённые MIME-типы для шрифтов
const allowedFontMimeTypes = [
  "font/woff",
  "font/woff2",
  "application/font-woff",
  "application/x-font-woff",
  "application/x-font-truetype",
  "application/x-font-ttf",
  "application/x-font-opentype",
  "font/ttf",
  "font/otf",
];

const upload = multer({
  limits: {
    fileSize: 20 * 1024 * 1024, // Максимум 20 МБ
  },
  fileFilter: (req, file, cb) => {
    const mimetype = file.mimetype;
    const originalName = file.originalname || "";

    const isDocOrImage = allowedMimeTypes.includes(mimetype);
    const isFontMime   = allowedFontMimeTypes.includes(mimetype);

    // Иногда браузеры шлют шрифты как application/octet-stream — проверим по расширению
    const isFontByExt =
      /\.(woff2?|ttf|otf)$/i.test(originalName) &&
      (mimetype === "application/octet-stream" || mimetype === "binary/octet-stream");

    if (isDocOrImage || isFontMime || isFontByExt) {
      cb(null, true);
    } else {
      cb(
        HttpError(
          400,
          "Allowed files are PDF, Word, Excel, images, .txt and font files (.woff, .woff2, .ttf, .otf). Maximum allowed size is 20 MB"
        )
      );
    }
  },
  storage: multerS3({
    s3,
    bucket: bucketName,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => {
      cb(null, {
        fieldName: file.fieldname,
        originalname: file.originalname,
        mimetype: file.mimetype,
      });
    },
    key: (req, file, cb) => {
      const fileExtension = (file.originalname.split(".").pop() || "").toLowerCase();

      // Разные папки в бакете по типу поля
      const baseFolder =
        file.fieldname === "font"
          ? "fonts"
          : file.fieldname === "logo"
          ? "logos"
          : "documents";

      const filename = `${baseFolder}/${uuidv4()}.${fileExtension}`;

      // сохраняем originalname и mimetype в объект file явно:
      file.uploadedOriginalName = file.originalname;
      file.uploadedMimeType = file.mimetype;

      cb(null, filename);
    },
  }),
});

export default upload;
