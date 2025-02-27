import Supplier from "../services/schemas/supplier.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";
import logAction from "../utils/logAction.js";

const getSuppliersList = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

    // Используем фильтры и сортировку, переданные через middleware
    const filter = req.filter || {};
    const sort = req.sort || { createdAt: -1 }; // Сортировка по умолчанию по дате создания

  // Применяем фильтрацию и сортировку
  const results = await Supplier.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .exec();

  // Считаем количество документов с учётом фильтра
  const count = await Supplier.countDocuments(filter);

  res.json({
status: "success",
    code: 200,
    data: {
      suppliers: results,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    },
  });
};

const   getAllSuppliersForDictionary = async (req, res) => {
  const suppliers = await Supplier.find().exec();

    res.json({
      status: 'success',
      code: 200,
      data: {
        suppliers,
      },
    });

};

const getSupplierByID = async (req, res) => {
  const { id } = req.params;

  const result = await Supplier.findById(id, "-createdAt -updatedAt");

  if (!result) {
    throw HttpError(404, "Not found");
  }

  res.json({
    status: "success",
    code: 200,
    data: { supplier: result },
  });
};

const addNewSupplier = async (req, res) => {
  const { name } = req.body;
  const userId = req.user._id;

  const existingSupplier = await Supplier.findOne({ name });

  //checking if we already have the same supplier
  if (existingSupplier) {
    throw HttpError(409, "Supplier with this name already exists");
  }

  const newSupplier = await Supplier.create({ ...req.body });

    // Логирование действия
    await logAction({
      userId,
      action: 'create',
      entityType: 'Supplier',
      entityId: newSupplier._id,
      newData: newSupplier.toObject(),
    });

  res.status(201).json({
    status: "success",
    code: 201,
    data: {
      supplier: newSupplier,
    },
  });
};

const updateSupplierByID = async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  const userId = req.user._id;

  if (!id) {
    throw HttpError(
      400,
      "The supplier ID is required to perform the update operation"
    );
  }

  if (!fields || Object.keys(fields).length === 0) {
    throw HttpError(400, "No fields were provided for the update.");
  }

    // Получаем старые данные поставщика
    const oldSupplier = await Supplier.findById(id).lean();
    if (!oldSupplier) {
      throw HttpError(404, 'Supplier not found');
    }
  
  // Проверка уникальности имени, если имя обновляется и изменилось
  if (fields.name && fields.name !== oldSupplier.name) {
    const existingSupplier = await Supplier.findOne({ name: fields.name, _id: { $ne: id } });
    if (existingSupplier) {
      throw HttpError(409, 'Another supplier with this name already exists');
    }
  }
  
  const updatedSupplier = await Supplier.findByIdAndUpdate(id, fields, { new: true }).lean();

    // Логирование действия
    await logAction({
      userId,
      action: 'update',
      entityType: 'Supplier',
      entityId: updatedSupplier._id,
      oldData: oldSupplier,
      newData: updatedSupplier,
    });


  return res.status(200).json({
    status: "success",
    code: 200,
    data: {
      supplier: updatedSupplier,
    },
  });
};

const deleteSupplier = async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const deletedSupplier = await Supplier.findByIdAndDelete(id).lean();

  if (!deletedSupplier) {
    throw HttpError(404, "Supplier not found");
  }

  // Логирование действия
  await logAction({
    userId,
    action: 'delete',
    entityType: 'Supplier',
    entityId: deletedSupplier._id,
    oldData: deletedSupplier,
  });

  res.status(200).json({
    status: "success",
    code: 200,
    message: "Supplier deleted successfully",
    data: { deletedSupplier },
  });
};

const searchSuppliersByName = async (req, res) => {
  const { name } = req.query;

  if (!name) {
    throw HttpError(400, "Kindly provide a supplier name to search");
  }

  // Используем регулярное выражение для поиска по частичному совпадению имени
  const suppliers = await Supplier.find({
    name: { $regex: name, $options: "i" }, // 'i' делает поиск нечувствительным к регистру
  }).limit(10); // Ограничиваем количество результатов до 10

  res.status(200).json({
    status: "success",
    code: 200,
    data: suppliers,
  });
};

export default {
  getAllSuppliers: ctrlWrapper(getSuppliersList),
  getAllSuppliersForDictionary: ctrlWrapper(getAllSuppliersForDictionary),
  getSupplierByID: ctrlWrapper(getSupplierByID),
  createNewSupplier: ctrlWrapper(addNewSupplier),
  updateSupplierByID: ctrlWrapper(updateSupplierByID),
  deleteSupplier: ctrlWrapper(deleteSupplier),
  searchSuppliersByName: ctrlWrapper(searchSuppliersByName)
};
