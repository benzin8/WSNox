``` text
 __      __  _________ _______                
/  \    /  \/   _____/ \      \   _______  ___
\   \/\/   /\_____  \  /   |   \ /  _ \  \/  /
 \        / /        \/    |    (  <_> >    < 
  \__/\  / /_______  /\____|__  /\____/__/\_ \
       \/          \/         \/            \/
```

# WSNox — мессенджер

FastAPI + React + PostgreSQL + Redis + WebSocket.  
Монолит: FastAPI сам отдаёт React-сборку как статику.

## Стек

| Слой | Технология |
|------|-----------|
| Backend | FastAPI (Python 3.12), SQLAlchemy async, Alembic |
| Frontend | React 18, Vite, Tailwind CSS |
| БД | PostgreSQL 16 (psycopg3 / `postgresql+psycopg://`) |
| Кэш/PubSub | Redis 7 |
| WebSocket | FastAPI WebSocket + Redis PubSub |
| Аутентификация | JWT (python-jose), bcrypt, email-код через Redis |
| Уведомления | Web Push (VAPID, pywebpush), Service Worker |
| Пакеты | Poetry |

## Структура проекта

```
src/messenger/
  backend/
    app/
      api_v1/
        routers/        # auth, chat, profile, push, notification, frontend
        schemas/        # Pydantic схемы
        auth/           # dependencies.py — get_current_user (JWT → User)
      ws/
        router.py       # WebSocket /chat, ConnectionManager, pubsub
        push.py         # pywebpush — fan-out по подпискам
        viewing_chat.py # Redis-ключ активного чата (TTL grace)
        presence.py     # real-time онлайн-статус
      main.py           # FastAPI app, CORS, статика, lifespan
    core/
      config.py         # pydantic-settings
      security.py       # хеш/проверка пароля
      crypto.py         # шифрование сообщений (AES-GCM)
      redis.py          # init/close Redis
    db/                 # AsyncEngine, Base
    models/             # User, Chat, ChatMember, Message, Profile,
                        # PushSubscription, ChatMute
    crud/               # UserCRUD, ChatCRUD, MessageCRUD, ProfileCRUD,
                        # NotificationCRUD
  frontend_react/
    src/
      hooks/            # useChatSocket, useChatAction, useProfile,
                        # usePresence, useEdgeSwipe
      pages/auth/       # SendCode, VerifyCode, Login, Register, Reset
      pages/chat/       # ChatPage.jsx — основной экран
      components/       # ChatWindow, ChatList, MessageList, профили
      features/
        notifications/  # звук, browser-notif, title-badge, push, mute, DND
    public/sw.js        # service worker для push
alembic/                # миграции
tests/                  # pytest
```

## Ключевые архитектурные решения

- **Относительные URL на фронте**: `VITE_API_BASE_URL=''` — все запросы идут на тот же хост. WebSocket аналогично определяется через `window.location.host`. Работает через любой туннель без пересборки.
- **CORS**: `allow_origins=["*"], allow_credentials=False` — JWT через `Authorization`-заголовок, cookies не используются.
- **JWT sub — строка**: при декодировании токена `user_id = int(payload.get("sub"))`.
- **WebSocket + Redis PubSub**: при отправке сообщения бэкенд публикует в Redis, все воркеры слушают и доставляют нужным клиентам. На один и тот же `user_id` поддерживается множество сокетов (несколько вкладок).
- **Шифрование сообщений**: хранятся как `encrypted_data` (AES-GCM), расшифровываются на сервере при отдаче.

## Реализованные фичи

- **Аутентификация**: email-код + JWT, [восстановление и смена пароля](docs/features/password-reset.md)
- **[Мультиаккаунтинг](docs/features/multi-account.md)**: несколько аккаунтов одновременно, переключение в один клик из профиля, бейдж непрочитанного по каждому; добавление через обычный вход. Эндпоинты `GET /chats/unread-total`, `POST /auth/refresh`
- **Чат**: WebSocket, история, поиск пользователей, последнее сообщение и счётчик непрочитанных в списке
- **[Media-сообщения](docs/features/media-messages.md)**: фото и видео с подписью, серверный resize фото (Pillow), presigned S3 URLs, оптимистичный UI с прогрессом, фуллскрин-просмотрщик через React Portal, scroll-to-reply по клику на quote
- **[Групповые чаты](docs/features/group-chats.md)**: создание, fan-out по `chat_members`, имя автора в чужих сообщениях, превью «Иван: …» в списке чатов, модалка участников, добавление участников админом, выход/удаление группы
- **Профили**: `display_name`, `bio`, фото; модалка с табами «Личные данные» / «Безопасность»
- **[Аватарки](docs/features/avatars.md)**: Yandex S3 (приватный bucket + presigned GET), client-side круговой crop, server-side resize в WebP, realtime через `profile_update`
- **[Дашборд основателя](docs/features/founder-dashboard.md)**: защищённая `/dashboard` с метриками (регистрации, сообщения, DAU, online), `users.is_admin` гейт, placeholder'ы под будущие секции
- **[Онлайн-статус в реал-тайме](docs/features/online-status.md)**: Redis TTL + heartbeat, режимы «не беспокоить» и «невидимка»
- **[Уведомления](docs/features/notifications.md)**: 4 канала (звук / title-бейдж / browser / push), per-chat mute, глобальный DND, suppression для активного чата
- **[Отметки о прочтении](docs/features/read-receipts.md)** с взаимной приватностью: серая/зелёная точка под исходящим
- **[Мобильная навигация](docs/features/mobile-navigation.md)**: Telegram-style слайд между списком и чатом + edge-swipe назад
- **PWA**: manifest + service worker — устанавливается на iOS/Android home screen
- **CI/CD**: GitHub Actions → GHCR → SSH deploy

## Локальный запуск

```bash
# 1. Создать .env в корне (см. пример ниже)
# 2. Запустить всё через Docker
docker compose up --build -d

# Туннель наружу (если нет белого IP)
ssh -R 80:localhost:8000 nokey@localhost.run
```

### Пример `.env`

```env
DB_USER=postgres
DB_PASS=yourpassword
DB_HOST=db
DB_PORT=5432
DB_NAME=messenger
SECRET_KEY=your-secret-key-min-32-chars
ALGORITHM=HS256
REDIS_URL=redis://redis:6379/0

# опционально — без них push молча отключается
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_MAILTO=mailto:admin@example.com
```

## CI/CD

GitHub Actions (`.github/workflows/`):

- **CI** — ruff, eslint, pytest
- **Deploy** — собрать Docker-образ → push в GHCR → SSH-pull на проде

Запускается на пуш в `main`. Локальная сборка/тесты — `pytest tests` и `npm run build` в `src/messenger/frontend_react/`.

## Документация

**Фичи**

- [Онлайн-статус](docs/features/online-status.md) — presence через Redis TTL, heartbeat, режимы DND и невидимка
- [Уведомления](docs/features/notifications.md) — четыре канала, push с VAPID, mute / DND / suppression активного чата
- [Отметки о прочтении](docs/features/read-receipts.md) — gray/green точка, серверный gate взаимной приватности
- [Мобильная навигация](docs/features/mobile-navigation.md) — слайд между списком и чатом, edge-swipe back
- [Профили](docs/features/profiles.md) — модель, API, редактирование
- [Аватарки](docs/features/avatars.md) — S3-хранение, presigned URLs, круговой crop, realtime
- [Дашборд основателя](docs/features/founder-dashboard.md) — `/dashboard`, метрики из БД + presence, placeholder'ы под Sentry/GeoIP/events
- [Групповые чаты](docs/features/group-chats.md) — MVP: создание, fan-out, добавление участников, выход. [Roadmap](docs/features/group-chats-roadmap.md) для следующих итераций (seen-by, переименование, mentions, pinned)
- [Восстановление и смена пароля](docs/features/password-reset.md) — reset по email-ссылке, смена через профиль, SMTP-конфиг
- [Media-сообщения](docs/features/media-messages.md) — фото/видео в чат, optimistic upload с прогрессом, лимиты, lightbox-портал, reply-to-photo

**Деплой**

- [Production setup](docs/deployment/production-setup.md) — первичная настройка инфраструктуры
- [Runbook](docs/deployment/deploy.md) — деплой, логи, откат

**Безопасность**

- [Hardening-заметки](docs/security/hardening.md) — разделение ключей, AES-GCM, HSTS, rate-limit, что НЕ закрывается без E2EE
- [Аутентификация WebSocket](docs/security/websocket-auth.md) — handshake по JWT в первом сообщении

**Траблшутинг**

- [CORS и относительные URL](docs/troubleshooting/cors.md)
- [Раунд 1 — IV, bcrypt](docs/troubleshooting/security-fixes.md)
- [Раунд 2 — static mount, --reload, IDOR](docs/troubleshooting/fixes-round2.md)
- [Раунд 3 — auth race, Vite proxy, мобильная адаптация](docs/troubleshooting/fixes-round3.md)
- [Cache-headers — белый экран у возвращающихся юзеров после деплоя](docs/troubleshooting/cache-headers.md)
