# WebSocket Authentication

## Угроза

До этого фикса WebSocket-эндпоинт `/chat/{user_id}` принимал `user_id` прямо из URL и **не проверял токен**. Любой человек, знающий чужой числовой `user_id`, мог:

1. Подключиться к серверу как этот пользователь — `wss://wsnox.example/chat/42`
2. Отправлять сообщения от его имени (поле `sender_id` бралось из того же URL)
3. Получать сообщения, адресованные ему — Redis pub/sub доставлял payload по `recipient_id`

Дополнительно, `recipient_id` бралcя из клиентского payload без проверки членства в чате: можно было отправить сообщение в произвольный чат на произвольный `recipient_id`, и оно сохранялось в БД.

## Решение

### Auth-first-message pattern

Браузерный `WebSocket` API не позволяет ставить кастомные заголовки (нет `Authorization: Bearer`). Распространённое решение — токен в query-параметре — оставляет JWT в access-логах uvicorn и в истории браузера. Поэтому выбрана схема "auth в первом сообщении":

1. Клиент открывает `wss://.../chat` без всяких параметров
2. Сервер делает `accept()`, ставит таймаут 10 секунд
3. Клиент сразу шлёт `{"type": "auth", "token": "<JWT>"}`
4. Сервер декодирует JWT через `get_user_from_token` (та же логика, что и для HTTP), достаёт `User` из БД
5. Если что-то не так — `close(code=4401)`, соединение разрывается
6. Если ОК — сервер отвечает `{"type": "auth_ok", "user_id": ...}`, клиент ставит `isConnected = true`

### Authorization в обработке сообщений

Раньше клиент сам сообщал серверу `sender_id` (через URL) и `recipient_id` (через payload). Теперь оба значения сервер **выводит сам**:

- `sender_id` = authenticated `user_id` из токена
- `recipient_id` = из `chat_members` по `chat_id` (через `ChatCRUD.get_other_user_by_chat_id`)
- Перед отправкой — `is_chat_member(chat_id, sender_id)`: если пользователь не в чате, сообщение игнорируется

Поле `recipient_id` в клиентском payload теперь полностью игнорируется (можно удалить из протокола в будущем).

## Что это закрывает

- **Импersonation:** нельзя отправить сообщение под чужим `sender_id` — он берётся из подписанного JWT
- **Чтение чужих сообщений:** нельзя получать сообщения для чужого `recipient_id` — соединение хранится в `active_connections[authenticated_user_id]`
- **Cross-chat injection:** нельзя писать в чужой чат — проверка `is_chat_member`
- **Misdirected delivery:** нельзя написать сообщение пользователю, не состоящему в указанном чате — recipient выводится из БД

## Что НЕ закрывает (известные риски)

- **XSS → кража токена.** Токен лежит в `localStorage`, доступен любому исполняющемуся на странице JS. Защита — CSP, экранирование пользовательских данных (React делает это по умолчанию, но не для `dangerouslySetInnerHTML`).
- **Replay через утечку JWT.** Токены валидны 30 дней (access) и 7 дней (refresh). Если токен утёк — обратной отмены нет. TODO: blacklist/rotation.
- **Token leakage в логах.** Токен теперь не в URL, но он в теле первого WS-сообщения. По умолчанию uvicorn не логирует тела фреймов — но если кто-то включит DEBUG-логирование WS-трафика, токен попадёт в логи. Не включать.
- **DoS через долгие неаутентифицированные коннекты.** Таймаут авторизации — 10 секунд. Можно открыть тысячу соединений и держать их 10 сек. Лимит коннектов на IP не реализован.
- **Heartbeat / dead connection cleanup.** Нет ping/pong — мёртвые соединения висят, пока TCP сам не отвалится.

## Коды закрытия

- `4401` — auth failed (custom 4xxx code, по аналогии с HTTP 401)

## Файлы

- `src/messenger/backend/app/ws/router.py` — WS handler
- `src/messenger/backend/app/api_v1/auth/dependencies.py` — `get_user_from_token`
- `src/messenger/frontend_react/src/hooks/useChatSocket.js` — клиент
