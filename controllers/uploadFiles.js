import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";


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
  };
  
  
