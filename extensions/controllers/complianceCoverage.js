import { getCoverageForItem } from "../services/complianceCoverage.js";

export const getItemComplianceCoverage = async (req, res) => {
  const { itemNumber } = req.params;
  const { supplierId } = req.query;

  if (!supplierId) {
    return res.status(400).json({
      message: "supplierId is required",
    });
  }

  const coverage = await getCoverageForItem({
    itemNumber,
    supplierId,
  });

  res.status(200).json(coverage);
};