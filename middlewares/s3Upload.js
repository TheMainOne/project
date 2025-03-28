// middlewares/s3Upload.js
import multer from "multer";
import multerS3 from "multer-s3";
import s3 from "../services/amazon/s3Client.js";
import { v4 as uuidv4 } from "uuid";

const bucketName = process.env.AWS_BUCKET_NAME;

const upload = multer({
  storage: multerS3({
    s3,
    bucket: bucketName,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      const fileExtension = file.originalname.split(".").pop();
      cb(null, `documents/${uuidv4()}.${fileExtension}`);
    },
  }),
});

export default upload;
