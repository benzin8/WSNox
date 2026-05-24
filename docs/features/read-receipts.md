# Отметки о прочтении

Серая точка под исходящим сообщением — доставлено, зелёная — прочитано. Каждый может выключить функцию у себя; правило взаимности: **если хоть у одного из собеседников выключено — индикатор не показывается ни одной из сторон**.

## UX

- Точка только под `outgoing`-сообщениями (под чужими ничего)
- 🩶 `bg-zinc-500` — доставлено, ждёт прочтения
- 🟢 `bg-lime-400` — прочитано (есть `read_at`)
- Если функция выключена у тебя или у партнёра — точки нет совсем

## Поток событий

```
[B открывает чат]
  └─ WS → {type: "message_read", chat_id, last_message_id}
        └─ backend:
             ├─ MessageCRUD.mark_as_read_up_to(...)  ← read_at пишется ВСЕГДА
             └─ if should_expose_read_receipts(A, B):
                  └─ Redis pub → "chat_messages:read_receipts"
                       └─ read_receipts_listener
                            └─ WS → {type: "messages_read", chat_id, up_to_message_id, read_at} → A
                                 └─ useChatSocket помечает outgoing msg.read_at
                                      └─ MessageList перерисовывает дот зелёным
```

Ключевая идея: **`read_at` пишется в БД всегда** (на будущее, для статистики, для повторного включения функции). А вот **наружу его никто не видит**, пока хоть один из собеседников выключил флаг. Один gate-метод `should_expose_read_receipts(user_a, user_b)` проверяется во всех точках выдачи (WS-броадкаст, история сообщений).

## Настройка

| Поле БД | Тип | Дефолт |
|---------|-----|--------|
| `profiles.read_receipts_enabled` | `bool` | `true` |

Меняется через `PUT /api/v1/notifications/read-receipts {enabled: bool}` — после этого бэк публикует `profile_update` событие в Redis, и фронт собеседника моментально перерисовывается.

## API

| Метод | Путь | Описание |
|-------|------|----------|
| PUT | `/api/v1/notifications/read-receipts` | `{enabled: bool}` |
| GET | `/api/v1/notifications/preferences` | возвращает `read_receipts_enabled` среди других флагов |

## WebSocket

**Клиент → сервер:**
```json
{ "type": "message_read", "chat_id": 7, "last_message_id": 42 }
```
Шлётся при фокусе на чате (`document.hidden === false`) и при поступлении нового сообщения в активный чат.

**Сервер → клиент** (только если оба `read_receipts_enabled`):
```json
{
  "type": "messages_read",
  "chat_id": 7,
  "up_to_message_id": 42,
  "read_at": "2026-05-24T11:30:00Z",
  "reader_id": 17
}
```

## Тонкости реализации

- На фронте локально отправленные сообщения получают `id: Date.now()` (placeholder), потому что DB id возвращается только при перезагрузке истории. Поэтому `useChatSocket` сверяет прочтение **по `created_at`**, а не по `id` — иначе сравнение `Date.now() <= small_int` всегда даёт `false` и точки никогда не зеленеют.
- Сервер при выключении флага шлёт `profile_update` с `read_receipts_enabled: false` — фронт собеседника сам должен спрятать существующие зелёные точки.

## Файлы

| Слой | Где |
|------|-----|
| Backend — модель | `src/messenger/backend/models/profile.py` (`read_receipts_enabled`), `models/message.py` (`read_at`) |
| Backend — gate | `app/crud/notification.py` (`should_expose_read_receipts`, `set_read_receipts_enabled`) |
| Backend — WS | `app/ws/router.py` (`message_read` handler + `read_receipts_listener`) |
| Backend — API | `app/api_v1/routers/notification_router.py` |
| Frontend — индикатор | `components/chat/MessageList.jsx` |
| Frontend — приём | `hooks/useChatSocket.js` (ветка `messages_read`) |
| Frontend — отправка | `pages/chat/ChatPage.jsx` |
| Миграция | `alembic/versions/e3a8f1b2c4d5_*.py` |

## Тесты

- `tests/test_read_receipts.py` — gate-логика, взаимность, write `read_at`, утечка через API
