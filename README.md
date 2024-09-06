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

#### Tips on what NOT to do

Hopefully you’re already aware of this. But not at any given time should your endpoint end with `.json`, `.xml` or `.something`. If in doubt, reach out to one of the backend developers at Nodes.

| Method   | URL                                      | Description                              |
| -------- | ---------------------------------------- | ---------------------------------------- |
| `GET`    | `/api/posts`                             | Retrieve all posts.                      |
| `POST`   | `/api/posts`                             | Create a new post.                       |
| `GET`    | `/api/posts/28`                          | Retrieve post #28.                       |
| `PATCH`  | `/api/posts/28`                          | Update data in post #28.                 |
| `POST`   | `/api/posts/28/comments`                 | Add comment to post #28.                 |
| `GET`    | `/api/posts/28/comments?status=approved&limit=10&page=4` | Retrieve page 4 of the comments for post #28 which are approved, with 10 comments per page. |
| `DELETE` | `/api/posts/28/comments/1987` or `/api/comments/1987` | Delete comment #1987.                    |
| `GET`    | `/api/users?active=true&sort=username&direction=asc&search=nodes` | Search for "nodes" in active users, sorted  by username ascendingly. |
