export const REGULATION_DICTIONARY = [
  {
    key: "reach",
    canonicalName: "EU REACH Regulation",
    aliases: ["reach", "ec 1907/2006", "regulation (ec) no 1907/2006"],
    latestVersion: "EC 1907/2006 + candidate list updates",
    jurisdictions: ["eu", "european union"],
  },
  {
    key: "rohs",
    canonicalName: "EU RoHS Directive",
    aliases: ["rohs", "2011/65/eu", "rohs 3", "directive 2011/65/eu"],
    latestVersion: "Directive 2011/65/EU (incl. amendments)",
    jurisdictions: ["eu", "european union"],
  },
  {
    key: "prop65",
    canonicalName: "California Proposition 65",
    aliases: ["prop 65", "proposition 65", "california prop65"],
    latestVersion: "Cal. Health & Safety Code §25249.5 et seq.",
    jurisdictions: ["us", "usa", "california"],
  },
  {
    key: "tsca",
    canonicalName: "US TSCA",
    aliases: ["tsca", "toxic substances control act", "epa tsca"],
    latestVersion: "TSCA + current EPA rules",
    jurisdictions: ["us", "usa"],
  },
  {
    key: "pfas",
    canonicalName: "PFAS Restrictions",
    aliases: ["pfas", "per- and polyfluoroalkyl substances"],
    latestVersion: "Jurisdiction-dependent active PFAS restrictions",
    jurisdictions: ["eu", "us", "canada", "uk"],
  },
];

export function findRegulationsInText(text = "") {
  const input = String(text).toLowerCase();
  return REGULATION_DICTIONARY.filter((reg) =>
    reg.aliases.some((alias) => input.includes(alias.toLowerCase()))
  );
}
