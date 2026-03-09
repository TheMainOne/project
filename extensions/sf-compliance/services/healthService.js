import sfComplianceConfig from "../config.js";

export function getComplianceHealth() {
  return {
    module: "sf-compliance",
    status: sfComplianceConfig.enabled ? "enabled" : "disabled",
    provider: sfComplianceConfig.provider,
  };
}