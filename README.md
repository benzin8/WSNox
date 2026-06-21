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
| Аутентификация | JWT (python-jose): короткий access (15 мин) в `Authorization`, refresh в httpOnly-куке; bcrypt, email-код и rate-limit через Redis |
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
- **Авторизация**: короткий **access-JWT (15 мин)** идёт в `Authorization`-заголовке (и первым WS-сообщением); долгоживущий **refresh-JWT — в httpOnly-куке** `refresh_<user_id>` (`SameSite=Lax`, `Path=/auth`, `Secure` в проде по `COOKIE_SECURE`). XSS не может утащить refresh. На `401` клиент прозрачно рефрешит access (axios-интерсептор) и повторяет запрос. На `/auth/login` и `/auth/refresh` — rate-limit по IP.
- **CORS**: `allow_origins=[FRONTEND_BASE_URL], allow_credentials=True` — это монолит (фронт и API на одном origin), поэтому в обычной работе CORS вообще не задействуется, запросы идут same-origin. Список origin'ов сужен до собственного фронта (раньше был открыт `*`), чтобы сторонний сайт не мог делать аутентифицированные cross-origin запросы от имени пользователя. API-доки (`/docs`, `/redoc`, `/openapi.json`) отдаются только в debug — в проде схема эндпоинтов скрыта.
- **JWT sub — строка**: при декодировании токена `user_id = int(payload.get("sub"))`.
- **WebSocket + Redis PubSub**: при отправке сообщения бэкенд публикует в Redis, все воркеры слушают и доставляют нужным клиентам. На один и тот же `user_id` поддерживается множество сокетов (несколько вкладок).
- **Шифрование сообщений**: хранятся как `encrypted_data` (AES-GCM), расшифровываются на сервере при отдаче.

## Реализованные фичи

- **Аутентификация**: email-код + JWT (короткий access + refresh в httpOnly-куке), авто-refresh на `401`, rate-limit на login/refresh, [восстановление и смена пароля](docs/features/password-reset.md)
- **[Мультиаккаунтинг](docs/features/multi-account.md)**: несколько аккаунтов одновременно, переключение в один клик из профиля, бейдж непрочитанного по каждому; добавление через обычный вход. Эндпоинты `GET /chats/unread-total`, `POST /auth/refresh`
- **Чат**: WebSocket, история, поиск пользователей, последнее сообщение и счётчик непрочитанных в списке
- **[Media-сообщения](docs/features/media-messages.md)**: фото / видео / голосовые с подписью, серверный resize фото (Pillow), **очистка метаданных** (EXIF у фото, ffmpeg `-map_metadata -1` у видео/аудио), presigned S3 URLs, оптимистичный UI с прогрессом, фуллскрин-просмотрщик через React Portal, scroll-to-reply по клику на quote
- **[Голосовые сообщения](docs/features/voice-messages.md)**: запись в браузере через `MediaRecorder`, инлайн-плеер с «волной» и перемоткой, тот же upload-путь что у медиа (`msg_type=voice`)
- **[Реакции на сообщения](docs/features/reactions.md)**: эмодзи-реакции (одна на юзера, тоггл) + «усиление ауры» — энергетический буст, подсвечивающий пузырь; работают и в каналах
- **[Галерея медиа и поиск в чате](docs/features/media-and-search.md)**: тап по названию чата → вся медиатека этого чата + поиск по словам и дате (decrypt-on-the-fly, scoped к чату); каналы рендерятся «газетой»
- **[Альбомы-коллажи](docs/features/photo-albums.md)**: несколько фото за раз (до 10) с лотком-превью (убрать/переставить/подпись) → один пузырь-коллаж с раскладкой по числу фото, фуллскрин-листание; сгруппированные сообщения с общим `album_id`
- **[Групповые чаты](docs/features/group-chats.md)**: создание, fan-out по `chat_members`, имя автора в чужих сообщениях, превью «Иван: …» в списке чатов, модалка участников, добавление участников админом, выход/удаление группы
- **[Официальный канал WSNox](docs/features/announcements-channel.md)**: singleton-канал, куда автоматически добавлены все юзеры; read-only для всех, постинг — только по праву `post_announcements` через композер в дашборде
- **[Пользовательские каналы](docs/features/channels.md)**: любой может создать публичный канал (владелец постит, остальные читают и реагируют); вступление поиском по названию или по ссылке-приглашению `/join/<token>`
- **[Модерация и безопасность](docs/features/moderation-and-safety.md)**: согласие на переписку (первый контакт — одно сообщение → «Принять / Отклонить / Спам»), взаимная блокировка юзеров, бан аккаунтов из админки (с причиной и проверкой ранга); расширенные rate-лимиты — см. [защиту от абьюза](docs/security/abuse-prevention.md)
- **Профили**: `display_name`, `bio`, фото; модалка с табами «Личные данные» / «Безопасность»
- **[Аватарки](docs/features/avatars.md)**: Yandex S3 (приватный bucket + presigned GET), client-side круговой crop, server-side resize в WebP, realtime через `profile_update`
- **[RBAC](docs/features/rbac.md)**: роли user / moderator / admin / owner с иерархией рангов и правами (`view_dashboard` / `manage_users` / `manage_roles` / `post_announcements`); `is_admin` производное от роли, гейтинг через `require_permission`
- **[Дашборд основателя](docs/features/founder-dashboard.md)**: защищённая `/dashboard` (гейт по праву `view_dashboard`, модератор — read-only) с живой аналитикой — регистрации, сообщения, DAU, online, воронка, retention (D1/D7/D30), health, разбивка сообщений, WS-соединения
- **[Журнал изменений ролей](docs/features/role-audit-log.md)**: append-only audit RBAC-действий (кто/кому/когда, только метаданные — без приватного контента)
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
- [RBAC — роли и права](docs/features/rbac.md) — user/moderator/admin/owner, ранги, `require_permission`, `can_assign_role`, миграция-бэкфилл
- [Дашборд основателя](docs/features/founder-dashboard.md) — `/dashboard`, гейт по `view_dashboard`, живая аналитика (воронка/retention/health/breakdown/WS), placeholder'ы под Sentry/GeoIP
- [Журнал изменений ролей](docs/features/role-audit-log.md) — append-only audit RBAC-действий, `GET /api/admin/audit`, privacy-safe
- [Официальный канал WSNox](docs/features/announcements-channel.md) — singleton-канал, авто-join, read-only + постинг по праву
- [Групповые чаты](docs/features/group-chats.md) — MVP: создание, fan-out, добавление участников, выход. [Roadmap](docs/features/group-chats-roadmap.md) для следующих итераций (seen-by, переименование, mentions, pinned)
- [Восстановление и смена пароля](docs/features/password-reset.md) — reset по email-ссылке, смена через профиль, SMTP-конфиг
- [Media-сообщения](docs/features/media-messages.md) — фото/видео/голосовые, очистка метаданных, optimistic upload с прогрессом, лимиты, lightbox-портал, reply-to-photo
- [Голосовые сообщения](docs/features/voice-messages.md) — запись через `MediaRecorder`, инлайн-плеер, `process_audio` / `msg_type=voice`
- [Реакции на сообщения](docs/features/reactions.md) — эмодзи-реакции + «усиление ауры», WS-фан-аут через Redis, работают в каналах
- [Галерея медиа и поиск в чате](docs/features/media-and-search.md) — медиатека и поиск по словам/дате внутри чата, decrypt-on-the-fly над зашифрованными телами
- [Альбомы-коллажи](docs/features/photo-albums.md) — мульти-фото (≤10), лоток-превью, раскладка по числу фото, сгруппированные сообщения с общим `album_id`
- [Пользовательские каналы](docs/features/channels.md) — создание публичных каналов, постинг владельцем, вступление поиском и по ссылке `/join/<token>`
- [Модерация и безопасность](docs/features/moderation-and-safety.md) — согласие на переписку (1 сообщение → принять/отклонить/спам), блокировка, бан из админки

**Деплой**

- [Production setup](docs/deployment/production-setup.md) — первичная настройка инфраструктуры
- [Runbook](docs/deployment/deploy.md) — деплой, логи, откат

**Безопасность**

- [Защита от абьюза](docs/security/abuse-prevention.md) — обзор анти-абьюз прохода (rate-лимиты, лимиты загрузок, модерация, hardening); намеренно без точных порогов
- [Hardening-заметки](docs/security/hardening.md) — разделение ключей, AES-GCM, HSTS, rate-limit, что НЕ закрывается без E2EE
- [Аутентификация WebSocket](docs/security/websocket-auth.md) — handshake по JWT в первом сообщении

**Траблшутинг**

- [CORS и относительные URL](docs/troubleshooting/cors.md)
- [Раунд 1 — IV, bcrypt](docs/troubleshooting/security-fixes.md)
- [Раунд 2 — static mount, --reload, IDOR](docs/troubleshooting/fixes-round2.md)
- [Раунд 3 — auth race, Vite proxy, мобильная адаптация](docs/troubleshooting/fixes-round3.md)
- [Cache-headers — белый экран у возвращающихся юзеров после деплоя](docs/troubleshooting/cache-headers.md)
