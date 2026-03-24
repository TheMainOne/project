import "dotenv/config";
import mongoose from "mongoose";

import Supplier from "../extensions/sf-compliance/models/Supplier.js";
import Regulation from "../extensions/sf-compliance/models/Regulation.js";
import ComplianceDocument from "../extensions/sf-compliance/models/ComplianceDocument.js";
import ComplianceAssertion from "../extensions/sf-compliance/models/ComplianceAssertion.js";

async function getRegulationMap() {
  const regs = await Regulation.find({});
  const map = {};

  regs.forEach((r) => {
    map[r.code] = r._id;
  });

  return map;
}

async function getOrCreateSupplier({ supplierCode, supplierName }) {
  let supplier = await Supplier.findOne({ supplierCode });

  if (!supplier) {
    supplier = await Supplier.create({
      supplierCode,
      supplierName,
    });
  }

  return supplier;
}

async function createDocument(data) {
  return ComplianceDocument.create(data);
}

async function createAssertion(data) {
  return ComplianceAssertion.create(data);
}

async function run() {
  await mongoose.connect(process.env.DATABASE_URL);

  console.log("Connected to DB");

  const regMap = await getRegulationMap();

  // ===============================
  // 1. AMCOR
  // ===============================

const amcor = await getOrCreateSupplier({
  supplierCode: "AMCOR",
  supplierName: "Amcor",
});

  const amcorDoc = await createDocument({
    supplierId: amcor._id,
    title: "Amcor Comprehensive Statement 2025",
    fileName: "FCD_1366_Amcor_2025.pdf",
    storage: {
      provider: "sharepoint",
      url: "https://dwklifesciences.sharepoint.com/:b:/r/sites/DWKQualitySystem/Shared Documents/General/04 Compliance (Regulatory, DMFs, Product Info)/Regulatory/Manufacturer Statement/Amcor/FCD 1366 ARP Comprehensive Statement of Regulatory Compliance 04 March 2025 R17.pdf?csf=1&web=1&e=45wGEl",
    },
    documentType: "comprehensive_statement",
    issueDate: new Date("2025-03-04"),
    status: "active",
  });

  const amcorRegs = [
    "REACH",
    "BSE_TSE",
    "CA_PROP_65",
    "PFAS",
    "NITROSAMINES",
    "EU_POP",
    "PHTHALATES",
    "LATEX",
    "ALLERGENS",
  ];

  for (const code of amcorRegs) {
    if (!regMap[code]) continue;

    await createAssertion({
      supplierId: amcor._id,
      documentId: amcorDoc._id,
      regulationId: regMap[code],
      assertionType: "compliant",
      coverageLevel: "supplier_all",
      scope: {
        allSupplierItems: true,
      },
      statementText: `Amcor compliant with ${code}`,
    });
  }

  // ===============================
  // 2. IAM (Piviex)
  // ===============================

const iam = await getOrCreateSupplier({
  supplierCode: "IAM",
  supplierName: "IAM",
});

  const iamDoc = await createDocument({
    supplierId: iam._id,
    title: "IAM Compliance Statement 2024",
    fileName: "IAM_2024.pdf",
    storage: {
      provider: "sharepoint",
      url: "https://dwklifesciences.sharepoint.com/:b:/r/sites/DWKQualitySystem/Shared Documents/General/04 Compliance (Regulatory, DMFs, Product Info)/Regulatory/Manufacturer Statement/IAM, Piviex/Compliance Statement April 2024.pdf?csf=1&web=1&e=p9pYbf",
    },
    documentType: "comprehensive_statement",
    issueDate: new Date("2024-04-05"),
    status: "active",
  });

  const iamRegs = [
    "REACH",
    "ROHS",
    "BSE_TSE",
    "LATEX",
    "PHTHALATES",
    "GMO",
    "DNase & RNase",
    "BisPhenol A(BPA)",
  ];

  for (const code of iamRegs) {
    if (!regMap[code]) continue;

    await createAssertion({
      supplierId: iam._id,
      documentId: iamDoc._id,
      regulationId: regMap[code],
      assertionType: "compliant",
      coverageLevel: "supplier_all",
      scope: { allSupplierItems: true },
      statementText: `IAM compliant with ${code}`,
    });
  }

  // PFAS FREE (item-specific)
  const iamPFASDoc = await createDocument({
    supplierId: iam._id,
    title: "IAM PFAS Free 2025",
    fileName: "PFAS_30MAY25.pdf",
    storage: {
      provider: "sharepoint",
      url: "https://dwklifesciences.sharepoint.com/:b:/r/sites/DWKQualitySystem/Shared Documents/General/04 Compliance (Regulatory, DMFs, Product Info)/Regulatory/Manufacturer Statement/IAM, Piviex/PFAS 30MAY25.pdf?csf=1&web=1&e=b3XWeu",
    },
    issueDate: new Date("2025-05-30"),
    status: "active",
  });

  await createAssertion({
    supplierId: iam._id,
    documentId: iamPFASDoc._id,
    regulationId: regMap["PFAS"],
    assertionType: "free_from",
    coverageLevel: "item_list",
    scope: {
      dwkItemNumbers: [
        "9721000001",
        "9721050002",
        "9721200003",
      ],
      statementText: `IAM specific item compliant with PFAS`,
    },
  });

  // ===============================
  // 3. NIPRO
  // ===============================

const nipro = await getOrCreateSupplier({
  supplierCode: "NIPRO",
  supplierName: "Nipro",
});

  const niproDoc = await createDocument({
    supplierId: nipro._id,
    title: "Nipro Global Compliance",
    fileName: "Nipro_2025.pdf",
    storage: {
      provider: "sharepoint",
      url: "https://dwklifesciences.sharepoint.com/:b:/r/sites/DWKQualitySystem/Shared Documents/General/04 Compliance (Regulatory, DMFs, Product Info)/Regulatory/Manufacturer Statement/Nipro/Comprehensive compliance - tubing type I and primary packaging - Global declaration - June 2025.pdf?csf=1&web=1&e=YuD3Wb",
    },
    issueDate: new Date("2025-06-01"),
    status: "active",
  });

  const niproRegs = [
    "REACH",
    "ROHS",
    "CA_PROP_65",
    "TSCA",
    "MELAMINE",
    "NITROSAMINES",
    "PHTHALATES",
    "Latex",
    "GMO",
    "EU_POP",
    "RNase"
  ];

  for (const code of niproRegs) {
    if (!regMap[code]) continue;

    await createAssertion({
      supplierId: nipro._id,
      documentId: niproDoc._id,
      regulationId: regMap[code],
      assertionType: "compliant",
      coverageLevel: "supplier_all",
      scope: { allSupplierItems: true },
      statementText: `Nipro compliant with ${code}`,
    });
  }

  // PFAS (separate doc)
  const niproPFASDoc = await createDocument({
    supplierId: nipro._id,
    title: "Nipro PFAS 2023",
    fileName: "PFAS_2023.pdf",
    storage: {
      provider: "sharepoint",
      url: "https://dwklifesciences.sharepoint.com/:b:/r/sites/DWKQualitySystem/Shared Documents/General/04 Compliance (Regulatory, DMFs, Product Info)/Regulatory/Manufacturer Statement/Nipro/PFAS - Vials - Global declaration - October 2023.pdf?csf=1&web=1&e=PqroTf",
    },
    issueDate: new Date("2023-10-31"),
    status: "active",
  });

  await createAssertion({
    supplierId: nipro._id,
    documentId: niproPFASDoc._id,
    regulationId: regMap["PFAS"],
    assertionType: "compliant",
    coverageLevel: "supplier_all",
    scope: { allSupplierItems: true },
    statementText: `Nipro compliant with PFAS`,
  });

  // ===============================
  // DONE
  // ===============================

  console.log("Seed completed");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});