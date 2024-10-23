# Навигация по документу
1. [API Endpoints для регистрации, логинизации и разлогинизации юзера](#our-api-endpoints-for-user-registration-login-and-logout)  
   - [Регистрация нового пользователя](#1-регистрация-нового-пользователя)
   - [Логинизация нового пользователя](#2-логинизация-нового-пользователя)
   - [Логаут существующего пользователя](#3-логаут-существующего-пользователя)
   - [Проверка JWT-token](#4-проверка-tokena)

2. [API Endpoints для управления материалами](#our-api-endpoints-for-managing-materials)
   - [Получение всех матералов](#1-получение-всех-матералов)
   - [Получение одного материала по ID](#2-получение-одного-материала-по-id)
   - [Добавление нового материала в базу данных](#3-добавление-нового-материала-в-базу-данных)
   - [Изменение существующего в базе данных материала](#4-изменение-существующего-в-базе-данных-материала)
   - [Удаление существующего в базе данных материала](#5-удаление-существующего-в-базе-данных-материала)
   - [Поиск материалов в базе данных по частичному совпадению их partNumber](#6-поиск-материалов-в-базе-данных-по-частичному-совпадению-их-partnumber)
  

3. [API Endpoints для управления регулирующими актами](#our-api-endpoints-for-managing-regulatory)
   - [Получение всех регулирующих актов](#1-получение-всех-регулирующих-актов)
   - [Получение конкретного регулирующего акта по ID](#2-получение-конкретного-регулирующего-акта-по-id)
   - [Добавление нового регулирующего акта](#3-добавление-нового-регулирующего-акта)
   - [Изменение регулирующего акта](#4-обновление-существующего-регулирующего-акта)
   - [Удаление регулирующего акта](#5-удаление-регулирующего-акта)
   - [Поиск регулирующих актов по частичному совпадению их названия ](#6-поиск-регулирующих-актов-по-частичному-совпадению-их-названия)


4. [API Endpoints для управления поставщиками](#our-api-endpoints-for-managing-suppliers)
   - [Получение всех поставщиков](#1-получение-всех-поставщиков)
   - [Получение конкретного поставщика по ID](#2-получение-конкретного-поставщика-по-ID)
   - [Поиск поставщиков в базе данных по частичному совпадению их имени](#3-поиск-поставщиков-в-базе-данных-по-частичному-совпадению-их-имени)  
   - [Добавление нового поставщика](#4-добавление-нового-поставщика)
   - [Изменение существующего в базе данных поставщика](#5-изменение-существующего-в-базе-данных-поставщика)
   - [Удаление поставщика](#6-удаление-поставщика)

5. [API Endpoints для управления документами](#our-api-endpoints-for-managing-documents)
   - [Создание нового документа](#1-создание-нового-документа)
   - [Получение документов по ID материала и ID регулирующего акта](#2-получение-документов-по-id-материала-и-id-регулирующего-акта)


 _________________________________________

#### Our API Endpoints for User registration, login, and logout

| Method             | URL                                      | Description                              |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| `POST`             | `/signup`                                | Register a New User in the System.       |
| `POST`             | `/login`                                 | Login an existing user in the system.    |
| `POST`             | `/logout`                                | logout an existing user in the system.   |

_________________________________________

#### 1. Регистрация нового пользователя

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

#### 2. Логинизация нового пользователя  
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
            "_id": "66dafb73650231bfa7339411",
            "email": "test@gmail.com",
            "role": "employee"
        },
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY2ZGFmYjczNjUwMjMxYmZhNzMzOTQxMSIsImlhdCI6MTcyNjE2Nzk2OSwiZXhwIjoxNzI2MTg5NTY5fQ.6rfL7BX0y63k3_gz2KQKJSqEIkIA4WgY6vlPaWQLg5g"
    }
}
```
Статусы ответов:

- **200 OK** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неправильный емейл или пароль

_________________________________________

#### 3. Логаут существующего пользователя  

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

#### 4. Проверка Tokena

    Метод: POST

URL: /token

Описание: Проверка токена на валидность и expired. Если токен проходит проверку, сервер отдает обьект юзера

Параметры запроса:  
*Добавить Bearer Token в headers при запросе*  
Body: пустое


Пример запроса:

**POST /token**
Content-Type: application/json

*Bearer Token*  
Body: пустое

Пример ответа:
```json
{
    "status": "success",
    "code": 200,
    "data": {
        "user": {
            "_id": "66dafb73650231bfa7339411",
            "username": "TestName",
            "role": "employee"
        }
    }
}
```
Статусы ответов:

- **200 OK** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неправильная подпись JWT-Token, token expired


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

#### 1. Получение всех матералов  

    Метод: GET

URL: /api/materials

Описание: Получение всех материалов, хранящихся в базе данных, с возможностью фильтрации и сортировки по различным полям.

Параметры запроса:  
*Добавить Bearer Token в headers при запросе*  
Body: пустое  

Параметры запроса:  
sortBy (необязательный) — поле для сортировки. Возможные значения: createdAt, supplier, partNumber, countryOfOrigin, status, regulatoryCompliance.  
sortOrder (необязательный) — порядок сортировки. Возможные значения: asc (по возрастанию) или desc (по убыванию). По умолчанию: asc.  
supplier (необязательный) — фильтрация по поставщику (по частичному совпадению).  
status (необязательный) — фильтрация по статусу материала (Active и т.д.).  
partNumber (необязательный) — фильтрация по частичному совпадению номера материала.  
countryOfOrigin (необязательный) — фильтрация по стране происхождения (по частичному совпадению).  
regulatoryCompliance (необязательный) — фильтрация по названию регуляторного акта (по частичному совпадению).  
complianceStatus (необязательный) — фильтрация по статусу соответствия регуляторным актам (comply, pending, does_not_comply, и т.д.).  
parentID (необязательный) — фильтрация по ID родительского материала.  
componentPartNumber (необязательный) — фильтрация по частичному совпадению номера компонента в текущем материале.    


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
            },
        "totalPages": 2,
        "currentPage": 1]}}
```
Статусы ответов:

- **200 OK** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неавторизованный юзер

_________________________________________

#### 2. Получение одного материала по ID  
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

#### 3. Добавление нового материала в базу данных

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

#### 4. Изменение существующего в базе данных материала

    Метод: PUT

URL: /api/materials/:id

Описание: Изменение свойств материала в базе данных.

Параметры запроса:  
*Добавить Bearer Token в headers при запросе*  

```json
{
  "partNumber": "W224100-021",  // (optional) Разрешена пустая строка или отсутствие поля
  "description": "20 mm Stopper, Igloo, Omniflex",  // (optional) Разрешена пустая строка или отсутствие поля
  "supplier": "",  // (optional) Разрешена пустая строка или отсутствие поля
  "supplierItemNumber": "",  // (optional) Разрешена пустая строка или отсутствие поля
  "parentID": null,  // (optional) Разрешено null или отсутствие поля
  "countryOfOrigin": "",  // (optional) Разрешена пустая строка или отсутствие поля
  "status": "Active",  // (optional) Разрешена пустая строка или отсутствие поля
  "BOMcomponent": "",  // (optional) Разрешена пустая строка или отсутствие поля
  "storagePath": "",  // (optional) Разрешена пустая строка или отсутствие поля
  "components": [],  // (optional) Массив может быть опущен или пустым (Но, если надо изменить какое-то поле внутри обьекта надо передавать весь обьект или обьекты со всеми полями и менять только то значение, которое нужно. Иначе, база данных удалит все остальные данные в обьекте)
  "regulatoryCompliance": []  // (optional) Массив может быть опущен или пустым (Но, если надо изменить какое-то поле внутри обьекта надо передавать весь обьект или обьекты со всеми полями и менять только то значение, которое нужно. Иначе, база данных удалит все остальные данные в обьекте)
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

#### 5. Удаление существующего в базе данных материала  

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


#### 6. Поиск материалов в базе данных по частичному совпадению их partNumber

    Метод: GET

URL: /api/materials/search

Описание: Получение всех материалов, partNumber которых частично совпадает с переданными данными.  
**Ответ ограничен 10 материалами для предотвращения перегрузки**

Параметры запроса:  
*Добавить Bearer Token в headers при запросе*  
В Params передать partNumber со значением  
Body: пустое

Пример запроса:

**GET /api/materials/search?partNumber=W00**

*Bearer Token*  
Params: partNumber=W00  
Body: пустое  

Пример ответа:
```json
{
    "status": "success",
    "code": 200,
    "data": [
        {
            "_id": "66d0764dd8bdd28e5e126fd8",
            "partNumber": "W001002B",
            "parentID": null,
            "description": "13MM STOPPER, 2 LEG LYO, BUTYL GRY, SILZD",
            "supplier": "DATWYLER",
            "supplierItemNumber": "110006195",
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
            "updatedAt": "2024-09-03T17:53:59.299Z"
        },
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
        }
    ]
}
```
Статусы ответов:

- **200 OK** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неавторизованный юзер
- **400 Bad request** — переданный параметр пустой

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
 
_________________________________________  


#### 6. Поиск регулирующих актов по частичному совпадению их названия 

- **Метод:** GET
- **URL:** `/api/regulatories/search`
- **Описание:** Находит регулирующие акты по частичному совпадению их названия
- **Требования:** Аутентификация пользователя
- **Пример запроса:**
  ```
  GET /api/regulatories/search?title=EU
  Authorization: Bearer <token>
  ```
- **Пример ответа:**

  ```json
  {
    "status": "success",
    "code": 200,
    "data": [
        {
            "_id": "66d74d37c32d0715a4ff7a7b",
            "title": "EU REACH",
            "description": "Regulation concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals",
            "createdAt": "2024-09-03T17:53:59.167Z",
            "updatedAt": "2024-09-05T16:17:13.589Z"
        },
        {
            "_id": "66eaf1bf90623cac72482436",
            "title": "EU RoHS",
            "description": "Restriction of Hazardous Substances in Electrical and Electronic Equipment (RoHS)",
            "createdAt": "2024-09-18T15:29:03.372Z",
            "updatedAt": "2024-09-18T15:29:03.372Z"
        }
    ]
  }
```   
```  
  
- **Статусы ответов:**
  - 200 OK — успешный запрос.
  - 401 Unauthorized — ошибка аутентификации.
  - 500 Internal Server Error — ошибка сервера.  
_________________________________________  



#### Our API endpoints for managing suppliers

| Method             | URL                                      | Description                              |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| `GET`              | `/api/suppliers`                         | Retrieve all suppliers.                  |
| `GET`              | `/api/suppliers/:id`                     | Retrieve supplier by id.                 |
| `POST`             | `/api/suppliers`                         | Create a new supplier.                   |
| `PUT`              | `/api/suppliers/:id`                     | Update supplier by id.                   |
| `DELETE`           | `/api/suppliers/:id`                     | Delete supplier by id.                   |

_________________________________________  

#### 1. Получение всех поставщиков

- **Метод:** GET
- **URL:** `/api/suppliers`
- **Описание:** Возвращает список всех поставщиков.
- **Требования:** Аутентификация пользователя.
- **Пример запроса:**
  ```
  GET /api/suppliers
  Authorization: Bearer <token>
  ```
- **Пример ответа:**
```json
 {
    "status": "success",
    "code": 200,
    "data": {
        "suppliers": [
            {
                "_id": "66e06c7a19dd65f3c2e41b7e",
                "name": "Datwyler",
                "contactPersons": [
                    {
                        "name": "Gail",
                        "email": "gail@datwyler.com",
                        "phone": "8567897623",
                        "position": "customer service",
                        "_id": "66e06c7a19dd65f3c2e41b7f"
                    }
                ],
                "email": "datwyler@datwyler.com",
                "factories": [],
                "licensesAndCertifications": [],
                "files": [],
                "createdAt": "2024-09-10T15:57:46.960Z",
                "updatedAt": "2024-09-10T15:57:46.960Z"
            }
        ],
        "totalPages": 1,
        "currentPage": 1
    }
}
```

- **Статусы ответов:**
  - 200 OK — успешный запрос.
  - 401 Unauthorized — ошибка аутентификации.
  - 500 Internal Server Error — ошибка сервера.  

_________________________________________


#### 2. Получение конкретного поставщика по ID

- **Метод:** GET
- **URL:** `/api/suppliers/:id`
- **Описание:** Возвращает данные конкретного поставщика по его ID.
- **Требования:** Аутентификация пользователя, корректный ID.
- **Пример запроса:**
  ```
  GET /api/suppliers/60f5c4463e85f20a545f57c3
  Authorization: Bearer <token>
  ```
- **Пример ответа:**
```json
{
    "status": "success",
    "code": 200,
    "data": {
        "supplier": {
            "_id": "66e06c7a19dd65f3c2e41b7e",
            "name": "Datwyler",
            "contactPersons": [
                {
                    "name": "Gail",
                    "email": "gail@datwyler.com",
                    "phone": "8567897623",
                    "position": "customer service",
                    "_id": "66e06c7a19dd65f3c2e41b7f"
                }
            ],
            "email": "datwyler@datwyler.com",
            "factories": [],
            "licensesAndCertifications": [],
            "files": []
        }
    }
}
```

- **Статусы ответов:**
  - 200 OK — успешный запрос.
  - 400 Bad Request — некорректный ID.
  - 401 Unauthorized — ошибка аутентификации.
  - 404 Not Found — Поставщик не найден.
  - 500 Internal Server Error — ошибка сервера.
 
_________________________________________  

#### 3. Поиск поставщиков в базе данных по частичному совпадению их имени

    Метод: GET

URL: /api/suppliers/search

Описание: Получение всех поставщиков, имя которых частично совпадает с переданными данными.  
**Ответ ограничен 10 поставщиками для предотвращения перегрузки**


Параметры запроса:  
*Добавить Bearer Token в headers при запросе*  
В Params передать name со значением  
Body: пустое

Пример запроса:

**GET /api/suppliers/search?name=dat**

*Bearer Token*  
Params: name=dat  
Body: пустое  

Пример ответа:
```json
{
    "status": "success",
    "code": 200,
    "data": [
        {
            "_id": "66e06c7a19dd65f3c2e41b7e",
            "name": "Datwyler",
            "contactPersons": [
                {
                    "name": "Gail",
                    "email": "gail@datwyler.com",
                    "phone": "8567897623",
                    "position": "customer service",
                    "_id": "66e06c7a19dd65f3c2e41b7f"
                }
            ],
            "email": "datwyler@datwyler.com",
            "factories": [],
            "licensesAndCertifications": [],
            "files": [],
            "createdAt": "2024-09-10T15:57:46.960Z",
            "updatedAt": "2024-09-10T15:57:46.960Z"
        }
    ]
}
```
Статусы ответов:

- **200 OK** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неавторизованный юзер
- **400 Bad request** — переданный параметр пустой

_________________________________________  

#### 4. Добавление нового поставщика 

- **Метод:** POST
- **URL:** `/api/suppliers`
- **Описание:** Создает нового поставщика в базе данных.
- **Требования:** Аутентификация пользователя, корректное тело запроса.
- **Пример запроса:**  

  GET /api/suppliers
  Authorization: Bearer <token>
```json
  {
    "name": "SupplierName", required()
    "contactPersons": [
        {
            "name": "John Doe", required()
            "email": "john.doe@example.com", required()
            "phone": "123456789", optional()
            "position": "Manager" optional()
        }
    ], optional()
    "email": "supplier@example.com", required()
    "phone": "987654321", optional()
    "website": "https://example.com", optional()
    "address": {
        "street": "123 Main St", optional()
        "city": "Somewhere", optional()
        "state": "SomeState", optional()
        "country": "CountryName", optional()
        "postalCode": "12345" optional()
    }, optional()
    "factories": [
        {
            "name": "Factory1", required()
            "location": {
                "street": "Factory St", optional()
                "city": "Factory City", optional()
                "state": "Factory State", optional()
                "country": "Factory Country", required()
                "postalCode": "54321" optional()
            },
            "productionCapacity": 5000, optional()
            "certifications": [
                "ISO9001",
                "ISO14001"
            ] optional()
        }
    ], optional()
    "licensesAndCertifications": [
        {
            "name": "CertificationName", required()
            "issueDate": "2022-01-01", optional()
            "expiryDate": "2023-01-01", optional()
            "issuingAuthority": "Certification Authority" optional()
        }
    ], optional()
    "files": [
        {
            "fileName": "file.pdf", required()
            "fileUrl": "https://example.com/file.pdf", optional()
            "uploadDate": "2023-01-01", optional()
            "uploadedBy": "User" optional()
        }
    ] optional()
}
```  
- **Пример ответа:**
```json
{
    "status": "success",
    "code": 201,
    "data": {
        "supplier": {
            "name": "SupplierName",
            "contactPersons": [
                {
                    "name": "John Doe",
                    "email": "john.doe@example.com",
                    "phone": "123456789",
                    "position": "Manager",
                    "_id": "66e45a4bcb052d6cee551f78"
                }
            ],
            "email": "supplier@example.com",
            "phone": "987654321",
            "website": "https://example.com",
            "address": {
                "street": "123 Main St",
                "city": "Somewhere",
                "state": "SomeState",
                "country": "CountryName",
                "postalCode": "12345"
            },
            "factories": [
                {
                    "name": "Factory1",
                    "location": {
                        "street": "Factory St",
                        "city": "Factory City",
                        "state": "Factory State",
                        "country": "Factory Country",
                        "postalCode": "54321"
                    },
                    "productionCapacity": 5000,
                    "certifications": [
                        "ISO9001",
                        "ISO14001"
                    ],
                    "_id": "66e45a4bcb052d6cee551f79"
                }
            ],
            "licensesAndCertifications": [
                {
                    "name": "CertificationName",
                    "issueDate": "2022-01-01T00:00:00.000Z",
                    "expiryDate": "2023-01-01T00:00:00.000Z",
                    "issuingAuthority": "Certification Authority",
                    "_id": "66e45a4bcb052d6cee551f7a"
                }
            ],
            "files": [
                {
                    "fileName": "file.pdf",
                    "fileUrl": "https://example.com/file.pdf",
                    "uploadDate": "2023-01-01T00:00:00.000Z",
                    "uploadedBy": "User",
                    "_id": "66e45a4bcb052d6cee551f7b"
                }
            ],
            "_id": "66e45a4bcb052d6cee551f77",
            "createdAt": "2024-09-13T15:29:15.291Z",
            "updatedAt": "2024-09-13T15:29:15.291Z"
        }
    }
}
```

- **Статусы ответов:**
- **201 Created** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — неавторизованный юзер
- **409 Conflict** — поставщик с таким именем уже есть в базе данных
 
_________________________________________  


#### 5. Изменение существующего в базе данных поставщика

    Метод: PUT

URL: /api/suppliers/:id

Описание: Изменение свойств поставщика в базе данных.

Параметры запроса:  
*Добавить Bearer Token в headers при запросе*  

Пример запроса:

**PUT /api/suppliers/:id**

*Bearer Token*  
```json
{
    "name": "Amcor", optional()
    "contactPersons": [
        {
            "name": "John Doe", optional()
            "email": "john.doe@example.com", optional()
            "phone": "123456789", optional()
            "position": "Manager" optional()
        }
    ], optional()
    "email": "supplier@example.com", optional()
    "phone": "987654321", optional()
    "website": "https://example.com", optional()
    "address": {
        "street": "123 Main St", optional()
        "city": "Somewhere", optional()
        "state": "SomeState", optional()
        "country": "CountryName", optional()
        "postalCode": "12345" optional()
    }, optional()
    "factories": [
        {
            "name": "Factory1", optional()
            "location": {
                "street": "Factory St", optional()
                "city": "Factory City", optional()
                "state": "Factory State", optional()
                "country": "Factory Country", optional()
                "postalCode": "54321" optional()
            }, optional()
            "productionCapacity": 5000, optional()
            "certifications": [
                "ISO9001",
                "ISO14001"
            ] optional()
        }
    ],
    "licensesAndCertifications": [
        {
            "name": "CertificationName", optional()
            "issueDate": "2022-01-01", optional()
            "expiryDate": "2023-01-01", optional()
            "issuingAuthority": "Certification Authority" optional()
        }
    ],
    "files": [
        {
            "fileName": "file.pdf", optional()
            "fileUrl": "https://example.com/file.pdf", optional()
            "uploadDate": "2023-01-01", optional()
            "uploadedBy": "User" optional()
        } 
    ] optional()
}
```

Пример ответа:
```json
{
    "status": "success",
    "code": 200,
    "data": {
        "supplier": {
            "address": {
                "street": "123 Main St",
                "city": "Somewhere",
                "state": "SomeState",
                "country": "CountryName",
                "postalCode": "12345"
            },
            "_id": "66e45a4bcb052d6cee551f77",
            "name": "Amcor",
            "contactPersons": [
                {
                    "name": "John Doe",
                    "email": "john.doe@example.com",
                    "phone": "123456789",
                    "position": "Manager",
                    "_id": "66e45a4bcb052d6cee551f78"
                }
            ],
            "email": "supplier@example.com",
            "phone": "987654321",
            "website": "https://example.com",
            "factories": [
                {
                    "location": {
                        "street": "Factory St",
                        "city": "Factory City",
                        "state": "Factory State",
                        "country": "Factory Country",
                        "postalCode": "54321"
                    },
                    "name": "Factory1",
                    "productionCapacity": 5000,
                    "certifications": [
                        "ISO9001",
                        "ISO14001"
                    ],
                    "_id": "66e45a4bcb052d6cee551f79"
                }
            ],
            "licensesAndCertifications": [
                {
                    "name": "CertificationName",
                    "issueDate": "2022-01-01T00:00:00.000Z",
                    "expiryDate": "2023-01-01T00:00:00.000Z",
                    "issuingAuthority": "Certification Authority",
                    "_id": "66e45a4bcb052d6cee551f7a"
                }
            ],
            "files": [
                {
                    "fileName": "file.pdf",
                    "fileUrl": "https://example.com/file.pdf",
                    "uploadDate": "2023-01-01T00:00:00.000Z",
                    "uploadedBy": "User",
                    "_id": "66e45a4bcb052d6cee551f7b"
                }
            ],
            "createdAt": "2024-09-13T15:29:15.291Z",
            "updatedAt": "2024-09-13T15:42:45.536Z"
        }
    }
}
```
Статусы ответов:

- **200 OK** — успешный запрос
- **500 Internal Server Error** — ошибка сервера
- **401 Unauthorized** — Неавторизованный юзер
_________________________________________


#### 6. Удаление поставщика

- **Метод:** DELETE
- **URL:** `/api/suppliers/:id`
- **Описание:** Удаляет поставщика по ID.
- **Требования:** Аутентификация пользователя, корректный ID.
- **Пример запроса:**
  ```
  DELETE /api/suppliers/60f5c4463e85f20a545f57c3
  Authorization: Bearer <token>
  ```
- **Пример ответа:**

```json
{
    "status": "success",
    "code": 200,
    "message": "Supplier deleted successfully",
    "data": {
        "deletedSupplier": {
            "_id": "66e06c7a19dd65f3c2e41b7e",
            "name": "Datwyler",
            "contactPersons": [
                {
                    "name": "Gail",
                    "email": "gail@datwyler.com",
                    "phone": "8567897623",
                    "position": "customer service",
                    "_id": "66e06c7a19dd65f3c2e41b7f"
                }
            ],
            "email": "datwyler@datwyler.com",
            "factories": [],
            "licensesAndCertifications": [],
            "files": [],
            "createdAt": "2024-09-10T15:57:46.960Z",
            "updatedAt": "2024-09-10T15:57:46.960Z"
        }
    }
}
```  

- **Статусы ответов:**
  - 200 OK — поставщик успешно удален.
  - 400 Bad Request — неверный ID.
  - 401 Unauthorized — ошибка аутентификации.
  - 404 Not Found — поставщик не найден.
  - 500 Internal Server Error — ошибка сервера.
 
_________________________________________    


#### Our API Endpoints for managing documents

| Method             | URL                                      | Description                              |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| `POST`             | `/api/documents`                         | Create a new document.                   |
| `GET`              | `/api/documents/`                        | Retrieve docs by mater. and regul. ID    |



_________________________________________

#### 1. Создание нового документа

- **Метод:** POST
- **URL:** `/api/documents`
- **Описание:** Создание нового документа, связанного с отдельными материалами или всеми материалами поставщика. Позволяет добавлять документ и обновлять статус соответствия регулирующим актам для материалов.
- **Требования:** Аутентификация пользователя, корректный ID материалов, или поставщика.
- **Параметры запроса:**  
  POST /api/documents  
  Authorization: Bearer <token>  
  ```{
  {
  "title": "Document Title", (required)  
  "fileUrl": "https://example.com/document.pdf", (required, must be a valid URI)  
  "materialIds": ["605c4463e85f20a545f57c3"], (optional, must be valid MongoDB ObjectIds)  
  "supplierId": "605c4463e85f20a545f57c2", (optional, must be a valid MongoDB ObjectId)  
  "type": "certificate", (optional, default="other")  
  "version": 1, (optional, default=1, must be at least 1)  
  "applyToAllSupplierMaterials": false, (optional, default=false, must be a boolean)  
  "regulationId": "605c4463e85f20a545f57c1", (required, must be a valid MongoDB ObjectId)  
  "status": "comply", (required, must be one of [comply, does_not_comply, pending, na, comply_with_exceptions])  
  "attachments": ["https://example.com/attachment.pdf"], (optional, must be valid URIs)  
  "effectiveDate": "2024-01-01", (optional, must be a valid date)  
  "expiryDate": "2025-01-01", (optional, must be a valid date)  
  "documentNumber": "DOC12345", (optional)  
  "description": "Description of the document", (optional)  
  "category": "technical", (optional, default="other", must be one of [legal, technical, environmental, other])  
  "notes": "Additional notes about the document", (optional)
  }  


- **Пример запроса:**  
  ```{
  "title": "RoHS Compliance Certificate",
  "fileUrl": "https://example.com/rohstest.pdf",
  "materialIds": ["66fe9a2b4a190e6bc19092c6"],
  "type": "certificate",
  "regulationId": "66eaf1bf90623cac72482436",
  "status": "comply",
  "documentNumber": "CERT123",
  "effectiveDate": "2024-01-01",
  "expiryDate": "2025-01-01"
}```  
  
- **Пример ответа:**  
  ```{
    "status": "success",
    "code": 201,
    "data": {
        "document": {
            "title": "RoHS Compliance Certificate",
            "fileUrl": "https://example.com/rohstest.pdf",
            "attachments": [],
            "materialIds": ["66fe9a2b4a190e6bc19092c6"],
            "supplierId": null,
            "regulationId": "66eaf1bf90623cac72482436",
            "applyToAllSupplierMaterials": false,
            "type": "other",
            "status": "does_not_comply",
            "effectiveDate": null,
            "expiryDate": null,
            "documentNumber": "",
            "description": "",
            "category": "other",
            "notes": "",
            "version": 1,
            "_id": "6719086e4bcecac31e425d15",
            "createdAt": "2024-10-23T14:30:06.796Z",
            "updatedAt": "2024-10-23T14:30:06.796Z"
        }
    }
}``` 
  
- Проверяет наличие документа с тем же fileUrl, чтобы избежать дубликатов.
- Обновляет поле regulatoryCompliance для материалов, указанных в materialIds. Если передано поле applyToAllSupplierMaterials и supplierId, обновляет все материалы, принадлежащие указанному поставщику.

- **Статусы ответов:**
  - 201 OK — документ успешно создан.
  - 400 Bad Request — неверный формат данных.
  - 401 Unauthorized — ошибка аутентификации.
  - 404 Not Found — указанный регуляторный акт или поставщик не найден.
  - 409 Conflict — документ с таким fileUrl уже существует.
  - 500 Internal Server Error — ошибка сервера.
 

#### 2. Получение документов по ID материала и ID регулирующего акта

- **Метод:** GET
- **URL:** `/api/documents`
- **Описание:** Возвращает список всех документов, связанных с указанным материалом и регулирующим актом.
- **Требования:** Аутентификация пользователя, корректные ID.
- **Параметры запроса:**  
  GET /api/documents  
  Authorization: Bearer <token>  

- **Пример запроса:**  
  ```{
    "materialId": "66db21db99e34d46664ba7c1",
    "regulationId": "670fed898818777806d4dee5"


- **Пример ответа:**  
  ```{
    "status": "success",
    "code": 200,
    "data": {
        "documents": [
            {
                "_id": "670fff83810aac932ef4e2fd",
                "title": "PFAS-free statement",
                "fileUrl": "https://example.com/pfas_free_statement.pdf",
                "attachments": [],
                "materialIds": [
                    "66db21db99e34d46664ba7c1",
                    "66eaf13facd6438f4657585c",
                    "66eaf31890623cac72482441"
                ],
                "supplierId": "66eaf850a6c5520535b3a0e6",
                "regulationId": "670fed898818777806d4dee5",
                "applyToAllSupplierMaterials": true,
                "type": "other",
                "status": "comply",
                "effectiveDate": null,
                "expiryDate": null,
                "documentNumber": "",
                "description": "",
                "category": "other",
                "notes": "",
                "version": 1,
                "createdAt": "2024-10-16T18:01:39.839Z",
                "updatedAt": "2024-10-16T18:01:39.839Z"
            },
            {
                "_id": "6712c7636165a5c3d2ff679b",
                "title": "pfas_statement",
                "fileUrl": "https://example.com/teasaqasqwsaassaasstas.pdf",
                "attachments": [],
                "materialIds": [
                    "66db21db99e34d46664ba7c1"
                ],
                "supplierId": null,
                "regulationId": "670fed898818777806d4dee5",
                "applyToAllSupplierMaterials": false,
                "type": "other",
                "status": "comply",
                "effectiveDate": null,
                "expiryDate": null,
                "documentNumber": "",
                "description": "",
                "category": "other",
                "notes": "",
                "version": 1,
                "createdAt": "2024-10-18T20:38:59.045Z",
                "updatedAt": "2024-10-18T20:38:59.045Z"
            }
        ]
    }

- **Статусы ответов:**  

200 OK — успешный запрос.  
400 Bad Request — некорректный ID материала или акта.  
401 Unauthorized — ошибка аутентификации.  
404 Not Found — документы не найдены.  
500 Internal Server Error — ошибка сервера.  
