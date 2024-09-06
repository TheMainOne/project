#### Our API Endpoints for User registration, login, and logout

| Method             | URL                                      | Description                              |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| `POST`             | `/signup`                                | Register a New User in the System.       |
| `POST`             | `/login`                                 | Login an existing user in the system.    |
| `POST`             | `/logout`                                | logout an existing user in the system.   |

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

**POST /register**
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

201 Created — успешный запрос
500 Internal Server Error — ошибка сервера
409 Conflict — юзер с таким email или именем уже существует

   
#### Our API endpoints for managing materials

| Method             | URL                                      | Description                              |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| `GET`              | `/api/materials`                         | Retrieve all materials.                  |
| `GET`              | `/api/materials/:id`                     | Retrieve material by id.                 |
| `POST`             | `/api/materials`                         | Create a new material.                   |
| `PUT`              | `/api/materials/:id`                     | Update material by id.                   |
| `DELETE`           | `/api/materials/:id`                     | Delete material by id.                   |


#### Our API endpoints for managing regulatory

| Method             | URL                                      | Description                              |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| `GET`              | `/api/regulatories`                      | Retrieve all regulatories.               |
| `GET`              | `/api/regulatories/:id`                  | Retrieve regulation by id.               |
| `POST`             | `/api/regulatories`                      | Create a new regulation.                 |
| `PUT`              | `/api/regulatories/:id`                  | Update regulation by id.                 |
| `DELETE`           | `/api/regulatories/:id`                  | Delete regulation by id.                 |

