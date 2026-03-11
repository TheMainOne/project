# Chrome Salesforce Compliance Extension

Минимальный каркас расширения Chrome для Salesforce:
- `content-script` читает данные кейса из DOM;
- `background service worker` отправляет контекст в backend API `/api/compliance/ext/*`.

## Настройка локального backend
1. В `src/background.js` установите локальный URL:
   - `const API_BASE_URL = "http://localhost:3000/api/compliance/ext";`
2. Убедитесь, что в `manifest.json` есть `host_permissions` для:
   - `http://localhost:3000/*`
   - `http://127.0.0.1:3000/*`
3. Запустите backend из корня проекта:
   - `npm install`
   - `npm run dev` (или `npm start`)
4. Получите extension JWT:
   - залогиньтесь через `/api/auth/login`
   - вызовите `/api/auth/extension-token` со scope `compliance:read` и `compliance:analyze`
5. Сохраните JWT в `chrome.storage.local` под ключом `complianceToken`.
6. Загрузите папку как unpacked extension в Chrome.

## Как проверить работу расширения
1. Откройте `chrome://extensions`.
2. Включите `Developer mode`.
3. Нажмите `Load unpacked` и выберите папку `extensions/clients/chrome-salesforce-compliance`.
4. Откройте кейс в Salesforce (`*.salesforce.com` / `*.force.com`).
5. В фоне расширение отправит:
   - `POST /api/compliance/ext/case-context`
   - `POST /api/compliance/ext/analyze`
6. Для диагностики откройте сервис-воркер расширения (`Inspect views`) и проверьте Network/Console.