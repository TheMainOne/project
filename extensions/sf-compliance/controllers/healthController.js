import { getComplianceHealth } from "../services/healthService.js";

export function getHealth(req, res) {
  res.json({
    status: "ok",
    data: getComplianceHealth(),
  });
}