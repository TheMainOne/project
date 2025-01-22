// const filterAndSort = (req, res, next) => {
//   const { sortBy, sortOrder = 'asc', supplier, status, partNumber, countryOfOrigin, regulatoryCompliance, complianceStatus, parentID, componentPartNumber, description  } = req.query;

//   const filter = {};
//   const sort = {};


//   // Пример, как определить, какой сейчас url:
//   const isMaterialsRoute = req.originalUrl.includes("materials");
//   const isSuppliersRoute = req.originalUrl.includes("suppliers");
//   console.log(isMaterialsRoute)
//   console.log(isSuppliersRoute)

//     // Фильтрация по поставщику (один или несколько)
//     if (supplier) {
//       const suppliers = supplier.split(',').map(s => s.trim());
//       if (suppliers.length === 1) { 
//         // Один поставщик
//         filter.supplier = { $regex: suppliers[0], $options: 'i' };
//       } else {
//         // Несколько поставщиков - использую $or
//         filter.$or = suppliers.map(sup => ({ supplier: { $regex: sup, $options: 'i' } }));
//       }
//     }
  
//   // Фильтрация по статусу (один или несколько)
//   if (status) {
//     const statuses = status.split(',').map(s => s.trim());
//     if (statuses.length === 1) {
//       filter.status = { $regex: statuses[0], $options: 'i' };
//     } else {
//       filter.$or = statuses.map(st => ({ status: { $regex: st, $options: 'i' } }));
//     }
//   }

//   // Фильтрация по номеру материала (один или несколько)
//   if (partNumber) {
//     const parts = partNumber.split(',').map(p => p.trim());
//     if (parts.length === 1) {
//       filter.partNumber = { $regex: parts[0], $options: 'i' };
//     } else {
//       filter.$or = parts.map(pn => ({ partNumber: { $regex: pn, $options: 'i' } }));
//     }
//   }

//   // Фильтрация по стране происхождения (одна или несколько)
//   if (countryOfOrigin) {
//     const origins = countryOfOrigin.split(',').map(o => o.trim());
//     if (origins.length === 1) {
//       filter.countryOfOrigin = { $regex: origins[0], $options: 'i' };
//     } else {
//       filter.$or = origins.map(o => ({ countryOfOrigin: { $regex: o, $options: 'i' } }));
//     }
//   }

//     // Фильтрация по описанию
//     if (description) {
//       filter.description = { $regex: description, $options: 'i' };
//     }

//   // Фильтрация по parentID
//   if (parentID) {
//     filter.parentID = parentID;
//   }

//   // Фильтрация по компонентам
//   if (componentPartNumber) {
//     filter['components'] = {
//       $elemMatch: {
//         partNumber: { $regex: componentPartNumber, $options: 'i' }
//       }
//     };
//   }

//   // Фильтрация по регуляторным актам и статусу
//   if (regulatoryCompliance && complianceStatus) {
//     const complianceArr = regulatoryCompliance.split(',').map(item => item.trim());
  
//     // Строим массив $elemMatch для каждого акта
//     const elemMatchArray = complianceArr.map(c => ({
//       $elemMatch: {
//         title: { $regex: c, $options: 'i' },
//         status: complianceStatus,
//       }
//     }));
  
//     filter['regulatoryCompliance'] = {
//       $all: elemMatchArray
//     };
//   }

//   // Обработка сортировки
//   if (sortBy) {
//     sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
//   }

//   // Передаем фильтры и сортировку в req
//   req.filter = filter;
//   req.sort = sort;

//   next();
// };

const filterAndSort = (req, res, next) => {
  const { sortBy, sortOrder = 'asc' } = req.query;
  const filter = {};
  const sort = {};

  // Определяем, какой маршрут ("api/materials" или "api/suppliers"):
  const isMaterialsRoute = req.originalUrl.includes("materials");
  const isSuppliersRoute = req.originalUrl.includes("suppliers");

   // -----------------------------
  // 1. ЛОГИКА ДЛЯ МАТЕРИАЛОВ
  // -----------------------------
  if (isMaterialsRoute) {
    const { 
      supplier, 
      status, 
      partNumber, 
      countryOfOrigin, 
      regulatoryCompliance, 
      complianceStatus, 
      parentID, 
      componentPartNumber, 
      description
    } = req.query;

    // Фильтрация по поставщику (один или несколько)
    if (supplier) {
      const suppliers = supplier.split(',').map(s => s.trim());
      if (suppliers.length === 1) { 
        // Один поставщик
        filter.supplier = { $regex: suppliers[0], $options: 'i' };
      } else {
        // Несколько поставщиков - использую $or
        filter.$or = suppliers.map(sup => ({ supplier: { $regex: sup, $options: 'i' } }));
      }
    }

    
  // Фильтрация по статусу (один или несколько)
  if (status) {
    const statuses = status.split(',').map(s => s.trim());
    if (statuses.length === 1) {
      filter.status = { $regex: statuses[0], $options: 'i' };
    } else {
      filter.$or = statuses.map(st => ({ status: { $regex: st, $options: 'i' } }));
    }
  }

  // Фильтрация по номеру материала (один или несколько)
  if (partNumber) {
    const parts = partNumber.split(',').map(p => p.trim());
    if (parts.length === 1) {
      filter.partNumber = { $regex: parts[0], $options: 'i' };
    } else {
      filter.$or = parts.map(pn => ({ partNumber: { $regex: pn, $options: 'i' } }));
    }
  }

  // Фильтрация по стране происхождения (одна или несколько)
  if (countryOfOrigin) {
    const origins = countryOfOrigin.split(',').map(o => o.trim());
    if (origins.length === 1) {
      filter.countryOfOrigin = { $regex: origins[0], $options: 'i' };
    } else {
      filter.$or = origins.map(o => ({ countryOfOrigin: { $regex: o, $options: 'i' } }));
    }
  }

    // Фильтрация по описанию
    if (description) {
      filter.description = { $regex: description, $options: 'i' };
    }

      // Фильтрация по parentID
  if (parentID) {
    filter.parentID = parentID;
  }

  
  // Фильтрация по компонентам
  if (componentPartNumber) {
    filter['components'] = {
      $elemMatch: {
        partNumber: { $regex: componentPartNumber, $options: 'i' }
      }
    };
  }

  
  // Фильтрация по регуляторным актам и статусу
  if (regulatoryCompliance && complianceStatus) {
    const complianceArr = regulatoryCompliance.split(',').map(item => item.trim());
  
    // Строим массив $elemMatch для каждого акта
    const elemMatchArray = complianceArr.map(c => ({
      $elemMatch: {
        title: { $regex: c, $options: 'i' },
        status: complianceStatus,
      }
    }));
  
    filter['regulatoryCompliance'] = {
      $all: elemMatchArray
    };
  }
  }

  // -----------------------------
  // 2. ЛОГИКА ДЛЯ ПОСТАВЩИКОВ
  // -----------------------------
  if (isSuppliersRoute) {
    const {
      name,          // поле name в БД
      status,        // поле status в БД
      countryOfOrigin, // поле countryOfOrigin в БД
      createdAt      // поле createdAt (дата создания)
    } = req.query;

    // Фильтрация по name
    if (name) {
      const names = name.split(',').map(n => n.trim());
      if (names.length === 1) {
        filter.name = { $regex: names[0], $options: 'i' };
      } else {
        filter.$or = names.map(n => ({ name: { $regex: n, $options: 'i' } }));
      }
    }

    // Фильтрация по стране происхождения
    if (countryOfOrigin) {
      const origins = countryOfOrigin.split(',').map(o => o.trim());
      if (origins.length === 1) {
        filter.countryOfOrigin = { $regex: origins[0], $options: 'i' };
      } else {
        filter.$or = origins.map(o => ({
          countryOfOrigin: { $regex: o, $options: 'i' }
        }));
      }
    }

    // Фильтрация по статусу (аналогично материалам)
    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      if (statuses.length === 1) {
        filter.status = { $regex: statuses[0], $options: 'i' };
      } else {
        filter.$or = statuses.map(st => ({
          status: { $regex: st, $options: 'i' }
        }));
      }
    }

    if (createdAt) {
      filter.createdAt = {
        $gte: new Date(createdAt),                 // начало "дня"
        $lt: new Date(new Date(createdAt).getTime() + 24*60*60*1000),
      };
    }
  }


  // ----------------------------------------
  // 3. Сортировка (общая для всех маршрутов)
  // ----------------------------------------
  if (sortBy) {
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  } else {
    // Сортировка по умолчанию
    sort.createdAt = -1;
  }


  // Передаем фильтры и сортировку в req
  req.filter = filter;
  req.sort = sort;

  next();
};

export default filterAndSort;