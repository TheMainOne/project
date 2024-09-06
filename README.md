1. Регистрация нового пользователя < br / > 
Метод: POST < br / > 
URL: /register < br / > 
Описание: Регистрирует нового пользователя в системе < br / > 
Параметры запроса: json-файл с полями "email" (required), "password" (required), "name" (required), "role" ["employee", "admin", "manager"] (optional, default = employee) < br / > 
Пример запроса: < br / >
POST /register
Content-Type: application/json
{
"email": "test@gmail.com",
"password": "test",
"name": "TestName"
} < br / >
Пример ответа: < br / >
{
    "status": "success",
    "code": 201,
    "data": {
        "user": {
            "id": "66dafb73650231bfa7339411",
            "name": "TestName",
            "email": "test@gmail.com",
            "role": "employee"
        }
    }
}
Статусы ответов: < br / >
201 Created — успешный запрос.
500 Internal Server Error — ошибка сервера.
409 Conflict - юзер, с таким емейлом или именем уже есть

#### Our API endpoints for managing materials

| Method             | URL                                      | Description                              |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| `GET`              | `/api/materials`                         | Retrieve all materials.                  |
| `GET`              | `/api/materials/:id`                     | Retrieve material by id.                 |
| `POST`             | `/api/materials`                         | Create a new material.                   |
| `PUT`              | `/api/materials/:id`                     | Update material by id.                   |
| `DELETE`           | `/api/materials/:id`                     | Delete material by id.                   |
