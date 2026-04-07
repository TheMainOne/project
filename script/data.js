const seedEntries = [
  {
    supplier: {
      supplierCode: "SILGAN",
      supplierName: "SILGAN DISPENSING SYSTEMS",
      aliases: ["SILGAN", "SILGAN DISPENSING SYSTEMS"],
    },
    document: {
      title: "CONEG (Heavy Metals) and PFAS Free Statement for DWK Item W010946A",
      fileName: "DWK SD_SLA_PS249 PN_5186679 CONEG PFAS 03.26.2026.pdf",
      url: "https://dwklifesciences.sharepoint.com/:b:/r/sites/DWKQualitySystem/Shared%20Documents/General/04%20Compliance%20(Regulatory,%20DMFs,%20Product%20Info)/Regulatory/Manufacturer%20Statement/Silgan%20Dispensing%20Systems/DWK%20SD_SLA__PS249,_PN_5186679_CONEG,_PFAS_3262026.pdf?csf=1&web=1&e=0bJt11",
      documentType: "certificate",
      issueDate: "2026-03-26",
      validUntil: null,
      status: "active",
    },
    coverage: {
      type: "item_list",
      dwkItemNumbers: ["W010946A"],
    },
    regulations: ["CONEG", "PFAS"],
    assertionType: "compliant",
  },
];

export default seedEntries;