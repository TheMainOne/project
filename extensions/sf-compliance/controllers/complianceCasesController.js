import { fetchCase, fetchCaseAttachments } from "../adapters/salesforceAdapter.js";
import analyzeCase from "../services/analyzeCase.js";
import matchEvidence from "../services/matchEvidence.js";
import ComplianceCaseReport from "../models/ComplianceCaseReport.js";

export async function analyzeComplianceCase(req, res, next) {
  try {
    const { sfCaseId } = req.params;

    const [caseData, attachments] = await Promise.all([
      fetchCase(sfCaseId),
      fetchCaseAttachments(sfCaseId),
    ]);

    const extracted = await analyzeCase({ caseData, attachments });
    const matches = await matchEvidence({ requirements: extracted.requirements || [] });

    const report = await ComplianceCaseReport.findOneAndUpdate(
      { sfCaseId },
      {
        $set: {
          sfCaseId,
          caseData,
          attachments,
          extracted,
          matches,
          analyzedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({
      sfCaseId,
      extracted,
      matches,
      analyzedAt: report.analyzedAt,
    });
  } catch (error) {
    next(error);
  }
}

export async function getComplianceCaseReport(req, res, next) {
  try {
    const { sfCaseId } = req.params;
    const report = await ComplianceCaseReport.findOne({ sfCaseId })
      .populate("matches.evidenceRefs")
      .lean();

    if (!report) {
      return res.status(404).json({ error: "Compliance report not found for this Salesforce case" });
    }

    return res.status(200).json(report);
  } catch (error) {
    next(error);
  }
}
