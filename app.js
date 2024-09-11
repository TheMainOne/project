import express from "express";
import passport from 'passport';
import morgan from "morgan";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";    
import router from "./api/material.js";
import authRouter from "./api/auth.js";
import regulationRouter from "./api/regulation.js";
import supplierRouter from "./api/supplier.js";
import uploadFileRouter from "./api/upload.js";


dotenv.config();

const PORT = process.env.PORT || 3000;
const uriDB = process.env.DATABASE_URL;
const connection = mongoose.connect(uriDB, {
  dbName: 'materials_reader'
}).then(() => {
  app.listen(PORT, function () {
    console.log(`Database connection successful. Use our API on port: ${PORT}`);
  });
}).catch((err) => {
  console.log(`Server not running. Error message: ${err.message}`);
  process.exit(1);
});

const app = express();

app.use(morgan("tiny"));
app.use(cors());
app.use(express.json());

// Настройка папки для статической раздачи файлов
app.use('/uploads', express.static('uploads'));

// connecting api routes
app.use("/", router);
app.use("/", authRouter);
app.use("/", regulationRouter);
app.use("/", supplierRouter);
app.use("/", uploadFileRouter);



// error handlers
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    status: "error",
    message: err.message,
  });
});
app.use((_, res, __) => {
  res.status(404).json({
    status: "error",
    code: 404,
    message: "Use api on routes: /api/materials",
    data: "Not found",
  });
});
