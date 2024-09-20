export const updateParentRegulatoryCompliance = (parentMaterial) => {
    const allRegulations = new Map();
  
    // Рекурсивная функция для обхода всех компонентов
    function traverseComponents(components) {
      components.forEach(component => {
        component.regulatoryCompliance.forEach(regulation => {
          if (!allRegulations.has(regulation.title)) {
            allRegulations.set(regulation.title, { ...regulation, status: [] });
          }
  
          // Добавляем статус для каждой регуляции
          const regulationData = allRegulations.get(regulation.title);
          regulationData.status.push(regulation.status);
        });
  
        // Если у компонента есть вложенные компоненты, продолжаем обход рекурсивно
        if (component.components && component.components.length > 0) {
          traverseComponents(component.components);
        }
      });
    }
  
    // Запускаем рекурсивную функцию для компонентов родителя
    traverseComponents(parentMaterial.components);
  
    // Определяем статус для каждой регуляции у родителя
    const updatedRegulatoryCompliance = [];
    allRegulations.forEach((regulationData, title) => {
      const statuses = regulationData.status;
  
      let finalStatus;
      
      // Приоритет статусов
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
  
      // Устанавливаем итоговый статус
      regulationData.status = finalStatus;
      updatedRegulatoryCompliance.push(regulationData);
    });
  
    return updatedRegulatoryCompliance;
  }

