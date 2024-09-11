import express from "express";
import upload from "../middlewares/multer.js";
import authenticate from "../middlewares/authenticate.js";
import controllers from "../controllers/uploadFiles.js";

const uploadFileRouter = express.Router();


uploadFileRouter.post('/upload', authenticate, upload.single('file'), controllers.uploadFile);

export default uploadFileRouter;