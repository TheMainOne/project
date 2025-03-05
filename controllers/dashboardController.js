import Material from "../services/schemas/material.js";
import Supplier from "../services/schemas/supplier.js";
import HttpError from "../middlewares/HttpError.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";


const getSupplierExtendedAnalytics = async (req, res) => {
  const { supplierName } = req.query;
  if (!supplierName) {
    throw HttpError(400, "supplierName query parameter is required");
  }

  // Находим поставщика по имени
  const supplierDoc = await Supplier.findOne({ name: supplierName });
  if (!supplierDoc) {
    throw HttpError(404, `Supplier with name '${supplierName}' not found`);
  }

  const pipeline = [
    { $match: { supplierId: supplierDoc._id } },
    {
      $addFields: {
        numberOfRecords: { $size: { $ifNull: ["$regulatoryCompliance", []] } },
        hasDoesNotComply: {
          $gt: [
            { $size: {
                $filter: {
                  input: { $ifNull: ["$regulatoryCompliance", []] },
                  as: "rc",
                  cond: { $eq: ["$$rc.status", "does_not_comply"] }
                }
            } },
            0
          ]
        },
        hasPending: {
          $gt: [
            { $size: {
                $filter: {
                  input: { $ifNull: ["$regulatoryCompliance", []] },
                  as: "rc",
                  cond: { $eq: ["$$rc.status", "pending"] }
                }
            } },
            0
          ]
        },
        hasExceptions: {
          $gt: [
            { $size: {
                $filter: {
                  input: { $ifNull: ["$regulatoryCompliance", []] },
                  as: "rc",
                  cond: { $eq: ["$$rc.status", "comply_with_exceptions"] }
                }
            } },
            0
          ]
        },
        hasAllComply: {
          $cond: {
            if: { $gt: [ { $size: { $ifNull: ["$regulatoryCompliance", []] } }, 0 ] },
            then: {
              $eq: [
                { $size: {
                    $filter: {
                      input: "$regulatoryCompliance",
                      as: "rc",
                      cond: { $eq: ["$$rc.status", "comply"] }
                    }
                } },
                { $size: { $ifNull: ["$regulatoryCompliance", []] } }
              ]
            },
            else: false
          }
        }
      }
    },
    {
      $addFields: {
        materialStatus: {
          $switch: {
            branches: [
              { case: { $eq: ["$numberOfRecords", 0] }, then: "no_data" },
              { case: { $eq: [true, "$hasDoesNotComply"] }, then: "non_compliant" },
              { case: { $eq: [true, "$hasPending"] }, then: "pending" },
              { case: { $eq: [true, "$hasExceptions"] }, then: "exceptions" },
              { case: { $eq: [true, "$hasAllComply"] }, then: "fully_compliant" }
            ],
            default: "mixed"
          }
        }
      }
    },
    // Группировка для вычисления общих показателей и сбор статусов материалов
    {
      $group: {
        _id: null,
        totalMaterials: { $sum: 1 },
        sumOfRecords: { $sum: "$numberOfRecords" },
        statuses: { $push: "$materialStatus" }
      }
    },
    { $unwind: "$statuses" },
    {
      $group: {
        _id: { root: "$_id", status: "$statuses" },
        count: { $sum: 1 },
        totalMaterials: { $first: "$totalMaterials" },
        sumOfRecords: { $first: "$sumOfRecords" }
      }
    },
    {
      $group: {
        _id: "$_id.root",
        statuses: { $push: { statusName: "$_id.status", count: "$count" } },
        totalMaterials: { $first: "$totalMaterials" },
        sumOfRecords: { $first: "$sumOfRecords" }
      }
    },
    // Фильтруем массив statuses, оставляя только записи с statusName равным "no_data"
    {
      $project: {
        _id: 0,
        totalMaterials: 1,
        sumOfRecords: 1,
        statuses: {
          $filter: {
            input: "$statuses",
            as: "status",
            cond: { $eq: ["$$status.statusName", "no_data"] }
          }
        }
      }
    }
  ];

  const [result] = await Material.aggregate(pipeline);
  const finalResult = result || {
    totalMaterials: 0,
    sumOfRecords: 0,
    statuses: []
  };

  // Вычисляем дополнительные метрики
  const totalMaterials = finalResult.totalMaterials;
  const averageRecords = totalMaterials > 0 ? finalResult.sumOfRecords / totalMaterials : 0;
  // complianceRate здесь не используется, так как мы оставили только "no_data"
  const noDataEntry = finalResult.statuses.find(entry => entry.statusName === "no_data");
  const noDataCount = noDataEntry ? noDataEntry.count : 0;
  const noDataRate = totalMaterials > 0 ? noDataCount / totalMaterials : 0;

  res.json({
    status: "success",
    code: 200,
    data: {
      supplier: {
        _id: supplierDoc._id,
        name: supplierDoc.name,
      },
      totalMaterials,
      averageRecords,
      noDataRate,
      statuses: finalResult.statuses // будет содержать только статус "no_data"
    }
  });
};

const getSupplierRegulationBreakdown = async (req, res) => {
  const { supplierName, regulation } = req.query;
  if (!supplierName) {
    throw HttpError(400, "supplierName query parameter is required");
  }
  if (!regulation) {
    throw HttpError(400, "regulation query parameter is required");
  }

  // Находим поставщика по имени
  const supplierDoc = await Supplier.findOne({ name: supplierName });
  if (!supplierDoc) {
    throw HttpError(404, `Supplier with name '${supplierName}' not found`);
  }

  const pipeline = [
    // Отбираем материалы для данного поставщика
    { $match: { supplierId: supplierDoc._id } },
    // Фильтруем записи compliance, оставляя только те, где поле 'regulation' соответствует query-параметру
    {
      $addFields: {
        filteredCompliance: {
          $filter: {
            input: { $ifNull: ["$regulatoryCompliance", []] },
            as: "rc",
            cond: {
              $regexMatch: {
                input: "$$rc.title",
                regex: regulation,
                options: "i"
              }
            }
          }
        }
      }
    },
    // Вычисляем количество отфильтрованных записей и булевы флаги по статусам (с использованием $toLower для регистронезависимости)
    {
      $addFields: {
        filteredCount: { $size: "$filteredCompliance" },
        hasDoesNotComply: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: "$filteredCompliance",
                  as: "rc",
                  cond: { $eq: [ { $trim: { input: { $toLower: "$$rc.status" } } }, "comply" ] }
                }
              }
            },
            0
          ]
        },
        hasPending: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: "$filteredCompliance",
                  as: "rc",
                  cond: { $eq: [ { $toLower: "$$rc.status" }, "pending" ] }
                }
              }
            },
            0
          ]
        },
        hasExceptions: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: "$filteredCompliance",
                  as: "rc",
                  cond: { $eq: [ { $toLower: "$$rc.status" }, "comply_with_exceptions" ] }
                }
              }
            },
            0
          ]
        },
        hasAllComply: {
          $cond: {
            if: { $gt: ["$filteredCount", 0] },
            then: {
              $eq: [
                {
                  $size: {
                    $filter: {
                      input: "$filteredCompliance",
                      as: "rc",
                      cond: { $eq: [ { $toLower: "$$rc.status" }, "comply" ] }
                    }
                  }
                },
                "$filteredCount"
              ]
            },
            else: false
          }
        }
      }
    },
    // Определяем итоговый статус материала для данного регулятора
    {
      $addFields: {
        materialRegStatus: {
          $switch: {
            branches: [
              { case: { $eq: ["$filteredCount", 0] }, then: "na" },
              { case: { $eq: [true, "$hasDoesNotComply"] }, then: "does_not_comply" },
              { case: { $eq: [true, "$hasPending"] }, then: "pending" },
              { case: { $eq: [true, "$hasExceptions"] }, then: "comply_with_exceptions" },
              { case: { $eq: [true, "$hasAllComply"] }, then: "comply" }
            ],
            default: "na"
          }
        }
      }
    },
    // Группируем материалы по итоговому статусу
    {
      $group: {
        _id: "$materialRegStatus",
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        status: "$_id",
        count: 1
      }
    }
  ];

  const breakdown = await Material.aggregate(pipeline);

  res.json({
    status: "success",
    code: 200,
    data: {
      supplier: {
        _id: supplierDoc._id,
        name: supplierDoc.name
      },
      regulation,
      breakdown
    }
  });
};

  export default {
    getSupplierExtendedAnalytics: ctrlWrapper(getSupplierExtendedAnalytics),
    getSupplierRegulationBreakdown: ctrlWrapper(getSupplierRegulationBreakdown)
  };
  