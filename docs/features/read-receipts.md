# Отметки о прочтении

Точка под исходящим сообщением — индикатор статуса. Каждый может выключить функцию у себя; правило взаимности: **если хоть у одного из собеседников выключено — индикатор не показывается ни одной из сторон**.

## UX

Точка только под `outgoing`-сообщениями (под чужими ничего). Цвета выбраны так, чтобы хорошо читаться на ярко-салатовом `bg-lime-400` outgoing-bubble:

- ⚫ `bg-zinc-900` — прочитано (есть `read_at`), полная непрозрачность
- 🌑 `bg-zinc-900/40` — доставлено, ждёт прочтения, полупрозрачная
- Если функция выключена у тебя или у партнёра — точки нет совсем

## Поток событий

У получателя есть **два пути** отметить сообщения как прочитанные — оба заканчиваются одинаковой пуб-публикацией в Redis, поэтому отправитель видит обновление в реальном времени независимо от того, как именно был открыт чат.

```
                       ┌──────────────────────────────────────────────┐
[B открывает чат      │  HTTP GET /chats/{id}/messages               │
 первый раз / поднимает├─→ MessageCRUD.mark_as_read()                 │
 экран после push]    │  └─ read_at пишется в БД                     │
                       │     └─ publish_read_receipt(...)             │
                       └──────────────────────────────────────────────┘
                                            ↓
                       ┌──────────────────────────────────────────────┐
[B в активном чате,   │  WS → {type: "message_read", last_message_id} │
 пришло новое сообщ.] ├─→ MessageCRUD.mark_as_read_up_to()            │
                       │  └─ read_at пишется в БД                     │
                       │     └─ publish_read_receipt(...)             │
                       └──────────────────────────────────────────────┘
                                            ↓
                       publish_read_receipt(db, chat_id, reader_id, max_id):
                         if should_expose_read_receipts(A, B):
                           Redis pub → "chat_messages:read_receipts"
                                ↓
                         read_receipts_listener (lifespan task)
                                ↓
                         WS → {type: "messages_read", chat_id,
                                up_to_message_id, read_at, reader_id} → A
                                ↓
                         useChatSocket: setMessages(map) — outgoing где
                          msg.created_at <= read_at && !msg.read_at
                                ↓
                         MessageList перерисовывает дот тёмным
```

Ключевые идеи:

- **`read_at` пишется в БД всегда** (на будущее, для статистики, для повторного включения функции). А **наружу его никто не видит**, пока хоть один из собеседников выключил флаг. Один gate-метод `should_expose_read_receipts(user_a, user_b)` проверяется во всех точках выдачи.
- **Один helper `publish_read_receipt`** в `ws/router.py` (reciprocity-check внутри) вызывается из всех трёх mark-as-read путей: WS `message_read`, HTTP `GET /messages`, HTTP `POST /read`. Без этого HTTP-путь (первое открытие чата) обновлял БД, но не доставлял событие отправителю — точка темнела только после refresh.

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

**Клиент → сервер** (только при WS-пути; HTTP-путь триггерится через `GET /chats/{id}/messages` или `POST /chats/{id}/read`):
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

- На фронте локально отправленные сообщения получают `id: Date.now()` (placeholder), потому что DB id возвращается только при перезагрузке истории. Поэтому `useChatSocket` сверяет прочтение **по `created_at`**, а не по `id` — иначе сравнение `Date.now() <= small_int` всегда даёт `false` и точки никогда не тёмнеют.
- Сервер при выключении флага шлёт `profile_update` с `read_receipts_enabled: false` — фронт собеседника сам должен спрятать существующие тёмные точки.
- **Дубль-доставка возможна и нормальна.** При получении нового сообщения в активный чат фронт зовёт `markChatAsRead` (HTTP) **и** шлёт WS `message_read` — поэтому отправитель может получить два кадра `messages_read` подряд. Хэндлер идемпотентен: фильтр `!msg.read_at` отсекает повторное обновление.

## Файлы

| Слой | Где |
|------|-----|
| Backend — модель | `src/messenger/backend/models/profile.py` (`read_receipts_enabled`), `models/message.py` (`read_at`) |
| Backend — gate | `app/crud/notification.py` (`should_expose_read_receipts`, `set_read_receipts_enabled`) |
| Backend — публикация | `app/ws/router.py` — helper `publish_read_receipt` + `read_receipts_listener` + WS `message_read` handler |
| Backend — HTTP-пути | `app/api_v1/routers/chat_router.py` — `GET /chats/{id}/messages`, `POST /chats/{id}/read` (зовут helper) |
| Backend — API настроек | `app/api_v1/routers/notification_router.py` |
| Frontend — индикатор | `components/chat/MessageList.jsx` |
| Frontend — приём | `hooks/useChatSocket.js` (ветка `messages_read`) |
| Frontend — отправка | `pages/chat/ChatPage.jsx` (HTTP `markChatAsRead` + WS `message_read`) |
| Миграция | `alembic/versions/e3a8f1b2c4d5_*.py` |

## Тесты

- `tests/test_read_receipts.py` — gate-логика, взаимность, write `read_at`, утечка через API
