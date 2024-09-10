import Supplier from "../services/schemas/supplier.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";
import HttpError from "../middlewares/HttpError.js";

const getSuppliersList = async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
  
    const results = await Supplier.find({}).skip(skip).limit(limit).exec();
  
    const count = await Supplier.countDocuments();
  
    res.json({
      status: "success",
      code: 200,
      data: {
        suppliers: results,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
      },
    }); 
  }

  const getSupplierByID = async (req, res) => {
    const {id} = req.params;
  
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
    
    const existingSupplier = await Supplier.findOne({ name });

    //checking if we already have the same supplier
    if (existingSupplier) {
      throw HttpError(409, "Supplier with this name already exists");
    }
  
  
    const newSupplier = await Supplier.create({ ...req.body });
  
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
  
       if (!id) {
        throw HttpError(400, "The supplier ID is required to perform the update operation");
      }
  
    if (!fields || Object.keys(fields).length === 0) {
      throw HttpError(400, "No fields were provided for the update.");
    }
    
    const result = await Supplier.findByIdAndUpdate(id, fields, { new: true });
  
      if (!result) {
        throw HttpError(404, "Supplier not found");
      }
  
      return res.status(200).json({
        status: "success",
        code: 200,
        data: {
          supplier: result
        }
      });
  }

  const deleteSupplier = async (req, res) => {
    const { id } = req.params;
  
    const deletedSupplier = await Supplier.findByIdAndDelete(id);
  
    if (!deletedSupplier) {
      throw HttpError(404, "Supplier not found");
    }
  
    res.status(200).json({
      status: "success",
      code: 200,
      message: "Supplier deleted successfully",
      data: { deletedSupplier },
    });
  };
  

  export default {
    getAllSuppliers: ctrlWrapper(getSuppliersList),
    getSupplierByID: ctrlWrapper(getSupplierByID),
    createNewSupplier: ctrlWrapper(addNewSupplier),
    updateSupplierByID: ctrlWrapper(updateSupplierByID),
    deleteSupplier: ctrlWrapper(deleteSupplier),
  };
  