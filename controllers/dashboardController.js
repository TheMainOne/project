import Material from "../services/schemas/material.js";
import Supplier from "../services/schemas/supplier.js";
import HttpError from "../middlewares/HttpError.js";
import ctrlWrapper from "../middlewares/ctrlWrapper.js";

const getSupplierComplianceBreakdown = async (req, res) => {
    const { supplierName } = req.query;
    if (!supplierName) {
      throw HttpError(400, "supplierName query parameter is required");
    }
  
    // 1. Ищем поставщика по имени
    const supplierDoc = await Supplier.findOne({ name: supplierName });
    if (!supplierDoc) {
      throw HttpError(404, `Supplier with name '${supplierName}' not found`);
    }
  
  // 2. Собираем расширенную аналитику по материалам:
  //    - вычисляем единый статус материала
  //    - считаем, сколько всего материалов
  //    - считаем, сколько материалов в каждом статусе
  //    - суммируем общее число записей в regulatoryCompliance
  const pipeline = [
    {
      $match: { supplierId: supplierDoc._id },
    },
    // Добавляем служебные поля для логики
    {
      $addFields: {
        numberOfRecords: {
          $size: { $ifNull: ["$regulatoryCompliance", []] },
        },
        // Проверяем, есть ли запись со статусом "does_not_comply"
        hasDoesNotComply: {
          $anyElementTrue: {
            $map: {
              input: { $ifNull: ["$regulatoryCompliance", []] },
              as: "rc",
              in: { $eq: ["$$rc.status", "does_not_comply"] },
            },
          },
        },
        // Проверяем, есть ли запись со статусом "comply_with_exceptions"
        hasComplyWithExceptions: {
          $anyElementTrue: {
            $map: {
              input: { $ifNull: ["$regulatoryCompliance", []] },
              as: "rc",
              in: { $eq: ["$$rc.status", "comply_with_exceptions"] },
            },
          },
        },
        // Проверяем, есть ли запись со статусом "pending"
        hasPending: {
          $anyElementTrue: {
            $map: {
              input: { $ifNull: ["$regulatoryCompliance", []] },
              as: "rc",
              in: { $eq: ["$$rc.status", "pending"] },
            },
          },
        },
        // Проверяем, все ли записи "comply"
        // $allElementsTrue вернёт true, если каждый элемент массива удовлетворяет условию
        hasAllComply: {
          $allElementsTrue: {
            $map: {
              input: { $ifNull: ["$regulatoryCompliance", []] },
              as: "rc",
              in: { $eq: ["$$rc.status", "comply"] },
            },
          },
        },
      },
    },
    // Определяем поле materialStatus на основе логики
    {
      $addFields: {
        materialStatus: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$numberOfRecords", 0] },
                then: "no_data",
              },
              {
                case: { $eq: [true, "$hasDoesNotComply"] },
                then: "does_not_comply",
              },
              {
                case: { $eq: [true, "$hasComplyWithExceptions"] },
                then: "comply_with_exceptions",
              },
              {
                case: { $eq: [true, "$hasPending"] },
                then: "pending",
              },
              {
                case: { $eq: [true, "$hasAllComply"] },
                then: "comply",
              },
            ],
            // На всякий случай, если что-то не попало в логику
            default: "mixed",
          },
        },
      },
    },
    // Теперь группируем все документы (материалы) в одну «корзину» (_id: null),
    // считая общее количество, суммарное число записей и собирая статусы в массив
    {
      $group: {
        _id: null,
        totalMaterials: { $sum: 1 },
        sumOfRecords: { $sum: "$numberOfRecords" },
        statuses: { $push: "$materialStatus" },
      },
    },
    // Разворачиваем массив статусов, чтобы посчитать количество по каждому статусу
    {
      $unwind: "$statuses",
    },
    {
      $group: {
        _id: {
          root: "$_id", // всегда null
          status: "$statuses",
        },
        count: { $sum: 1 },
        totalMaterials: { $first: "$totalMaterials" },
        sumOfRecords: { $first: "$sumOfRecords" },
      },
    },
    {
      $group: {
        _id: "$_id.root", // снова null
        statuses: {
          $push: {
            statusName: "$_id.status",
            count: "$count",
          },
        },
        totalMaterials: { $first: "$totalMaterials" },
        sumOfRecords: { $first: "$sumOfRecords" },
      },
    },
    // Финальное преобразование (не вычисляем complianceRate прямо в агрегации, сделаем это в коде)
    {
      $project: {
        _id: 0,
        totalMaterials: 1,
        sumOfRecords: 1,
        statuses: 1,
      },
    },
  ];
  
  const [result] = await Material.aggregate(pipeline);

    // Если у поставщика нет материалов, result может быть undefined
    const finalResult = result || {
      totalMaterials: 0,
      sumOfRecords: 0,
      statuses: [],
    };

      // Считаем complianceRate = доля материалов, чей statusName === "comply"
  let complyCount = 0;
  for (const st of finalResult.statuses) {
    if (st.statusName === "comply") {
      complyCount = st.count;
      break;
    }
  }

  const complianceRate =
  finalResult.totalMaterials === 0
    ? 0
    : complyCount / finalResult.totalMaterials;

      // Считаем averageRecords = среднее число записей regulatoryCompliance
  const averageRecords =
  finalResult.totalMaterials === 0
    ? 0
    : finalResult.sumOfRecords / finalResult.totalMaterials;
  
    res.json({
      status: "success",
      code: 200,
      data: {
        supplier: {
          _id: supplierDoc._id,
          name: supplierDoc.name,
        },
        totalMaterials: finalResult.totalMaterials,
        averageRecords,
        complianceRate,
        // statuses: массив [{ statusName, count }]
        statuses: finalResult.statuses,
      },
    });
  };

  export default {
    getSupplierComplianceBreakdown: ctrlWrapper(getSupplierComplianceBreakdown),
  };
  