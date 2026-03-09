# Chrome Salesforce Compliance Extension

Минимальный каркас расширения Chrome для Salesforce:
- `content-script` читает данные кейса из DOM;
- `background service worker` отправляет контекст в backend API `/api/compliance/ext/*`.

## Настройка
1. Укажите `API_BASE_URL` в `src/background.js`.
2. Сохраните JWT в `chrome.storage.local` под ключом `complianceToken`.
3. Загрузите папку как unpacked extension в Chrome.