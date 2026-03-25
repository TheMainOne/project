const seedEntries = [
  {
    supplier: {
      supplierCode: "DATWYLER",
      supplierName: "Datwyler",
      aliases: ["DATWYLER PHARMA PACKAGING", "DATWYLER PHARMA PACKAGING USA INC"],
    },
    document: {
      title: "Multi-Regulation Compliance for FM Series",
      fileName: "MD0035-02 February 2024.pdf",
      url: "https://dwklifesciences.sharepoint.com/:b:/r/sites/DWKQualitySystem/Shared Documents/General/04 Compliance (Regulatory, DMFs, Product Info)/Regulatory/Manufacturer Statement/Datwyler/MD0035-02 February 2024.pdf?csf=1&web=1&e=WgSkXD",
      documentType: "certificate",
      issueDate: "2024-02-20",
      validUntil: null,
      status: "active",
    },
    coverage: {
      type: "supplier_subset",
      description: "all FM series",
    },
    regulations: ["REACH","ROHS","CA_PROP_65","ALLERGENS","EU_POP","GMO","MELAMINE","PFAS"],
    assertionType: "compliant",
  },
  {
    supplier: {
      supplierCode: "DATWYLER",
      supplierName: "Datwyler",
      aliases: ["DATWYLER PHARMA PACKAGING", "DATWYLER PHARMA PACKAGING USA INC"],
    },
    document: {
      title: "Nitrosamine Presence Statement for FM Series",
      fileName: "Nitrosamine.pdf",
      url: "https://dwklifesciences.sharepoint.com/:b:/r/sites/DWKQualitySystem/Shared Documents/General/04 Compliance (Regulatory, DMFs, Product Info)/Regulatory/Manufacturer Statement/Datwyler/Nitrosamine.pdf?csf=1&web=1&e=oyX10G",
      documentType: "certificate",
      issueDate: "2023-05-31",
      validUntil: null,
      status: "active",
    },
    coverage: {
      type: "supplier_subset",
      description: "FM27, FM30, FM140, FM240, FM157, FM257, FM457, FM460, FM480 and related series",
    },
    regulations: ["NITROSAMINES"],
    assertionType: "contains",
  },
  {
    supplier: {
      supplierCode: "DATWYLER",
      supplierName: "Datwyler",
      aliases: ["DATWYLER PHARMA PACKAGING", "DATWYLER PHARMA PACKAGING USA INC"],
    },
    document: {
      title: "BSE/TSE Statement for FM457/0 Series",
      fileName: "BSE-TSE for FM457.pdf",
      url: "https://dwklifesciences.sharepoint.com/:b:/r/sites/DWKQualitySystem/Shared Documents/General/04 Compliance (Regulatory, DMFs, Product Info)/Regulatory/Manufacturer Statement/Datwyler/2024/BSE-TSE for FM457.pdf?csf=1&web=1&e=quZagr",
      documentType: "certificate",
      issueDate: "2024-01-01",
      validUntil: null,
      status: "active",
    },
    coverage: {
      type: "supplier_subset",
      description: "FM457/0 series",
    },
    regulations: ["BSE_TSE"],
    assertionType: "free_from",
  },
  {
    supplier: {
      supplierCode: "DATWYLER",
      supplierName: "Datwyler",
      aliases: ["DATWYLER PHARMA PACKAGING", "DATWYLER PHARMA PACKAGING USA INC"],
    },
    document: {
      title: "BSE/TSE, Latex and Nitrosamine Statement for FM460/0 Series",
      fileName: "FM460_0 JP.pdf",
      url: "https://dwklifesciences.sharepoint.com/:b:/r/sites/DWKQualitySystem/Shared Documents/General/04 Compliance (Regulatory, DMFs, Product Info)/Regulatory/Manufacturer Statement/Datwyler/FM460_0 JP.pdf?csf=1&web=1&e=gGB7s4",
      documentType: "certificate",
      issueDate: "2019-06-17",
      validUntil: null,
      status: "active",
    },
    coverage: {
      type: "supplier_subset",
      description: "FM460/0 series",
    },
    regulations: ["BSE_TSE","NITROSAMINES"],
    assertionType: "free_from",
  },
  {
    supplier: {
      supplierCode: "DATWYLER",
      supplierName: "Datwyler",
      aliases: ["DATWYLER PHARMA PACKAGING", "DATWYLER PHARMA PACKAGING USA INC"],
    },
    document: {
      title: "PFAS Presence Statement for Item W001002B",
      fileName: "MDi-C-0586V2 PFAS in B5001-50-96.pdf",
      url: "https://dwklifesciences.sharepoint.com/:b:/s/DWKQualitySystem/ETwzATeRXtpOpEyFLLptHd0BQG-t9_NvXo3BWdTn9p8IaQ?e=eknoEK",
      documentType: "certificate",
      issueDate: "2024-07-09",
      validUntil: null,
      status: "active",
    },
    coverage: {
      type: "item_list",
      dwkItemNumbers: ["W001002B"],
    },
    regulations: ["PFAS"],
    assertionType: "contains",
  },
  {
    supplier: {
      supplierCode: "DATWYLER",
      supplierName: "Datwyler",
      aliases: ["DATWYLER PHARMA PACKAGING", "DATWYLER PHARMA PACKAGING USA INC"],
    },
    document: {
      title: "California Prop 65 Statement for B5001 Compounds",
      fileName: "MDi-G-0411 Prop 65 reporting B5001-compounds.pdf",
      url: "https://dwklifesciences.sharepoint.com/:b:/s/DWKQualitySystem/EYjN-IveC6JIoQRmZoqz364B1GC7uaKYF_iTr1tyzcGAGQ?e=qaDfRN",
      documentType: "certificate",
      issueDate: "2024-09-01",
      validUntil: null,
      status: "active",
    },
    coverage: {
      type: "supplier_subset",
      description: "B5001 compounds",
    },
    regulations: ["CA_PROP_65"],
    assertionType: "contains",
  },
  {
    supplier: {
      supplierCode: "DATWYLER",
      supplierName: "Datwyler",
      aliases: ["DATWYLER PHARMA PACKAGING", "DATWYLER PHARMA PACKAGING USA INC"],
    },
    document: {
      title: "REACH Non-Compliance Statement for B5001 Compounds",
      fileName: "MDi-C-0364 REACH non compliance B5001-compounds.pdf",
      url: "https://dwklifesciences.sharepoint.com/:b:/r/sites/DWKQualitySystem/Shared Documents/General/04 Compliance (Regulatory, DMFs, Product Info)/Regulatory/Manufacturer Statement/Datwyler/MDi-C-0364 REACH non compliance B5001-compounds.pdf?csf=1&web=1&e=FdcJkd",
      documentType: "certificate",
      issueDate: "2023-01-01",
      validUntil: null,
      status: "active",
    },
    coverage: {
      type: "supplier_subset",
      description: "B5001 compounds",
    },
    regulations: ["REACH"],
    assertionType: "contains",
  },
  {
    supplier: {
      supplierCode: "DATWYLER",
      supplierName: "Datwyler",
      aliases: ["DATWYLER PHARMA PACKAGING", "DATWYLER PHARMA PACKAGING USA INC"],
    },
    document: {
      title: "PFAS Presence Statement for OmniFlex and NeoFlex",
      fileName: "MD0093-01.pdf",
      url: "https://dwklifesciences.sharepoint.com/:b:/s/DWKQualitySystem/EZkVCigKdNRJl-619s1VWZkBXtoOfmHjUR1k04XRUyRLsQ?e=hS0UXY",
      documentType: "certificate",
      issueDate: "2024-03-01",
      validUntil: null,
      status: "active",
    },
    coverage: {
      type: "supplier_subset",
      description: "OmniFlex and NeoFlex items",
    },
    regulations: ["PFAS"],
    assertionType: "contains",
  },
];

export default seedEntries;