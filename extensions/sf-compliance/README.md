# SF Compliance Module

`extensions/sf-compliance` — изолированный модуль комплаенса для SF-процессов.

## Структура

- `api/` — публичные HTTP-роуты модуля (агрегируются в `api/index.js`).
- `controllers/` — обработчики HTTP-запросов.
- `services/` — бизнес-логика модуля.
- `models/` — модели/схемы данных модуля.
- `adapters/` — интеграции с внешними системами комплаенса.
- `config.js` — конфигурация модуля через `COMPLIANCE_...` env.

## API contracts

Базовый префикс в приложении: `/api/compliance`.

### `GET /api/compliance/health`

Проверка состояния модуля.

**Response 200**

```json
{
  "status": "ok",
  "data": {
    "module": "sf-compliance",
    "status": "enabled",
    "provider": "stub"
  }
}
```

## Конфигурация

- `COMPLIANCE_ENABLED` — включает/выключает модуль (`false` отключает).
- `COMPLIANCE_PROVIDER` — адаптер/провайдер комплаенса (по умолчанию `stub`).
- `COMPLIANCE_REQUEST_TIMEOUT_MS` — таймаут внешних запросов.
- `COMPLIANCE_LOG_LEVEL` — уровень логирования модуля.

## Границы ответственности

Модуль:

- добавляет только свой API-роутер под `/api/compliance`;
- хранит собственную конфигурацию и внутренние слои (`controllers/services/models/adapters`);
- может развиваться без изменения существующих legacy-контроллеров и legacy-роутов.

Модуль **не** меняет:

- существующие legacy-маршруты (`/api/auth`, `/api/clients`, `/api/telemetry` и т.д.);
- существующие legacy-контроллеры и модели вне `extensions/sf-compliance`;
- текущую схему подключения остальных API в `app.js`, кроме добавления одного агрегирующего роутера.
