export const updateParentRegulatoryCompliance = async (parentMaterial, newRegulation, childMaterials) => {
  const regulationMap = new Map();

  // Функция для обработки массива regulatoryCompliance и добавления данных в regulationMap
  function processRegulatoryCompliance(complianceArray) {
    complianceArray.forEach((regulation) => {
      if (!regulation._id) {
        console.error("Отсутствует _id у регуляции:", regulation);
        return;
      }

      const regulationIdStr = regulation._id.toString();
      if (!regulationMap.has(regulationIdStr)) {
        regulationMap.set(regulationIdStr, {
          _id: regulation._id,
          title: regulation.title,
          description: regulation.description,
          status: [regulation.status],
        });
      } else {
        const existingRegulation = regulationMap.get(regulationIdStr);
        if (!existingRegulation.status.includes(regulation.status)) {
          existingRegulation.status.push(regulation.status);
        }
      }
    });
  }

  // 1. Обработка compliance для самого родительского материала
  if (parentMaterial.regulatoryCompliance && parentMaterial.regulatoryCompliance.length > 0) {
    processRegulatoryCompliance(parentMaterial.regulatoryCompliance);
  }

  // 2. Обработка compliance для всех дочерних компонентов
  childMaterials.forEach((childMaterial) => {
    if (childMaterial.regulatoryCompliance && childMaterial.regulatoryCompliance.length > 0) {
      processRegulatoryCompliance(childMaterial.regulatoryCompliance);
    }
  });

  // 3. Добавляем новый регламент, если его еще нет
  const newRegulationIdStr = newRegulation._id.toString();
  if (!regulationMap.has(newRegulationIdStr)) {
    regulationMap.set(newRegulationIdStr, {
      _id: newRegulation._id,
      title: newRegulation.title,
      description: newRegulation.description,
      status: [newRegulation.status],
    });
  } else {
    const regulationData = regulationMap.get(newRegulationIdStr);
    if (!regulationData.status.includes(newRegulation.status)) {
      regulationData.status.push(newRegulation.status);
    }
  }

  // Преобразуем regulationMap в массив и определяем финальный статус для каждого регламента
  const updatedRegulatoryCompliance = [];
  regulationMap.forEach((regulationData) => {
    const statuses = regulationData.status;
    let finalStatus = "pending";

    // Логика определения финального статуса
    if (statuses.every(status => status === 'na')) {
      finalStatus = 'na';
    } else if (statuses.every(status => status === 'comply')) {
      finalStatus = 'comply';
    } else if (statuses.includes('does_not_comply')) {
      finalStatus = 'does_not_comply';
    } else if (statuses.includes('pending')) {
      finalStatus = 'pending';
    } else if (statuses.includes('comply') && statuses.some(status => status !== 'comply')) {
      finalStatus = 'comply_with_exceptions';
    }

    // Устанавливаем финальный статус и добавляем регламент в обновленный список
    regulationData.status = finalStatus;
    updatedRegulatoryCompliance.push(regulationData);
  });

  console.log(`Updated regulatoryCompliance для ${parentMaterial._id}:`, updatedRegulatoryCompliance);
  
  return updatedRegulatoryCompliance;
};