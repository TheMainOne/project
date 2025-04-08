const errorHandler = (err, req, res, next) => {
  const { status = 500, message = "Server Error" } = err;
  console.log(err);
  console.log(err.name);
  // 1. Обработка ошибок токена
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      status: "error",
      code: 401,
      message: "Token is expired",
    });
  }

  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      status: "error",
      code: 401,
      message: "invalid signature",
    });
  }

  // 2. Ошибка Multer: превышен лимит размера файла
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      status: "fail",
      code: 400,
      message: "The file is too large. The maximum size is 20 MB.",
    });
  }

  // Ошибка Multer: неверный тип файла
  if (err.message?.startsWith("Invalid file type")) {
    return res.status(400).json({
      status: "fail",
      code: 400,
      message: err.message,
    });
  }

  // 3. Кастомная ошибка (например, HttpError)
  if (err.status) {
    return res.status(status).json({
      status: "fail",
      code: status,
      message,
      data: message === "Server Error" ? "Internal Server Error" : message,
    });
  }

  // 4. Неизвестная ошибка
  res.status(500).json({
    status: "fail",
    code: 500,
    message: "Internal server error",
    data: "Internal Server Error",
  });
};

export default errorHandler;
