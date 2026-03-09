import "dotenv/config";
import mongoose from "mongoose";
import Regulation from "../models/Regulation.js";
import EvidenceTypeDictionary from "../models/EvidenceTypeDictionary.js";

const REGULATIONS = [
  {
    code: "REACH",
    jurisdiction: "EU",
    title: "Registration, Evaluation, Authorisation and Restriction of Chemicals",
    aliases: ["EC 1907/2006"],
    requiredEvidenceTypes: ["sds", "reach_declaration"],
  },
  {
    code: "ROHS",
    jurisdiction: "EU",
    title: "Restriction of Hazardous Substances",
    aliases: ["Directive 2011/65/EU"],
    requiredEvidenceTypes: ["rohs_certificate", "lab_report"],
  },
  {
    code: "PROP65",
    jurisdiction: "US-CA",
    title: "California Proposition 65",
    aliases: ["Safe Drinking Water and Toxic Enforcement Act"],
    requiredEvidenceTypes: ["prop65_statement", "chemical_disclosure"],
  },
];

const EVIDENCE_TYPES = [
  { code: "sds", label: "Safety Data Sheet", description: "Latest SDS provided by supplier" },
  { code: "reach_declaration", label: "REACH Declaration", description: "Supplier declaration for REACH compliance" },
  { code: "rohs_certificate", label: "RoHS Certificate", description: "Certificate proving RoHS conformity" },
  { code: "lab_report", label: "Lab Report", description: "Third-party laboratory test report" },
  { code: "prop65_statement", label: "Prop 65 Statement", description: "Statement on listed substances" },
  { code: "chemical_disclosure", label: "Chemical Disclosure", description: "Composition and concentration disclosure" },
];

async function run() {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    throw new Error("DATABASE_URL is required");
  }

  await mongoose.connect(uri, { dbName: process.env.DATABASE_NAME || "materials_reader" });

  for (const regulation of REGULATIONS) {
    await Regulation.updateOne(
      { code: regulation.code },
      { $set: regulation },
      { upsert: true }
    );
  }

  for (const item of EVIDENCE_TYPES) {
    await EvidenceTypeDictionary.updateOne(
      { code: item.code },
      { $set: item },
      { upsert: true }
    );
  }

  console.log(`Seed completed: ${REGULATIONS.length} regulations, ${EVIDENCE_TYPES.length} evidence types.`);
}

run()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
