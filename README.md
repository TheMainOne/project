# Навигация по документу


3. [API Endpoints для управления регулирующими актами](#our-api-endpoints-for-managing-regulatory)
   - [Получение всех регулирующих актов](#1-получение-всех-регулирующих-актов)
   - [Получение конкретного регулирующего акта по ID](#2-получение-конкретного-регулирующего-акта-по-id)
   - [Добавление нового регулирующего акта](#3-добавление-нового-регулирующего-акта)
   - [Изменение регулирующего акта](#4-обновление-существующего-регулирующего-акта)
   - [Удаление регулирующего акта](#5-удаление-регулирующего-акта)



#### Our API Endpoints for User registration, login, and logout

| Method             | URL                                      | Description                              |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| `POST`             | `/signup`                                | Register a New User in the System.       |
| `POST`             | `/login`                                 | Login an existing user in the system.    |
| `POST`             | `/logout`                                | logout an existing user in the system.   |

_________________________________________

**1. Регистрация нового пользователя**  
    Метод: POST

URL: /signup

Описание: Регистрирует нового пользователя в системе.

Параметры запроса (json-файл с полями):
```json
{
  "email": "someemail@gmail.com", (required)
  "password": "somepassword", (required)
  "name": "somename", (required)
  "role": "somerole" (enum: ["employee", "admin", "manager"] (optional, default = "employee")
}
```

Пример запроса:

**POST /signup**
Content-Type: application/json
```json
{
  "email": "test@gmail.com",
  "password": "test",
  "name": "TestName"
}
```
Пример ответа:
```json
{
  "status": "success",
  "code": 201,
  "data": {
    "user": {
      "id": "66dafb73560231bfa7339411",
      "name": "TestName",
      "email": "test@gmail.com",
      "role": "employee"
    }
  }
}
```
Статусы ответов:

- **201 Created** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **409 Conflict** — юзер с таким email или именем уже существует

_________________________________________

**2. Логинизация нового пользователя**
    Метод: POST

URL: /login

Описание: Вход существующего пользователя в систему.

Параметры запроса (json-файл с полями):
```json
{
"email": "test@gmail.com", (required)
"password": "test" (required)
}
```
Пример запроса:

**POST /login**
Content-Type: application/json
```json
{
"email": "test@gmail.com", 
"password": "test"
}
```
Пример ответа:
```json
{
    "status": "success",
    "code": 200,
    "data": {
        "user": {
            "id": "66d34e63cf1f9c8fea704737",
            "email": "test@gmail.com",
            "role": "admin"
        },
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY2ZDM0ZTYzY2YxZjljOGZlYTcwNDczNyIsImlhdCI6MTcyNTYzMTU4NSwiZXhwIjoxNzI1NjM1MTg1fQ.x-sbM9MPrbr5EonkwYiMsIJ-hKWXVHbH3-ZqDikocbU"
    }
}
```
Статусы ответов:

- **200 OK** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неправильный емейл или пароль

_________________________________________

**3. Логаут существующего пользователя**
    Метод: POST

URL: /logout

Описание: Выход существующего пользователя из системы.

Параметры запроса:  
*Добавить Bearer Token в headers при запросе*  
Body: пустое


Пример запроса:

**POST /logout**
Content-Type: application/json

*Bearer Token*  
Body: пустое

Пример ответа:
```json
{
    "status": "success",
    "code": 200,
    "message": "Successfully logged out"
}
```
Статусы ответов:

- **200 OK** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неправильная подпись JWT-Token


_________________________________________

   
#### Our API endpoints for managing materials

| Method             | URL                                      | Description                              |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| `GET`              | `/api/materials`                         | Retrieve all materials.                  |
| `GET`              | `/api/materials/:id`                     | Retrieve material by id.                 |
| `POST`             | `/api/materials`                         | Create a new material.                   |
| `PUT`              | `/api/materials/:id`                     | Update material by id.                   |
| `DELETE`           | `/api/materials/:id`                     | Delete material by id.                   |

_________________________________________

**1. Получение всех матералов**
    Метод: GET

URL: /api/materials

Описание: Получение всех материалов хранящихся в базе данных.

Параметры запроса:  
*Добавить Bearer Token в headers при запросе*  
Body: пустое

Пример запроса:

**GET /api/materials**

*Bearer Token*  
Body: пустое  

Пример ответа:
```json
{
    "status": "success",
    "code": 200,
    "data": {
        "materials": [
            {
                "_id": "66d0764dd8bdd28e5e126fd9",
                "partNumber": "W008761A",
                "parentID": null,
                "description": "15MM ECDT, LDPE NAT, .020 SQ",
                "supplier": "Amcor",
                "supplierItemNumber": "11954-158",
                "components": [],
                "countryOfOrigin": "US",
                "status": "Active",
                "regulatoryCompliance": [
                    {
                        "title": "EU REACH",
                        "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals",
                        "status": "pending"
                    }
                ],
                "BOMcomponent": "",
                "BOMComponent": "",
                "storagePath": "",
                "updatedAt": "2024-09-03T17:53:59.329Z"
            }]}}
```
Статусы ответов:

- **200 OK** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неавторизованный юзер

_________________________________________

**2. Получение одного материала по ID**
    Метод: GET

URL: /api/materials/:id

Описание: Получение одного материала по его ID.

Параметры запроса:  
*Добавить Bearer Token в headers при запросе*  
Body: пустое

Пример запроса:

**GET /api/materials/:id**

*Bearer Token*  
Body: пустое  

Пример ответа:
```json
{
    "status": "success",
    "code": 200,
    "data": {
        "material": {
            "_id": "66d0764dd8bdd28e5e126fd6",
            "partNumber": "W224100-423",
            "parentID": null,
            "description": "20 mm Stopper, Igloo, Omniflex",
            "supplier": "",
            "supplierItemNumber": "",
            "components": [
                {
                    "storagePath": "",
                    "partNumber": "50101073A",
                    "parentID": "66d0764dd8bdd28e5e126fd6",
                    "description": "20MM STOPPER, OMNI FLEX 3G IGLOO LYO",
                    "supplier": "DATWYLER",
                    "supplierItemNumber": "40003527",
                    "components": [],
                    "countryOfOrigin": "US",
                    "status": "Active",
                    "regulatoryCompliance": [
                        {
                            "title": "EU REACH",
                            "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals",
                            "status": "pending"
                        }
                    ],
                    "BOMComponent": ""
                }
            ],
            "countryOfOrigin": "US",
            "status": "Active",
            "regulatoryCompliance": [
                {
                    "title": "EU REACH",
                    "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals",
                    "status": "pending"
                }
            ],
            "BOMcomponent": "BAG, 6 x 8 x 2 MIL, ROLL, WHT & CLR",
            "BOMComponent": "",
            "storagePath": ""
        }
    }
}
```
Статусы ответов:

- **200 OK** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неавторизованный юзер
  
_________________________________________

**3. Добавление нового материала в базу данных**
    Метод: POST

URL: /api/materials

Описание: Добавление нового материала в базу данных.

Параметры запроса:  
*Добавить Bearer Token в headers при запросе*  
```json
 {
                "partNumber": "W224100-021", (required)
                "parentID": null, (optional)
                "description": "20 mm Stopper, Igloo, Omniflex", (required)
                "supplier": "", (optional)
                "supplierItemNumber": "", (optional)
                "components": [
                    {
                        "storagePath": "",
                        "partNumber": "50101073A",
                        "parentID": "66d0764dd8bdd28e5e126fd6",
                        "description": "20MM STOPPER, OMNI FLEX 3G IGLOO LYO",
                        "supplier": "DATWYLER",
                        "supplierItemNumber": "40003527",
                        "components": [],
                        "countryOfOrigin": "US",
                        "status": "Active",
                        "regulatoryCompliance": [
                            {
                                "title": "EU REACH",
                                "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals",
                                "status": "pending"
                            }
                        ],
                        "BOMcomponent": ""
                    }
                ], (optional)
                "countryOfOrigin": "US", (optional)
                "status": "Active", (required)
                "regulatoryCompliance": [
                    {
                        "title": "EU REACH",
                        "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals",
                        "status": "pending"
                    }
                ], (optional)
                "BOMcomponent": "", (optional)
                "storagePath": "" (optional)
            }
```
Пример запроса:

**POST /api/materials/**

*Bearer Token*  
```json
 {
                "partNumber": "W224100-021",
                "parentID": null,
                "description": "20 mm Stopper, Igloo, Omniflex",
                "supplier": "",
                "supplierItemNumber": "",
                "components": [
                    {
                        "storagePath": "",
                        "partNumber": "50101073A",
                        "parentID": "66d0764dd8bdd28e5e126fd6",
                        "description": "20MM STOPPER, OMNI FLEX 3G IGLOO LYO",
                        "supplier": "DATWYLER",
                        "supplierItemNumber": "40003527",
                        "components": [],
                        "countryOfOrigin": "US",
                        "status": "Active",
                        "regulatoryCompliance": [
                            {
                                "title": "EU REACH",
                                "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals",
                                "status": "pending"
                            }
                        ],
                        "BOMcomponent": ""
                    }
                ],
                "countryOfOrigin": "US",
                "status": "Active",
                "regulatoryCompliance": [
                    {
                        "title": "EU REACH",
                        "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals",
                        "status": "pending"
                    }
                ],
                "BOMcomponent": "",
                "storagePath": ""
            }
```
Пример ответа:
```json
{
    "status": "success",
    "code": 201,
    "data": {
        "material": {
            "partNumber": "W224100-021",
            "description": "20 mm Stopper, Igloo, Omniflex",
            "supplier": "",
            "supplierItemNumber": "",
            "parentID": null,
            "components": [
                {
                    "partNumber": "50101073A",
                    "parentID": "66d0764dd8bdd28e5e126fd6",
                    "description": "20MM STOPPER, OMNI FLEX 3G IGLOO LYO",
                    "supplier": "DATWYLER",
                    "supplierItemNumber": "40003527",
                    "components": [],
                    "countryOfOrigin": "US",
                    "status": "Active",
                    "regulatoryCompliance": [
                        {
                            "title": "EU REACH",
                            "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals",
                            "status": "pending"
                        }
                    ],
                    "BOMcomponent": "",
                    "storagePath": ""
                }
            ],
            "countryOfOrigin": "US",
            "status": "Active",
            "regulatoryCompliance": [
                {
                    "title": "EU REACH",
                    "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals",
                    "status": "pending"
                }
            ],
            "BOMcomponent": "",
            "storagePath": "",
            "_id": "66db37eb094cb688dc2a79fc",
            "createdAt": "2024-09-06T17:12:11.819Z",
            "updatedAt": "2024-09-06T17:12:11.819Z"
        }
    }
}
```
Статусы ответов:

- **201 Created** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неавторизованный юзер
- **409 Conflict** — материал с таким partNumber уже есть в базе данных

_________________________________________

**4. Изменение существующего в базе данных материала**
    Метод: PUT

URL: /api/materials/:id

Описание: Изменение свойств материала в базе данных.

Параметры запроса:  
*Добавить Bearer Token в headers при запросе*  

```json
{
            "partNumber": "W224100-021", (optional)
            "description": "20 mm Stopper, Igloo, Omniflex", (optional)
            "supplier": "", (optional)
            "supplierItemNumber": "", (optional)
            "parentID": null, (optional)
            "countryOfOrigin": "", (optional)
            "status": "Active", (optional)
            "BOMcomponent": "", (optional)
            "storagePath": "", (optional)
            "components": [], (optional)
            "regulatoryCompliance": [] (optional)
        }
```

Пример запроса:

**PUT /api/materials/:id**

*Bearer Token*  
```json
{
            "partNumber": "W224100-021",
            "description": "20 oz bottle"
        }
```
Пример ответа:
```json
{
    "status": "success",
    "code": 200,
    "data": {
        "material": {
            "_id": "66db38df094cb688dc2a7a00",
            "partNumber": "W224100-021",
            "description": "20 oz bottle",
            "supplier": "",
            "supplierItemNumber": "",
            "parentID": null,
            "countryOfOrigin": "",
            "status": "Active",
            "BOMcomponent": "",
            "storagePath": "",
            "components": [],
            "regulatoryCompliance": [],
            "createdAt": "2024-09-06T17:16:15.483Z",
            "updatedAt": "2024-09-06T17:24:18.562Z"
        }
    }
}
```
Статусы ответов:

- **200 OK** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неавторизованный юзер
_________________________________________

**5. Удаление существующего в базе данных материала**
    Метод: DELETE

URL: /api/materials/:id

Описание: Удаление материала из базы данных.

Параметры запроса:  
*Добавить Bearer Token в headers при запросе*  
Body: пустое  


Пример запроса:

**DELETE /api/materials/:id**

*Bearer Token*  
Body: пустое  

Пример ответа:
```json
{
    "status": "success",
    "code": 200,
    "message": "Material deleted successfully",
    "data": {
        "deletedMaterial": {
            "_id": "66db37eb094cb688dc2a79fc",
            "partNumber": "W224100-021",
            "description": "20 mm Stopper, Igloo, Omniflex",
            "supplier": "",
            "supplierItemNumber": "",
            "parentID": null,
            "components": [
                {
                    "partNumber": "50101073A",
                    "parentID": "66d0764dd8bdd28e5e126fd6",
                    "description": "20MM STOPPER, OMNI FLEX 3G IGLOO LYO",
                    "supplier": "DATWYLER",
                    "supplierItemNumber": "40003527",
                    "components": [],
                    "countryOfOrigin": "US",
                    "status": "Active",
                    "regulatoryCompliance": [
                        {
                            "title": "EU REACH",
                            "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals",
                            "status": "pending"
                        }
                    ],
                    "BOMcomponent": "",
                    "storagePath": ""
                }
            ],
            "countryOfOrigin": "US",
            "status": "Active",
            "regulatoryCompliance": [
                {
                    "title": "EU REACH",
                    "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals",
                    "status": "pending"
                }
            ],
            "BOMcomponent": "",
            "storagePath": "",
            "createdAt": "2024-09-06T17:12:11.819Z",
            "updatedAt": "2024-09-06T17:12:11.819Z"
        }
    }
}
```
Статусы ответов:

- **200 OK** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неавторизованный юзер

_________________________________________


#### Our API endpoints for managing regulatory

| Method             | URL                                      | Description                              |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| `GET`              | `/api/regulatories`                      | Retrieve all regulatories.               |
| `GET`              | `/api/regulatories/:id`                  | Retrieve regulation by id.               |
| `POST`             | `/api/regulatories`                      | Create a new regulation.                 |
| `PUT`              | `/api/regulatories/:id`                  | Update regulation by id.                 |
| `DELETE`           | `/api/regulatories/:id`                  | Delete regulation by id.                 |

_________________________________________  

#### 1. Получение всех регулирующих актов

- **Метод:** GET
- **URL:** `/api/regulatories`
- **Описание:** Возвращает список всех регулирующих актов.
- **Требования:** Аутентификация пользователя.
- **Пример запроса:**
  ```
  GET /api/regulatories
  Authorization: Bearer <token>
  ```
- **Пример ответа:**
  ```json
  {
    "status": "success",
    "code": 200,
    "data": {
      "regulations": [
        {
          "_id": "60f5c4463e85f20a545f57c3",
          "title": "EU REACH",
          "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals"
        },
        {
          "_id": "60f5c4463e85f20a545f57c4",
          "title": "EU RoHS",
          "description": "Restriction of Hazardous Substances Directive"
        }
      ]
    }
  }
  ```
- **Статусы ответов:**
  - 200 OK — успешный запрос.
  - 401 Unauthorized — ошибка аутентификации.
  - 500 Internal Server Error — ошибка сервера.

---

#### 2. Получение конкретного регулирующего акта по ID

- **Метод:** GET
- **URL:** `/api/regulatories/:id`
- **Описание:** Возвращает данные конкретного регулирующего акта по его ID.
- **Требования:** Аутентификация пользователя, корректный ID.
- **Пример запроса:**
  ```
  GET /api/regulatories/60f5c4463e85f20a545f57c3
  Authorization: Bearer <token>
  ```
- **Пример ответа:**
  ```json
  {
    "status": "success",
    "code": 200,
    "data": {
      "_id": "60f5c4463e85f20a545f57c3",
      "title": "EU REACH",
      "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals"
    }
  }
  ```
- **Статусы ответов:**
  - 200 OK — успешный запрос.
  - 400 Bad Request — некорректный ID.
  - 401 Unauthorized — ошибка аутентификации.
  - 404 Not Found — акт не найден.
  - 500 Internal Server Error — ошибка сервера.

---

#### 3. Добавление нового регулирующего акта

- **Метод:** POST
- **URL:** `/api/regulatories`
- **Описание:** Добавляет новый регулирующий акт в базу данных.
- **Требования:** Аутентификация пользователя, корректное тело запроса.
- **Пример запроса:**

  ```
  POST /api/regulatories
  Content-Type: application/json
  Authorization: Bearer <token>

  {
    "title": "EU REACH", (required)
    "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals" (required)
  }
  ```

- **Пример ответа:**
  ```json
  {
    "status": "success",
    "code": 201,
    "data": {
      "regulation": {
        "_id": "60f5c4463e85f20a545f57c3",
        "title": "EU REACH",
        "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals"
      }
    }
  }
  ```
- **Статусы ответов:**
  - 201 Created — акт успешно добавлен.
  - 400 Bad Request — неверный формат данных.
  - 401 Unauthorized — ошибка аутентификации.
  - 500 Internal Server Error — ошибка сервера.

---

#### 4. Обновление существующего регулирующего акта

- **Метод:** PUT
- **URL:** `/api/regulatories/:id`
- **Описание:** Обновляет данные существующего регулирующего акта.
- **Требования:** Аутентификация пользователя, корректный ID и тело запроса.
- **Пример запроса:**

  ```
  PUT /api/regulatories/60f5c4463e85f20a545f57c3
  Content-Type: application/json
  Authorization: Bearer <token>

  {
    "title": "EU REACH Updated", (optional)
    "description": "Updated description" (optional)
  }
  ```

- **Пример ответа:**
  ```json
  {
    "status": "success",
    "code": 200,
    "data": {
      "_id": "60f5c4463e85f20a545f57c3",
      "title": "EU REACH Updated",
      "description": "Updated description"
    }
  }
  ```
- **Статусы ответов:**
  - 200 OK — акт успешно обновлен.
  - 400 Bad Request — неверный формат данных или ID.
  - 401 Unauthorized — ошибка аутентификации.
  - 404 Not Found — акт не найден.
  - 500 Internal Server Error — ошибка сервера.

---

#### 5. Удаление регулирующего акта

- **Метод:** DELETE
- **URL:** `/api/regulatories/:id`
- **Описание:** Удаляет регулирующий акт по ID.
- **Требования:** Аутентификация пользователя, корректный ID.
- **Пример запроса:**
  ```
  DELETE /api/regulatories/60f5c4463e85f20a545f57c3
  Authorization: Bearer <token>
  ```
- **Пример ответа:**
  ```json
  {
    "status": "success",
    "code": 200,
    "message": "Regulation deleted successfully"
  }
  ```
- **Статусы ответов:**
  - 200 OK — акт успешно удален.
  - 400 Bad Request — неверный ID.
  - 401 Unauthorized — ошибка аутентификации.
  - 404 Not Found — акт не найден.
  - 500 Internal Server Error — ошибка сервера.


