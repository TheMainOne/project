const filterAndSort = (req, res, next) => {
  const { sortBy, sortOrder = 'asc', supplier, status, partNumber, countryOfOrigin, regulatoryCompliance, complianceStatus, parentID, componentPartNumber, description  } = req.query;

  const filter = {};
  const sort = {};

  // Фильтрация по поставщику
  if (supplier) {
    filter.supplier = { $regex: supplier, $options: 'i' };
  }

  // Фильтрация по статусу
  if (status) {
    filter.status = { $regex: status, $options: 'i' };  // Фильтрация по статусу без учета регистра
  }

  // Фильтрация по номеру материала
  if (partNumber) {
    filter.partNumber = { $regex: partNumber, $options: 'i' };
  }

  // Фильтрация по стране происхождения
  if (countryOfOrigin) {
    filter.countryOfOrigin = { $regex: countryOfOrigin, $options: 'i' };
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
    filter['regulatoryCompliance'] = {
      $elemMatch: {
        title: { $regex: regulatoryCompliance, $options: 'i' },
        status: complianceStatus
      }
    };
  }

  // Обработка сортировки
  if (sortBy) {
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  }

  // Передаем фильтры и сортировку в req
  req.filter = filter;
  req.sort = sort;

  next();
};

export default filterAndSort;