// middlewares/s3Upload.js
import multer from "multer";
import multerS3 from "multer-s3";
import s3 from "../services/amazon/s3Client.js";
import HttpError from "./HttpError.js";
import { v4 as uuidv4 } from "uuid";

const bucketName = process.env.AWS_BUCKET_NAME;

// Разрешённые MIME-типы
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

const upload = multer({
  limits: {
    fileSize: 20 * 1024 * 1024, // Максимум 20 МБ
  },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        HttpError(
          400,
          "Allowed files are PDF, Word, Excel, images and .txt files. Maximum allowed size is 20 MB"
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
      const fileExtension = file.originalname.split(".").pop();
      const filename = `documents/${uuidv4()}.${fileExtension}`;

      // сохраняем originalname и mimetype в объект file явно:
      file.uploadedOriginalName = file.originalname;
      file.uploadedMimeType = file.mimetype;

      cb(null, filename);
    },
  }),
});

export default upload;
