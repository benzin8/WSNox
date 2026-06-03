# Мультиаккаунтинг

Вход под несколькими аккаунтами одновременно и переключение между ними в один клик из модалки профиля. На экране выбора виден счётчик непрочитанного по каждому аккаунту.

## Что входит

| Возможность | Где |
|------|------|
| Хранение нескольких аккаунтов + активный | `features/accounts/accountStore.js` |
| Переключение аккаунта (reload) | `accountStore.switchAccount` |
| Добавление аккаунта через обычный вход, не затирая текущий | `pages/auth/LoginPage.jsx`, `RegisterPage.jsx` + `accountStore.upsertAccount` |
| Обход редиректа auth-страниц, пока добавляем аккаунт | `App.jsx` — `PublicOnlyRoute` + `isAddingAccount()` |
| Блок «Аккаунты» в профиле (аватар, имя, бейдж, галочка активного, выход, «+добавить») | `features/accounts/AccountsBlock.jsx`, встроен в `components/profile/ProfileModal.jsx` |
| Счётчик непрочитанного по каждому аккаунту | `features/accounts/useAccounts.js` → `GET /chats/unread-total` |
| Logout через стор (переключение на следующий / выход) | `pages/chat/ChatPage.jsx` — `handleLogout` |
| Сумма непрочитанного для бейджа | `GET /chats/unread-total` (`ChatCRUD.get_unread_total`) |
| Обновление пары токенов по refresh-токену | `POST /auth/refresh` (`decode_token`) |

## Архитектура

Вся логика мультиаккаунта — на клиенте. Бэкенд получает два самостоятельных эндпоинта, полезных и вне фичи.

> **Модель токенов (с этапа auth-hardening, C-lite):** refresh-токены **не хранятся в JS** — у каждого аккаунта своя httpOnly-кука `refresh_<user_id>` (ставит сервер). В `localStorage` — только несекретные метаданные аккаунтов + короткий (15 мин) access активного аккаунта.

### Хранилище (`localStorage`)

```text
accounts          — [{ user_id, display_name, avatar_url, needs_login }]   # без токенов
active_account_id — user_id активного аккаунта
access_token      — короткий (15 мин) access активного аккаунта (легаси-ключ)
adding_account    — флаг «идёт добавление аккаунта» (временный)
```

**Совместимость:** access активного аккаунта лежит в легаси-ключе `access_token`, поэтому весь существующий код (повсюду читает `localStorage.getItem('access_token')`) и WS работают без изменений. refresh в JS отсутствует (только httpOnly-кука).

### Переключение

`switchAccount(userId)` дёргает `POST /auth/refresh {user_id}` — сервер по httpOnly-куке выбранного аккаунта выдаёт свежий access; кладём его в `access_token`, ставим `active_account_id`, `window.location.reload()` (WS/чаты/контексты проще переподнять с нуля).

### Добавление аккаунта

«+ Добавить аккаунт» ставит флаг `adding_account` и ведёт на `/auth/send-code`. Пока флаг стоит, `PublicOnlyRoute` пускает на auth-страницы несмотря на активный токен. При успешном входе/регистрации сервер ставит refresh-куку нового аккаунта и отдаёт access; метаданные добавляются в `accounts` (`upsertAccount`), затем переключение на новый.

### Счётчик непрочитанного

`useAccounts` при открытии профиля для каждого аккаунта получает access (активный — из `access_token`, остальные — через `POST /auth/refresh {user_id}` по их куке) и запрашивает `GET /chats/unread-total`. Ошибка/`401` по одному аккаунту — просто без бейджа, остальной список не падает.

### Миграция старых сессий

- Дофичевая сессия (только легаси-токены, нет в `accounts`): на загрузке чата (`ChatPage`) `seedCurrentAccount(...)` заносит текущего юзера в стор как активного. No-op, если уже в сторе.
- Докуковая сессия (refresh лежал в `localStorage`): на первом `401` интерсептор шлёт legacy-refresh в теле `/auth/refresh`, сервер выставляет httpOnly-куку, после чего refresh из `localStorage` удаляется.

## Бэкенд

### `GET /chats/unread-total`

Auth: `get_current_user`. Возвращает `{ "unread_total": <int> }` — сумму непрочитанного по всем чатам юзера (private: `is_read=False` для адресованных мне; group: сообщения от других без строки `MessageRead(me)` — те же правила, что в `GET /chats/`).

### `POST /auth/refresh`

Тело `{ "user_id": <int> }`. Читает httpOnly-куку `refresh_<user_id>`, валидирует токен (`type == "refresh"`, подпись, срок, `sub == user_id`) через `decode_token`, возвращает новый **access** (15 мин) в теле и переустанавливает куку. Для миграции принимает опциональный `refresh_token` в теле (legacy из localStorage). На любой сбой — `401`. Rate-limit 30/IP за 5 мин.

### `POST /auth/logout`

Тело `{ "user_id": <int> }`. Чистит httpOnly-куку `refresh_<user_id>` (`Max-Age=0`). `204`.

> Авторизация: короткий access (15 мин) в `Authorization`, refresh — в httpOnly-куке. На `401` клиент рефрешит автоматически (глобальный axios-интерсептор, `refreshInterceptor.js`).

## Вне MVP

- Фоновые пуши/WS по неактивным аккаунтам (real-time и пуши — только по активному).
- Серверная привязка нескольких аккаунтов к одному устройству/владельцу.

## Лимиты

- До 5 аккаунтов (`MAX_ACCOUNTS` в `accountStore.js`).
