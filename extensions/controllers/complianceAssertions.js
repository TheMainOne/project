import ComplianceAssertion from "../sf-compliance/models/ComplianceAssertion.js";
import ComplianceDocument from "../sf-compliance/models/ComplianceDocument.js";
import Regulation from "../sf-compliance/models/Regulation.js";
import Supplier from "../sf-compliance/models/Supplier.js";

export const createComplianceAssertion = async (req, res) => {
  const {
    supplierId,
    documentId,
    regulationId,
    assertionType,
    coverageLevel,
    scope,
    statementText,
    issueDate,
    validUntil,
    status,
    confidence,
    exceptions,
    tags,
  } = req.body;

  const supplier = await Supplier.findById(supplierId);
  if (!supplier) {
    return res.status(404).json({
      message: "Supplier not found",
    });
  }

  const document = await ComplianceDocument.findById(documentId);
  if (!document) {
    return res.status(404).json({
      message: "Compliance document not found",
    });
  }

  const regulation = await Regulation.findById(regulationId);
  if (!regulation) {
    return res.status(404).json({
      message: "Regulation not found",
    });
  }

  const assertion = await ComplianceAssertion.create({
    supplierId,
    documentId,
    regulationId,
    assertionType,
    coverageLevel,
    scope,
    statementText,
    issueDate,
    validUntil,
    status,
    confidence,
    exceptions,
    tags,
  });

  res.status(201).json({
    message: "Compliance assertion created successfully",
    assertion,
  });
};

export const getComplianceAssertions = async (req, res) => {
  const { supplierId, documentId, regulationId, status, assertionType } = req.query;

  const filter = {};

  if (supplierId) filter.supplierId = supplierId;
  if (documentId) filter.documentId = documentId;
  if (regulationId) filter.regulationId = regulationId;
  if (status) filter.status = status;
  if (assertionType) filter.assertionType = assertionType;

  const assertions = await ComplianceAssertion.find(filter)
    .populate("supplierId", "name")
    .populate("documentId", "title fileName status issueDate validUntil storage")
    .populate("regulationId", "code name")
    .sort({ createdAt: -1 });

  res.status(200).json({
    total: assertions.length,
    assertions,
  });
};

export const getComplianceAssertionById = async (req, res) => {
  const { id } = req.params;

  const assertion = await ComplianceAssertion.findById(id)
    .populate("supplierId", "name")
    .populate("documentId", "title fileName status issueDate validUntil storage")
    .populate("regulationId", "code name");

  if (!assertion) {
    return res.status(404).json({
      message: "Compliance assertion not found",
    });
  }

  res.status(200).json(assertion);
};

export const updateComplianceAssertion = async (req, res) => {
  const { id } = req.params;

  const updatedAssertion = await ComplianceAssertion.findByIdAndUpdate(
    id,
    req.body,
    {
      new: true,
      runValidators: true,
    }
  )
    .populate("supplierId", "name")
    .populate("documentId", "title fileName status issueDate validUntil storage")
    .populate("regulationId", "code name");

  if (!updatedAssertion) {
    return res.status(404).json({
      message: "Compliance assertion not found",
    });
  }

  res.status(200).json({
    message: "Compliance assertion updated successfully",
    assertion: updatedAssertion,
  });
};

export const deleteComplianceAssertion = async (req, res) => {
  const { id } = req.params;

  const deletedAssertion = await ComplianceAssertion.findByIdAndDelete(id);

  if (!deletedAssertion) {
    return res.status(404).json({
      message: "Compliance assertion not found",
    });
  }

  res.status(200).json({
    message: "Compliance assertion deleted successfully",
  });
};