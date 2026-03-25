import "dotenv/config";
import mongoose from "mongoose";
import Regulation from "../extensions/sf-compliance/models/Regulation.js";

const regulations = [
  // {
  //   code: "REACH",
  //   name: "EU REACH",
  //   aliases: ["REACH", "EU REACH", "REACH SVHC", "REACH Annex XVII"],
  //   category: "chemical",
  // },
  // {
  //   code: "ROHS",
  //   name: "EU RoHS",
  //   aliases: ["RoHS", "EU RoHS"],
  //   category: "chemical",
  // },
  // {
  //   code: "PFAS",
  //   name: "PFAS",
  //   aliases: ["PFAS", "PFOA", "PFOS", "Per- and polyfluoroalkyl substances"],
  //   category: "chemical",
  // },
  // {
  //   code: "BSE_TSE",
  //   name: "BSE/TSE",
  //   aliases: ["BSE/TSE", "BSE", "TSE"],
  //   category: "animal-origin",
  // },
  // {
  //   code: "CA_PROP_65",
  //   name: "California Proposition 65",
  //   aliases: ["Prop 65", "California Proposition 65", "CA Prop 65"],
  //   category: "regional",
  // },
  // {
  //   code: "EU_POP",
  //   name: "EU POP",
  //   aliases: ["EU POP", "POPs", "Persistent Organic Pollutants"],
  //   category: "chemical",
  // },
  // {
  //   code: "TSCA",
  //   name: "TSCA",
  //   aliases: ["TSCA", "TSCA PBT"],
  //   category: "chemical",
  // },
  // {
  //   code: "FDA_21_CFR",
  //   name: "FDA 21 CFR",
  //   aliases: ["FDA 21 CFR", "21 CFR"],
  //   category: "food-contact",
  // },
  // {
  //   code: "NITROSAMINES",
  //   name: "Nitrosamines",
  //   aliases: ["Nitrosamines"],
  //   category: "chemical",
  // },
  // {
  //   code: "MELAMINE",
  //   name: "Melamine",
  //   aliases: ["Melamine"],
  //   category: "chemical",
  // },
  // {
  //   code: "LATEX",
  //   name: "Latex",
  //   aliases: ["Latex", "Natural Rubber Latex"],
  //   category: "material",
  // },
  // {
  //   code: "PHTHALATES",
  //   name: "Phthalates",
  //   aliases: ["Phthalates"],
  //   category: "chemical",
  // },

  // // --- NEW REGULATIONS ---

  // {
  //   code: "SDS_MSDS",
  //   name: "SDS / MSDS",
  //   aliases: ["SDS", "MSDS", "Safety Data Sheet", "Material Safety Data Sheet"],
  //   category: "documentation",
  // },
  // {
  //   code: "GLUTEN",
  //   name: "Gluten",
  //   aliases: ["Gluten", "Gluten-free"],
  //   category: "food-contact",
  // },
  // {
  //   code: "ICH_Q3C",
  //   name: "Residual Solvents (ICH Q3C)",
  //   aliases: ["ICH Q3C", "Residual solvent"],
  //   category: "pharma",
  // },
  // {
  //   code: "NON_PYROGENIC",
  //   name: "Non-Pyrogenic",
  //   aliases: ["Non Pyrogenic", "Pyrogen-free"],
  //   category: "biological",
  // },
  // {
  //   code: "CYTOTOXICITY",
  //   name: "Cytotoxicity",
  //   aliases: ["Cytotoxicity", "Cytotoxic"],
  //   category: "biological",
  // },
  // {
  //   code: "DNASE_RNASE",
  //   name: "DNase / RNase Free",
  //   aliases: ["DNase", "RNase", "DNase-free", "RNase-free"],
  //   category: "biological",
  // },
  // {
  //   code: "MINAMATA",
  //   name: "Minamata Convention on Mercury",
  //   aliases: ["Minamata Convention", "Mercury Convention"],
  //   category: "environmental",
  // },
  // {
  //   code: "MONTREAL_PROTOCOL",
  //   name: "Montreal Protocol",
  //   aliases: ["Montreal Protocol", "Ozone Depleting Substances"],
  //   category: "environmental",
  // },
  // {
  //   code: "CANADA_TOXIC_SUBSTANCES",
  //   name: "Canada Prohibition of Certain Toxic Substances",
  //   aliases: ["Canada Toxic Substances", "CEPA toxic substances"],
  //   category: "regional",
  // },
  // {
  //   code: "EU_MDR",
  //   name: "EU MDR",
  //   aliases: ["MDR", "EU MDR", "Medical Device Regulation"],
  //   category: "medical",
  // },
  // {
  //   code: "CE_MARKING",
  //   name: "CE Marking",
  //   aliases: ["CE", "CE Marking"],
  //   category: "certification",
  // },
  // {
  //   code: "EU_BPR",
  //   name: "EU BPR",
  //   aliases: ["BPR", "Biocidal Products Regulation"],
  //   category: "chemical",
  // },
  // {
  //   code: "BPA_DEHP",
  //   name: "BPA / DEHP",
  //   aliases: ["BPA", "Bisphenol A", "DEHP"],
  //   category: "chemical",
  // },
  // {
  //   code: "GMO",
  //   name: "GMO",
  //   aliases: ["GMO", "Genetically Modified Organism"],
  //   category: "food-contact",
  // },
  // {
  //   code: "ALLERGENS",
  //   name: "Allergens",
  //   aliases: ["Allergens", "Allergen-free"],
  //   category: "food-contact",
  // },
    {
    code: "MCCP",
    name: "MCCP",
    aliases: ["MCCP"],
    category: "food-contact",
  },
];

async function run() {
  await mongoose.connect(process.env.DATABASE_URL);

  for (const regulation of regulations) {
    await Regulation.findOneAndUpdate(
      { code: regulation.code },
      regulation,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  console.log(`Seeded ${regulations.length} regulations`);
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("seedRegulations failed:", error);
  process.exit(1);
});