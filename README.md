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
            }]
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

