import "dotenv/config";
import mongoose from "mongoose";
import Supplier from "../extensions/sf-compliance/models/Supplier.js";

async function run() {
  await mongoose.connect(process.env.DATABASE_URL);
  console.log("Connected to DB");

  const updates = [
    {
      supplierCode: "AMCOR",
      supplierName: "Amcor",
      aliases: [
        "AMCOR",
        "AMCOR RIGID PACKAGING USA, LLC.",
        "AMCOR RIGID PACKAGING",
      ],
    },
    {
      supplierCode: "IAM",
      supplierName: "IAM",
      aliases: [
        "IAM",
        "IAM INDUSTRIES, LLC",
      ],
    },
    {
      supplierCode: "NIPRO",
      supplierName: "Nipro",
      aliases: [
        "NIPRO",
        "NIPRO PHARMAPACKAGING AMERICAS CORP",
      ],
    },
    {
      supplierCode: "DWK_BEIJING",
      supplierName: "DWK Life Sciences Beijing",
      aliases: [
        "DWK LIFE SCIENCES (BEIJING) CO LTD",
        "DWK BEIJING",
      ],
    },
  ];

  for (const item of updates) {
    const existing = await Supplier.findOne({ supplierCode: item.supplierCode });

    if (existing) {
      existing.supplierName = item.supplierName;
      existing.aliases = item.aliases;

      await existing.save();
      console.log(`Updated supplier: ${item.supplierCode}`);
    } else {
      await Supplier.create(item);
      console.log(`Created supplier: ${item.supplierCode}`);
    }
  }

  console.log("Done");
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("updateSupplierAliases failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});