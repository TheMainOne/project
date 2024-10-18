// export const updateParentRegulatoryCompliance = async (parentMaterial, newRegulation) => {
//   const allRegulations = new Map();

//   // Функция для обработки регуляций конкретного компонента
//   function processRegulatoryCompliance(regulatoryCompliance) {
//     regulatoryCompliance.forEach((regulation) => {
//       // Проверяем на наличие дубликатов по regulationId
//       if (!allRegulations.has(regulation.regulationId.toString())) {
//         allRegulations.set(regulation.regulationId.toString(), {
//           regulationId: regulation.regulationId,
//           title: regulation.title,
//           description: regulation.description,
//           status: [regulation.status],
//         });
//       } else {
//         const existingRegulation = allRegulations.get(regulation.regulationId.toString());
//         // Добавляем только уникальные статусы
//         if (!existingRegulation.status.includes(regulation.status)) {
//           existingRegulation.status.push(regulation.status);
//         }
//       }
//     });
//   }

//   // Обрабатываем regulatoryCompliance самого родительского материала
//   if (parentMaterial.regulatoryCompliance && parentMaterial.regulatoryCompliance.length > 0) {
//     processRegulatoryCompliance(parentMaterial.regulatoryCompliance);
//   }

//   // Рекурсивная функция для обхода всех компонентов и их регуляторных актов
//   function traverseComponents(components) {
//     components.forEach((component) => {
//       if (component.regulatoryCompliance && component.regulatoryCompliance.length > 0) {
//         processRegulatoryCompliance(component.regulatoryCompliance);
//       }

//       // Рекурсивно обрабатываем вложенные компоненты
//       if (component.components && component.components.length > 0) {
//         traverseComponents(component.components);
//       }
//     });
//   }


//   // Обходим все компоненты родительского материала
//   traverseComponents(parentMaterial.components);


//   // Теперь добавляем новый regulation, только если его нет
//   if (!allRegulations.has(newRegulation.regulationId.toString())) {
//     allRegulations.set(newRegulation.regulationId.toString(), {
//       regulationId: newRegulation.regulationId,
//       title: newRegulation.title,
//       description: newRegulation.description,
//       status: [newRegulation.status],
//     });
//   } else {
//     // Если регуляция уже существует, обновляем её статус
//     const regulationData = allRegulations.get(newRegulation.regulationId.toString());
//     if (!regulationData.status.includes(newRegulation.status)) {
//       regulationData.status.push(newRegulation.status);
//     }
//   }

//   // Преобразуем карту в массив и обновляем статус
//   const updatedRegulatoryCompliance = [];
//   allRegulations.forEach((regulationData) => {
//     const statuses = regulationData.status;
//     let finalStatus = "pending";

//     // Логика определения финального статуса
//     if (statuses.every(status => status === 'na')) {
//       finalStatus = 'na';
//     } else if (statuses.every(status => status === 'comply')) {
//       finalStatus = 'comply';
//     } else if (statuses.includes('does_not_comply')) {
//       finalStatus = 'does_not_comply';
//     } else if (statuses.includes('pending')) {
//       finalStatus = 'pending';
//     } else if (statuses.includes('comply') && statuses.some(status => status !== 'comply')) {
//       finalStatus = 'comply_with_exceptions';
//     }

//     regulationData.status = finalStatus;
//     updatedRegulatoryCompliance.push(regulationData);
//   });


//   return updatedRegulatoryCompliance;
// };


export const updateParentRegulatoryCompliance = async (parentMaterial, newRegulation) => {
  const allRegulations = new Map();

  // Функция для обработки регуляций конкретного компонента
  function processRegulatoryCompliance(regulatoryCompliance) {
    regulatoryCompliance.forEach((regulation) => {
      if (!regulation.regulationId) {
        console.error("Отсутствует regulationId:", regulation);
        return; // Пропускаем регуляции без regulationId
      }

      // Проверяем на наличие дубликатов по regulationId
      const regulationIdStr = regulation.regulationId.toString();
      if (!allRegulations.has(regulationIdStr)) {
        allRegulations.set(regulationIdStr, {
          regulationId: regulation.regulationId,
          title: regulation.title,
          description: regulation.description,
          status: [regulation.status],
        });
      } else {
        const existingRegulation = allRegulations.get(regulationIdStr);
        // Добавляем только уникальные статусы
        if (!existingRegulation.status.includes(regulation.status)) {
          existingRegulation.status.push(regulation.status);
        }
      }
    });
  }

  // Обрабатываем regulatoryCompliance самого родительского материала
  if (parentMaterial.regulatoryCompliance && parentMaterial.regulatoryCompliance.length > 0) {
    processRegulatoryCompliance(parentMaterial.regulatoryCompliance);
  }

  // Рекурсивная функция для обхода всех компонентов и их регуляторных актов
  function traverseComponents(components) {
    components.forEach((component) => {
      if (component.regulatoryCompliance && component.regulatoryCompliance.length > 0) {
        processRegulatoryCompliance(component.regulatoryCompliance);
      }

      // Рекурсивно обрабатываем вложенные компоненты
      if (component.components && component.components.length > 0) {
        traverseComponents(component.components);
      }
    });
  }

  // Обходим все компоненты родительского материала
  traverseComponents(parentMaterial.components);

  // Проверяем новый регламент
  if (!newRegulation.regulationId) {
    console.error("Отсутствует regulationId в новом регламенте:", newRegulation);
    throw new Error("Отсутствует regulationId в новом регламенте");
  }

  // Теперь добавляем новый regulation, только если его нет
  const newRegulationIdStr = newRegulation.regulationId.toString();
  if (!allRegulations.has(newRegulationIdStr)) {
    allRegulations.set(newRegulationIdStr, {
      regulationId: newRegulation.regulationId,
      title: newRegulation.title,
      description: newRegulation.description,
      status: [newRegulation.status],
    });
  } else {
    // Если регуляция уже существует, обновляем её статус
    const regulationData = allRegulations.get(newRegulationIdStr);
    if (!regulationData.status.includes(newRegulation.status)) {
      regulationData.status.push(newRegulation.status);
    }
  }

  // Преобразуем карту в массив и обновляем статус
  const updatedRegulatoryCompliance = [];
  allRegulations.forEach((regulationData) => {
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

    regulationData.status = finalStatus;
    updatedRegulatoryCompliance.push(regulationData);
  });

  return updatedRegulatoryCompliance;
};