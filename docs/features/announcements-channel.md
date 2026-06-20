# Официальный канал WSNox

Один широковещательный чат (`chat_type="channel"`), в котором состоят **все**
юзеры. Постить в него может только обладатель права `post_announcements`
(admin/owner — см. [rbac.md](./rbac.md)); для всех остальных канал **read-only**.
Это singleton — в БД ровно одна строка с `chat_type="channel"`.

## Что умеет

| Возможность | Где |
|---|---|
| Singleton-канал, резолв по `chat_type` | `services/announcements.py` — `get_or_create_channel`, `get_channel` |
| Авто-вступление при регистрации | `crud/user.py` — `create_user` → `join_channel` |
| Бэкфилл всех существующих юзеров миграцией | `e5f9c2b16d4a_announcements_channel` |
| Read-only поверх WS для всех | `ws/router.py` — guard `chat.chat_type == "channel"` |
| Пост только через gated-эндпойнт | `POST /api/admin/announcements` (`PERM_POST_ANNOUNCEMENTS`) |
| Unread-счётчик распространён на канал | `crud/chat.py`, `crud/message.py` |
| Пуш офлайн-получателям с «📣»-заголовком | `ws/router.py` — `_fanout_offline_pushes` |
| Megaphone + verified-бейдж в списке/шапке | `ChatList.jsx`, `ChatWindow.jsx` |
| Read-only баннер вместо инпута | `ChatWindow.jsx` |
| Композер объявлений в дашборде | `AnnouncementComposer.jsx`, `DashboardPage.jsx` |

## Архитектура

```text
Регистрация                       Admin постит объявление
    │                                  │
    ▼                                  ▼
crud.create_user              POST /api/admin/announcements
    │                          require_permission(PERM_POST_ANNOUNCEMENTS)
    │                                  │
    ▼                                  ▼
join_channel(user_id)         get_or_create_channel(session) → commit
get_or_create_channel                  │
ensure_member                          ▼
    │                          manager.send_personal_message(
    ▼                              chat_type="channel", recipient_id=None)
[user в chat_members]                  │
                                       ▼  _resolve_recipient_ids:
                                       │  channel → все члены минус sender
                                       ▼
                              redis.publish(REDIS_CHAT_CHANNEL, ...)
                                       │
                                       ▼
                              pubsub_listener → online: WS,
                                              offline: пуш «📣 WSNox»
```

Юзеры **не пишут** в канал по WS — единственная точка записи это
permission-gated admin-эндпойнт.

## Backend

### Сервис `services/announcements.py`

Канал — singleton, резолвится по `chat_type`. `get_or_create_channel` —
единственная точка входа, на ней сходятся и авто-вступление при регистрации, и
admin-пост.

| Функция | Что делает |
|---|---|
| `get_channel(session)` | первая (по `id ASC`) строка с `chat_type="channel"` или `None` |
| `get_or_create_channel(session)` | находит singleton, создаёт при отсутствии (`Chat(chat_type="channel", name="WSNox")` + `flush`); **не коммитит** — транзакцией владеет вызывающий |
| `ensure_member(session, chat_id, user_id)` | добавляет `ChatMember(role="member")`, если ещё не член; возвращает `True` если вставил; не коммитит |
| `join_channel(session, user_id)` | `get_or_create_channel` + `ensure_member` (no commit) |

Константы: `CHANNEL_TYPE = "channel"`, `CHANNEL_NAME = "WSNox"`.

### Авто-вступление при регистрации

`crud/user.py` → `UserCRUD.create_user`: после создания юзера и дефолтного
профиля вызывается `join_channel(session, user.id)` **в той же транзакции** перед
`commit`. То есть каждый новый юзер сразу член канала.

### Эндпойнт публикации

```text
POST /api/admin/announcements          (JSON)
  body: { "text": str }
  gate: require_permission(PERM_POST_ANNOUNCEMENTS)
→ AnnouncementResponse { chat_id: int, message_id: int }
```

`admin_post_announcement` (`admin_router.py`):

1. `text = payload.text.strip()`; 400 «Пустое сообщение», если пусто.
2. `get_or_create_channel(session)` + `session.commit()` (фиксируем канал).
3. `manager.send_personal_message(chat_id=chat.id, text=text, recipient_id=None,
   sender_id=current_admin.id, chat_type="channel", storage=...)` — тот же
   путь персиста + фан-аута, что у обычных сообщений.
4. `logger.warning("announcement posted by=... chat=... msg=...")` — аудит-след в
   логах (id/email постящего).

`AnnouncementRequest { text: str }` / `AnnouncementResponse { chat_id, message_id }`
— `app/api_v1/schemas/admin.py`.

### Read-only guard поверх WS

`ws/router.py`, обработка входящего text-сообщения: после проверки членства и
загрузки чата —

```python
# Канал объявлений read-only поверх WS — постинг идёт исключительно
# через permission-gated admin-эндпойнт.
if chat.chat_type == "channel":
    continue
```

То есть даже член канала, отправивший text по WS, молча игнорируется. Запись
возможна только через `POST /api/admin/announcements`.

### Фан-аут на канал

- `_resolve_recipient_ids` для не-private (включая `channel`) тянет
  `cached_member_ids(chat_id)` и исключает отправителя — то есть объявление
  улетает всем членам канала.
- `_build_chat_info` для не-private возвращает `name` / `chat_type` чата
  (`recipient = None`), чтобы клиент отрисовал строку чата из объекта `Chat`.
- `_fanout_offline_pushes` — отдельная ветка под канал:
  `if chat_type == "channel": title = f"📣 {name or 'WSNox'}"` (для группы —
  `<sender> в <group>`, для private — `Новое сообщение от <sender>`).

### Unread для канала

Канал использует ту же модель, что и группы: непрочитанное считается по таблице
`message_read` (нет единственного `recipient_id`). Изменения распространили
ветку `"group"` на `("group", "channel")`:

| Место | Что изменилось |
|---|---|
| `ChatCRUD.get_chats` — `unread_group` | `Chat.chat_type.in_(("group", "channel"))` |
| `ChatCRUD.get_unread_total` — `group_total` | то же `in_(("group", "channel"))` |
| `MessageCRUD._insert_group_reads` | `Chat.chat_type.in_(("group", "channel"))` |

Семантика: «сообщения от других, по которым у меня нет `MessageRead`-строки».
`mark_as_read` / `mark_as_read_up_to` вставляют недостающие `MessageRead`-строки
через `_insert_group_reads` (так же, как в группах).

## Миграция и бэкфилл

Ревизия `e5f9c2b16d4a_announcements_channel` (down_revision `d4e8b1a05c39` —
поверх RBAC-миграции):

```sql
-- создаём singleton-канал только если его ещё нет
INSERT INTO chats (chat_type, name, created_at, updated_at)
SELECT 'channel', 'WSNox', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM chats WHERE chat_type = 'channel');

-- бэкфилл: каждый существующий юзер — член канала
INSERT INTO chat_members (chat_id, user_id, role, joined_at)
SELECT c.id, u.id, 'member', now()
FROM users u
CROSS JOIN (SELECT id FROM chats WHERE chat_type='channel' ORDER BY id ASC LIMIT 1) c
WHERE NOT EXISTS (
    SELECT 1 FROM chat_members cm
    WHERE cm.chat_id = c.id AND cm.user_id = u.id
);
```

- Создание канала идемпотентно (`WHERE NOT EXISTS`).
- Бэкфилл добавляет в члены всех существующих юзеров, пропуская уже состоящих.
- `downgrade()` — удаляет `chat_members` канала, затем сам канал.

## Frontend

### Список чатов — `components/chat/ChatList.jsx`

- `isChannel = chat.chat_type === "channel"` → отдельная аватарка: круг с
  иконкой **Megaphone** (лайм) вместо `GroupAvatar` / `Avatar`.
- `displayName` для канала — `chat.name || "WSNox"`.
- Рядом с названием — **verified-бейдж** `BadgeCheck` (лайм), `isChannel`.
- Бейдж `unread_count` рендерится как у всех чатов.

### Окно чата — `components/chat/ChatWindow.jsx`

- `isChannel = activeChat?.chat_type === "channel"` → в шапке иконка
  **Megaphone** + **BadgeCheck**, подзаголовок «Официальный канал», заголовок
  при наведении «Официальный канал WSNox».
- Вместо `<InputArea>` рендерится **read-only баннер**:
  «Только команда WSNox может писать в этот канал» с иконкой Megaphone.
- Для канала отключены reply / delete / edit (`onReply` и пр. передаются
  `undefined`) — клиентское зеркало серверного read-only.

### Композер объявлений

- `components/dashboard/AnnouncementComposer.jsx` — textarea + кнопка
  «Опубликовать», шлёт `POST /api/admin/announcements` с
  `{ text }`; на успехе — «Объявление отправлено всем пользователям».
- `pages/DashboardPage.jsx` рендерит `<AnnouncementComposer />` **только если**
  `canPostAnnouncements` (из `useIsAdmin`). UI-гейт зеркалит
  `PERM_POST_ANNOUNCEMENTS`; бэк всё равно проверяет право.

## Тесты

`tests/test_announcements.py` — 8 тестов:

- `post_announcements_permission_by_role` — право `post_announcements` есть у
  admin/owner и нет у user/moderator.
- `announcement_forbidden_for_user_and_moderator` — эндпойнт даёт 403 для user и
  moderator.
- `announcement_empty_text_rejected` — пустой текст → 400.
- `announcement_admin_posts_ok` — admin успешно публикует.
- `get_or_create_channel_returns_existing` / `_creates_when_missing` — singleton:
  возвращает существующий канал и создаёт при отсутствии.
- `ensure_member_adds_when_absent` / `_noop_when_present` — членство добавляется
  один раз, повторный вызов — no-op.
