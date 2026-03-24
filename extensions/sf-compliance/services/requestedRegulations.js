const REGULATION_PATTERNS = [
  {
    code: "PFAS",
    patterns: [
      /\bpfas\b/i,
      /\bpfoa\b/i,
      /\bpfos\b/i,
      /per[-\s]?and polyfluoroalkyl/i,
      /polyfluoroalkyl/i,
    ],
  },
  {
    code: "REACH",
    patterns: [
      /\breach\b/i,
      /\bsvhc\b/i,
      /annex\s*xvii/i,
      /reach\s+svhc/i,
    ],
  },
  {
    code: "ROHS",
    patterns: [
      /\brohs\b/i,
      /rohs\s*3/i,
      /eu\s+rohs/i,
    ],
  },
  {
    code: "BSE_TSE",
    patterns: [
      /\bbse\/tse\b/i,
      /\bbse\b/i,
      /\btse\b/i,
      /animal\s+origin/i,
      /animal[-\s]?derived/i,
    ],
  },
  {
    code: "CA_PROP_65",
    patterns: [
      /prop\s*65/i,
      /proposition\s*65/i,
      /california\s+proposition\s+65/i,
    ],
  },
  {
    code: "EU_POP",
    patterns: [
      /\beu\s+pop\b/i,
      /\bpops\b/i,
      /persistent\s+organic\s+pollutants/i,
    ],
  },
  {
    code: "TSCA",
    patterns: [
      /\btsca\b/i,
      /tsca\s+pbt/i,
    ],
  },
  {
    code: "FDA_21_CFR",
    patterns: [
      /\b21\s*cfr\b/i,
      /\bfda\b/i,
      /fda\s+21\s*cfr/i,
    ],
  },
  {
    code: "NITROSAMINES",
    patterns: [
      /\bnitrosamine\b/i,
      /\bnitrosamines\b/i,
    ],
  },
  {
    code: "MELAMINE",
    patterns: [
      /\bmelamine\b/i,
    ],
  },
  {
    code: "LATEX",
    patterns: [
      /\blatex\b/i,
      /natural\s+rubber\s+latex/i,
    ],
  },
  {
    code: "PHTHALATES",
    patterns: [
      /\bphthalate\b/i,
      /\bphthalates\b/i,
      /\bdehp\b/i,
      /\bbbp\b/i,
      /\bdbp\b/i,
      /\bdibp\b/i,
    ],
  },

  // NEW
  {
    code: "SDS_MSDS",
    patterns: [
      /\bsds\b/i,
      /\bmsds\b/i,
      /safety\s+data\s+sheet/i,
      /material\s+safety\s+data\s+sheet/i,
    ],
  },
  {
    code: "GLUTEN",
    patterns: [
      /\bgluten\b/i,
      /gluten[-\s]?free/i,
    ],
  },
  {
    code: "ICH_Q3C",
    patterns: [
      /\bich\s*q3c\b/i,
      /residual\s+solvent/i,
      /residual\s+solvents/i,
    ],
  },
  {
    code: "NON_PYROGENIC",
    patterns: [
      /non[-\s]?pyrogenic/i,
      /pyrogen[-\s]?free/i,
      /free\s+from\s+pyrogens/i,
    ],
  },
  {
    code: "CYTOTOXICITY",
    patterns: [
      /\bcytotoxicity\b/i,
      /\bcytotoxic\b/i,
    ],
  },
  {
    code: "DNASE_RNASE",
    patterns: [
      /\bdnase\b/i,
      /\brnase\b/i,
      /dnase[-\s]?free/i,
      /rnase[-\s]?free/i,
      /dnase\s+and\s+rnase/i,
      /dnase\/rnase/i,
    ],
  },
  {
    code: "MINAMATA",
    patterns: [
      /minamata\s+convention/i,
      /minamata\s+convention\s+on\s+mercury/i,
      /\bmercury\s+convention\b/i,
    ],
  },
  {
    code: "MONTREAL_PROTOCOL",
    patterns: [
      /montreal\s+protocol/i,
      /ozone\s+depleting\s+substances/i,
      /\bods\b/i,
    ],
  },
  {
    code: "CANADA_TOXIC_SUBSTANCES",
    patterns: [
      /canada\s+prohibition\s+of\s+certain\s+toxic\s+substances/i,
      /certain\s+toxic\s+substances\s+regulations/i,
      /canada\s+toxic\s+substances/i,
      /\bcepa\b/i,
    ],
  },
  {
    code: "EU_MDR",
    patterns: [
      /\bmdr\b/i,
      /eu\s+mdr/i,
      /medical\s+device\s+regulation/i,
      /regulation\s*\(eu\)\s*2017\/745/i,
    ],
  },
  {
    code: "CE_MARKING",
    patterns: [
      /\bce\s+mark\b/i,
      /\bce\s+marking\b/i,
      /ce[-\s]?marked/i,
    ],
  },
  {
    code: "EU_BPR",
    patterns: [
      /\bbpr\b/i,
      /eu\s+bpr/i,
      /biocidal\s+products\s+regulation/i,
    ],
  },
  {
    code: "BPA_DEHP",
    patterns: [
      /\bbpa\b/i,
      /bisphenol\s*a/i,
      /\bdehp\b/i,
      /bpa\/dehp/i,
      /bpa\s+and\s+dehp/i,
    ],
  },
  {
    code: "GMO",
    patterns: [
      /\bgmo\b/i,
      /genetically\s+modified\s+organism/i,
      /genetically\s+modified\s+organisms/i,
      /genetically\s+modified/i,
    ],
  },
  {
    code: "ALLERGENS",
    patterns: [
      /\ballergen\b/i,
      /\ballergens\b/i,
      /allergen[-\s]?free/i,
    ],
  },
];

function normalizeInputText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function extractRequestedRegulationsFromCase(payload = {}) {
  const subject = normalizeInputText(payload.subject);
  const description = normalizeInputText(payload.description);
  const combinedText = `${subject}\n${description}`.trim();

  if (!combinedText) {
    return {
      requestedRegulations: [],
      matchedBy: [],
      sourceTextLength: 0,
    };
  }

  const found = [];
  const matchedBy = [];

  for (const entry of REGULATION_PATTERNS) {
    const matchedPattern = entry.patterns.find((pattern) => pattern.test(combinedText));

    if (matchedPattern) {
      found.push(entry.code);
      matchedBy.push({
        code: entry.code,
        pattern: matchedPattern.toString(),
      });
    }
  }

  return {
    requestedRegulations: Array.from(new Set(found)),
    matchedBy,
    sourceTextLength: combinedText.length,
  };
}