import express from "express";
import morgan from "morgan";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";    
import router from "./api/material.js";

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

// app.use("/api/auth", authRouter);
app.use("/api/materials", router);

// app.use((_, res, __) => {
//   res.status(404).json({
//     status: "error",
//     code: 404,
//     message: "Use api on routes: /api/contacts",
//     data: "Not found",
//   });
// });
// app.use(errorHandler);
