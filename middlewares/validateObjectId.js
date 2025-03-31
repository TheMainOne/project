import { isValidObjectId } from "mongoose";
import HttpError from "./HttpError.js";

/**
 * Middleware для валидации поля с ObjectId.
 * @param {string} fieldName - Название поля, которое нужно проверить.
 * @param {string} [location="query"] - Локация, где искать поле: "query", "params" или "body".
 * @returns {Function} Middleware для проверки валидности ObjectId.
 */
const validateObjectId = (fieldName, location = "query") => {
  return (req, res, next) => {
    let id;
    switch (location) {
      case "params":
        id = req.params[fieldName];
        break;
      case "body":
        id = req.body[fieldName];
        break;
      case "query":
      default:
        id = req.query[fieldName];
        break;
    }

    if (!id || !isValidObjectId(id)) {
      return next(
        HttpError(
          400,
          `${id} is not a valid ObjectId in ${location}.${fieldName}`
        )
      );
    }
    next();
  };
};

export default validateObjectId;
