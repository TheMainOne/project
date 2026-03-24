import ComplianceDocument from "../sf-compliance/models/ComplianceDocument.js";
import Supplier from "../sf-compliance/models/Supplier.js";

export const createComplianceDocument = async (req, res) => {
  const {
    supplierId,
    title,
    fileName,
    storage,
    documentType,
    source,
    issueDate,
    receivedDate,
    validUntil,
    status,
    notes,
    tags,
    replacesDocumentId,
  } = req.body;

  const supplier = await Supplier.findById(supplierId);
  if (!supplier) {
    return res.status(404).json({
      message: "Supplier not found",
    });
  }

  const document = await ComplianceDocument.create({
    supplierId,
    title,
    fileName,
    storage,
    documentType,
    source,
    issueDate,
    receivedDate,
    validUntil,
    status,
    notes,
    tags,
    replacesDocumentId,
  });

  res.status(201).json({
    message: "Compliance document created successfully",
    document,
  });
};

export const getComplianceDocuments = async (req, res) => {
  const { supplierId, status, documentType } = req.query;

  const filter = {};

  if (supplierId) filter.supplierId = supplierId;
  if (status) filter.status = status;
  if (documentType) filter.documentType = documentType;

  const documents = await ComplianceDocument.find(filter)
    .populate("supplierId", "name")
    .populate("replacesDocumentId", "title fileName status")
    .sort({ createdAt: -1 });

  res.status(200).json({
    total: documents.length,
    documents,
  });
};

export const getComplianceDocumentById = async (req, res) => {
  const { id } = req.params;

  const document = await ComplianceDocument.findById(id)
    .populate("supplierId", "name")
    .populate("replacesDocumentId", "title fileName status");

  if (!document) {
    return res.status(404).json({
      message: "Compliance document not found",
    });
  }

  res.status(200).json(document);
};

export const updateComplianceDocument = async (req, res) => {
  const { id } = req.params;

  const updatedDocument = await ComplianceDocument.findByIdAndUpdate(
    id,
    req.body,
    {
      new: true,
      runValidators: true,
    }
  )
    .populate("supplierId", "name")
    .populate("replacesDocumentId", "title fileName status");

  if (!updatedDocument) {
    return res.status(404).json({
      message: "Compliance document not found",
    });
  }

  res.status(200).json({
    message: "Compliance document updated successfully",
    document: updatedDocument,
  });
};

export const deleteComplianceDocument = async (req, res) => {
  const { id } = req.params;

  const deletedDocument = await ComplianceDocument.findByIdAndDelete(id);

  if (!deletedDocument) {
    return res.status(404).json({
      message: "Compliance document not found",
    });
  }

  res.status(200).json({
    message: "Compliance document deleted successfully",
  });
};