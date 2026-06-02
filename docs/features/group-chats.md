# Групповые чаты (MVP)

Чат с тремя и более участниками. Пакет MVP: создание, отправка/приём текста и медиа, добавление участников, выход, удаление группы создателем.

См. **[group-chats-roadmap.md](./group-chats-roadmap.md)** для следующих итераций (`@mentions`, per-user read receipts, переименование, аватар группы, и пр.).

## Что входит в MVP

| Возможность | Где |
|------|------|
| Создание группы с произвольным набором контактов | `CreateGroupModal.jsx`, `POST /chats/group` |
| Отправка текста в группу с fan-out по всем участникам | `ws/router.py` — `_resolve_recipient_ids`, `pubsub_listener` |
| Отправка фото/видео в группу | `POST /chats/{id}/media` (общий с private) + `publish_media_message(chat_type="group")` |
| Имя автора над чужими сообщениями в группе (с цветом по `sender_id`) | `MessageList.jsx` — `showSenderName`, `senderColour()` |
| Аватар-инициалы группы с детерминированным цветом по `chat.id` | `GroupAvatar.jsx` |
| Превью `Иван: текст` в списке чатов | `ChatList.jsx` |
| Кол-во участников в шапке | `ChatWindow.jsx` |
| Клик по шапке → модалка с участниками | `GroupInfoModal.jsx` |
| Добавление участника (только админ) | `POST /chats/{id}/members` |
| Выход из группы (любой участник) | `POST /chats/{id}/leave` |
| Удаление группы (только админ-создатель) | `DELETE /chats/{id}` |
| Push-уведомления каждому участнику с учётом `mute`/`DND`/`viewing_chat` | `pubsub_listener` — итерация `recipient_ids` |
| Реалтайм-обновление списка чатов при `group_created`/`group_members_added`/`group_deleted` | `chat_events_listener` (Redis канал `chat_messages:chat_events`) |

## Архитектура

### Данные

```text
chats(id, chat_type, name, created_at, updated_at)
  └── chat_type ∈ {"private", "group"}

chat_members(chat_id, user_id, role, joined_at)
  └── role ∈ {"admin", "member"}
       — для group: создатель = admin, остальные = member
       — для private: оба = admin (исторически)

message(id, chat_id, sender_id, recipient_id?, encrypted_data, msg_type, ...)
  └── recipient_id NULL для group, заполнен для private

message_read(message_id, user_id, read_at)
  └── зарезервировано под "seen by N/M" в группах (пока не используется)
```

Миграция `a1c4f7d92e58_group_chats_recipient_nullable_and_message_read.py`:
1. `ALTER TABLE message ALTER COLUMN recipient_id DROP NOT NULL`
2. `CREATE TABLE message_read` с PK `(message_id, user_id)` и каскадом удаления.

### Fan-out сообщений

```text
Sender WS → POST text                   Sender HTTP → POST /chats/{id}/media
    │                                       │
    ▼                                       ▼
manager.send_personal_message()      publish_media_message()
    │                                       │
    └────────── _resolve_recipient_ids ─────┘
                  │
       private → [recipient_id]
       group   → ChatCRUD.get_member_ids(chat_id) минус sender
                  │
                  ▼
       redis.publish(REDIS_CHAT_CHANNEL, { recipient_ids: [..], ... })
                  │
                  ▼
   ConnectionManager.pubsub_listener — итерирует recipient_ids,
   отправляет в WS каждому подключённому или планирует push.
```

`recipient_id` (single) остался в payload для обратной совместимости со старыми клиентами; новые клиенты читают `recipient_ids` (list).

### Lifecycle-события

Отдельный pubsub-канал `chat_messages:chat_events`. Поддерживаемые типы:

- `group_created` — после `POST /chats/group`
- `group_members_added` — после `POST /chats/{id}/members`
- `group_member_left` — после `POST /chats/{id}/leave`
- `group_deleted` — после `DELETE /chats/{id}`

Каждый payload содержит `member_ids: [int]` — листенер делает fanout только указанным юзерам, чтобы посторонние не получали уведомлений.

### Read receipts в группах

В MVP **выключены полностью**. `publish_read_receipt` для `chat_type == "group"` ранний выход. `GET /chats/{id}/messages` для группы не выставляет `read_at` в ответе. Таблица `message_read` создана заранее под итерацию «seen by N» (см. roadmap).

## Безопасность и проверки

- Создание группы: `name.strip()` обрезается до 100 символов; пустое имя → 400.
- Все `member_ids` в `/chats/group` и `/chats/{id}/members` должны быть в `chat_partners` создателя (т.е. с ним уже есть private chat). Иначе 400 с указанием «лишних» id.
- `POST /chats/{id}/members` — только `role == "admin"`. Не-админ → 403.
- `DELETE /chats/{id}` — только `role == "admin"`. Не-админ → 403.
- `POST /chats/{id}/leave` — любой member, но только для `chat_type == "group"` (на private — 400).
- `/chats/{id}/*` endpoints проверяют `is_chat_member` перед действиями.
- При выходе/удалении сначала забираем `member_ids` до изменения, чтобы было кому послать WS-событие.

## UI-инварианты

- Шапка private = аватар + ник + presence; шапка group = `GroupAvatar` + название + `N участников`.
- Клик по шапке group открывает `GroupInfoModal` (список + кнопка «Добавить» для админа).
- Клик по шапке private открывает профиль партнёра (как было).
- Кнопка «Удалить группу» в меню чата видна только если текущий юзер — `admin` группы.
- Кнопка «+ группа» в шапке списка чатов — открывает `CreateGroupModal`.
- Список кандидатов в `CreateGroupModal` и `GroupInfoModal` — частные собеседники текущего юзера. Это совпадает с серверной проверкой.
- При переключении активного чата сразу `setMessages([])` — чтобы сообщения предыдущего чата не «утекали» в новый, пока летит fetch.

## Известные ограничения MVP

- Нет переименования группы и смены аватара после создания.
- Нет удаления конкретного участника (только сам уходит / админ удаляет всю группу).
- В push-уведомлениях для группы показывается `<sender> в <group>`; в private — `Новое сообщение от <sender>`.
- Read receipts в группе не показываются никому — поведение сразу взято консервативное, как у Telegram-чатов без открытой опции.
- `unread_count` для группы считается по таблице `message_read`: «сообщения от других без моего read-row». MessageRead пока не пишется (т.к. read receipts отключены) — поэтому в MVP unread count в группах всегда отражает «все чужие сообщения с момента создания» до пересоздания таблицы. Подробнее в roadmap.

## Тесты

`tests/test_group_chats.py` — 7 тестов:

- `_resolve_recipient_ids`: private возвращает `[recipient]`, без recipient — `[]`, group — исключает sender.
- `publish_chat_event` приземляется на канал `:chat_events`.
- `chat_events_listener` фанаутит только указанным `member_ids` (юзеры вне списка ничего не получают).
- `pubsub_listener` принимает новый формат `recipient_ids: [int]` и фоллбэчится на старый `recipient_id`.

Полный сьют: 131/131.
