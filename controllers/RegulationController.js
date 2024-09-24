import Regulation from "../services/schemas/regulation.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";



const getAllRegulations = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const results = await Regulation.find({}).skip(skip).limit(limit).exec();

  const count = await Regulation.countDocuments();

  res.json({
    status: "success",
    code: 200,
    data: {
      regulations: results,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    },
  }); 
}

const getRegulationByID = async (req, res) => {
  const {id} = req.params;

  const result = await Regulation.findById(id, "-createdAt -updatedAt");

  if (!result) {
    throw HttpError(404, "Not found");
  }

  res.json({
    status: "success",
    code: 200,
    data: { material: result },
  });
};


const addNewRegulation = async (req, res) => {
  const { title, description } = req.body;
  
  //checking if the request body was sent with request
  if (!title || !description) {
    throw HttpError(400, "Request body is missing");
  }

  const existingRegulation = await Regulation.findOne({ title });

  //checking if the same regulation already exist
  if (existingRegulation) {
    throw HttpError(409, "Regulation with this title already exists");
  }

  const newRegulation = await Regulation.create({ ...req.body });

  res.status(201).json({
    status: "success",
    code: 201,
    data: {
      regulation: newRegulation,
    },
  });
};

const updateRegulationByID = async (req, res) => {
  const { id } = req.params;
  const fields = req.body;

     if (!id) {
      throw HttpError(400, "The Regulation ID is required to perform the update operation");
    }

  if (!fields || Object.keys(fields).length === 0) {
    throw HttpError(400, "No fields were provided for the update");
  }
  
  const result = await Regulation.findByIdAndUpdate(id, fields, { new: true });

    if (!result) {
      return res.status(404).json({
        status: "error",
        code: 404,
        message: "Contact not found",
      });
    }

    return res.status(200).json({
      status: "success",
      code: 200,
      data: {
        regulation: result,
      }
    });
}

const deleteRegulationById = async (req, res) => {
  const { id } = req.params;

  const deletedRegulation = await Regulation.findByIdAndDelete(id);

  if (!deletedRegulation) {
    throw HttpError(404, "Regulation not found");
  }

  res.status(200).json({
    status: "success",
    code: 200,
    message: "Regulation deleted successfully",
    data: { deletedRegulation },
  });
};

const searchRegulationByTitle = async (req, res) => {
  const { title } = req.query;

  if (!title) {
    throw HttpError(400, "Please provide a title to search");
  }

  // Используем регулярное выражение для поиска по частичному совпадению
  const regulations = await Regulation.find({
    title: { $regex: title, $options: 'i' }, // 'i' делает поиск нечувствительным к регистру
  }).limit(10); // Ограничиваем количество результатов до 10


    // Если ничего не найдено, возвращаем пустой массив и сообщение
    if (regulations.length === 0) {
      return res.status(200).json({
        status: 'success',
        code: 200,
        message: 'No regulations found',
        data: [],
      });
    }

  res.status(200).json({
    status: 'success',
    code: 200,
    data: regulations,
  });
};



export default {
  addRegulation: ctrlWrapper(addNewRegulation),
  getAllRegulations: ctrlWrapper(getAllRegulations),
  updateRegulation: ctrlWrapper(updateRegulationByID),
  getRegulationById: ctrlWrapper(getRegulationByID),
  deleteRegulationById: ctrlWrapper(deleteRegulationById),
  searchRegulationByTitle: ctrlWrapper(searchRegulationByTitle)
};
