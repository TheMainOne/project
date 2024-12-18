import express from "express";
import upload from "../middlewares/multer.js";
import authenticate from "../middlewares/authenticate.js";
import controllers from "../controllers/uploadFiles.js";

const uploadFileRouter = express.Router();

uploadFileRouter.post('/upload', authenticate, upload.single('file'), controllers.uploadFile);
uploadFileRouter.post('/uploadExcelFile', authenticate, upload.single('file'), controllers.uploadExcelFile);
uploadFileRouter.post('/importMaterials', authenticate, upload.single('file'), controllers.importBasicMaterials);

export default uploadFileRouter;