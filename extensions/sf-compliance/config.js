const sfComplianceConfig = {
  enabled: process.env.COMPLIANCE_ENABLED !== "false",
  provider: process.env.COMPLIANCE_PROVIDER || "stub",
  requestTimeoutMs: Number(process.env.COMPLIANCE_REQUEST_TIMEOUT_MS || 5000),
  logLevel: process.env.COMPLIANCE_LOG_LEVEL || "info",
};

export default sfComplianceConfig;