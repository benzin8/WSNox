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
| Аутентификация | JWT (python-jose), bcrypt, SMS-код через Redis |
| Пакеты | Poetry |

## Структура проекта

```
src/messenger/
  backend/
    app/
      api_v1/
        routers/        # auth_router, chat_router, profile_router, frontend_router
        schemas/        # Pydantic схемы
        auth/           # dependencies.py — get_current_user (JWT → User)
      ws/router.py      # WebSocket /chat/{user_id}, Redis PubSub менеджер
      main.py           # FastAPI app, CORS, статика, lifespan
    core/
      config.py         # pydantic-settings, database_url computed field
      security.py       # hash/verify password
      crypto.py         # шифрование сообщений
      redis.py          # init/close Redis
    db/
      session.py        # AsyncEngine, AsyncSession, get_db_session
      base.py           # Base = DeclarativeBase
    models/             # User, Chat, ChatMember, Message, Profile
    crud/               # UserCRUD, ChatCRUD, MessageCRUD, ProfileCRUD
  frontend_react/
    src/
      hooks/            # useChatSocket.js, useChatAction.js, useProfile.js
      pages/auth/       # SendCodePage, VerifyCodePage, LoginPage, RegisterPage
      pages/chat/       # ChatPage.jsx — основной экран
      components/       # ChatWindow, ChatList, ProfileModal, EditProfileModal
    .env                # VITE_API_BASE_URL= (пусто → относительные URL)
alembic/                # миграции
tests/                  # pytest: test_smoke, test_crypto, test_security
```

## Ключевые архитектурные решения

- **Относительные URL на фронте**: `VITE_API_BASE_URL=''` → все запросы идут на тот же хост. WebSocket аналогично определяется через `window.location.host`. Это позволяет работать через любой тоннель без пересборки.
- **CORS**: `allow_origins=["*"], allow_credentials=False` — JWT через `Authorization` заголовок, cookies не используются.
- **JWT sub — строка**: при декодировании токена `user_id = int(payload.get("sub"))` — обязательное приведение к int для PostgreSQL.
- **WebSocket + Redis PubSub**: при отправке сообщения бэкенд публикует в Redis, все воркеры слушают и доставляют нужным клиентам.
- **Шифрование сообщений**: сообщения хранятся зашифрованными в `encrypted_data`, расшифровка на стороне сервера при отдаче.

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
```

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):
- `lint-python` — ruff
- `lint-js` — eslint
- `test` — pytest (20 тестов)

Запускается на все ветки/PR. Деплой — вручную через `docker compose` + туннель.

## Реализованные фичи

- Email-аутентификация + верификация кода (Yandex SMTP)
- WebSocket чат (Redis pub/sub), сообщения шифруются в БД
- Профили: display_name, bio, presence_preference; редактирование с вкладками
- Real-time онлайн-статус: presence через Redis TTL + heartbeat, режимы «не беспокоить» / «невидимка»
- Поиск пользователей по username
- Список чатов с последним сообщением и счётчиком непрочитанных
- Мобильная адаптация: Telegram-style слайд между списком и чатом (`<768px`)
- CI/CD: GitHub Actions → GHCR → SSH deploy

## Документация

| Файл | Описание |
|------|----------|
| [deployment/deploy.md](docs/deployment/deploy.md) | Runbook: логи, ручной деплой, откат |
| [features/profiles.md](docs/features/profiles.md) | API профилей пользователей |
| [features/online-status.md](docs/features/online-status.md) | Real-time онлайн-статус: presence, heartbeat, невидимка/DND |
| [troubleshooting/cors.md](docs/troubleshooting/cors.md) | CORS и относительные URL |
| [troubleshooting/security-fixes.md](docs/troubleshooting/security-fixes.md) | Исправления безопасности (IV, bcrypt) |
| [troubleshooting/fixes-round2.md](docs/troubleshooting/fixes-round2.md) | Static mount, --reload, IDOR, тесты |
| [troubleshooting/fixes-round3.md](docs/troubleshooting/fixes-round3.md) | Auth race, Vite proxy, мобильная адаптация, last message |

---

## Уведомления

Изолированная фича в `src/messenger/frontend_react/src/features/notifications/` — React Context + хуки + UI. Backend задействован только для push.

**Четыре независимых канала**, каждый отключается отдельно, всё хранится в `localStorage` (никаких миграций под настройки):

| Канал | Где работает | Как реализовано |
|-------|--------------|-----------------|
| Звук (Ding / Chime / Bell) | Любая открытая вкладка | Web Audio API, тоны синтезируются в `audio/tones.js` — никаких mp3-ассетов. `audio/unlock.js` прогревает `AudioContext` на первый user-gesture, чтобы обойти autoplay-policy |
| Бейдж в `document.title` | Свёрнутая/неактивная вкладка | `useNotificationTitle` дописывает `(N)` к исходному заголовку |
| Browser Notification | Любая видимость, OS-уровень | `useNotificationDesktop` — `new Notification(...)`. Skip если чат активен и вкладка видима, дедуп через `tag: chat-<id>` |
| **Web Push (VAPID)** | Вкладка закрыта / приложение свёрнуто | Service worker `public/sw.js` + бэкенд-фоллбэк когда у получателя нет активного WebSocket |

**Push-флоу:**
1. На фронте `usePushSubscription` регистрирует SW, запрашивает `Notification.requestPermission()`, подписывается через `PushManager.subscribe()` с публичным ключом из `GET /api/v1/push/vapid-public-key`.
2. Эндпойнт `POST /api/v1/push/subscribe` сохраняет `endpoint + p256dh + auth` в `push_subscriptions`.
3. В `ws/router.py:pubsub_listener` если у получателя нет активных WebSocket → вызывается `send_push_to_user` (`ws/push.py`), который через `pywebpush` шлёт во все сохранённые подписки. Stale-подписки (HTTP 410) удаляются автоматически.

**Дополнительные мелочи:**
- **PWA-метаданные** (`public/manifest.json` + meta-теги в `index.html`) — обязательный pre-req для push на iOS 16.4+
- **Mute отдельных чатов** через `ChatMuteToggle` в шапке чата
- **`PushPromptModal`** — через 600ms после входа в `ChatPage` показывает модалку «Включи уведомления», dismissible (флаг `push_prompt_dismissed` в localStorage). На iOS Safari вне standalone вместо кнопки «Разрешить» показывает хинт «Поделиться → На экран Домой»
- **iOS-детект** в `features/notifications/utils/platform.js`

**Конфигурация VAPID** (env vars):
```env
VAPID_PUBLIC_KEY=...     # urlsafe-base64 без padding
VAPID_PRIVATE_KEY=...    # 32 байта urlsafe-base64
VAPID_MAILTO=mailto:admin@example.com   # дефолт mailto:admin@wsnox.app
```
Без ключей бэкенд молча пропускает push (`push.py:20-21`), эндпойнт `vapid-public-key` отвечает 503.

Генерация ключей:
```python
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
import base64

priv = ec.generate_private_key(ec.SECP256R1())
pub = priv.public_key().public_bytes(
    encoding=serialization.Encoding.X962,
    format=serialization.PublicFormat.UncompressedPoint,
)
priv_bytes = priv.private_numbers().private_value.to_bytes(32, "big")
b64u = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
print("PUBLIC:", b64u(pub))
print("PRIVATE:", b64u(priv_bytes))
```

---

## Восстановление и смена пароля

**Забыл пароль (с логина):**
1. На `LoginPage` ссылка «Забыли пароль?» → `ForgotPasswordPage` → email
2. `POST /auth/forgot-password` — генерит 32-байтный `secrets.token_urlsafe(32)`, кладёт в Redis `password_reset:<token> -> email` (TTL 30 мин), шлёт **HTML-письмо** с кнопкой «Сбросить пароль» и брендингом WSNox (`services/verification.py:_render_reset_email_html`)
3. Эндпойнт всегда отвечает `200 {ok: true}` — намеренно, чтобы не дать перебирать email на «зарегистрирован/нет»
4. Клик в письме → `/auth/reset-password?token=...` → новый пароль → `POST /auth/reset-password` → токен консьюмится (single-use), пароль хешится bcrypt, сразу выдаётся JWT-пара → редирект в `/chat`

**Смена пароля в профиле (когда уже залогинен):**
- Таб «Безопасность» в `EditProfileModal`
- `POST /profiles/me/password {current_password, new_password}` — проверяет текущий через `verify_password`, ругается на совпадение со старым, обновляет хеш
- Без email-подтверждения — по дизайну (текущего пароля достаточно)

**Конфигурация:**
```env
FRONTEND_BASE_URL=https://wsnox.urldot.ru   # для построения reset-ссылок; дефолт уже стоит
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=your@yandex.ru
SMTP_PASSWORD=...
```

---

## Профиль: что нового

- **Email отображается только в своём профиле** — `_build_response` в `profile_router.py` подставляет `email` только когда `viewer_id == user.id`; у чужих профилей `email = null`
- **Мета-блок в `ProfileModal`** — email, `ID 42`, «С нами с май 2026» (`created_at` теперь в `UserProfileResponse`)
- **Редизайн модалки**: градиентный хедер (lime → emerald → zinc), аватарка 96px с точкой статуса наезжает на хедер, `animate-popIn` + `animate-fadeIn` (keyframes в `index.css`)
- **Сайдбар** использует `display_name || name` для буквы-аватарки и обновляется сразу после сохранения профиля (`myProfile` state в `ChatPage`)
- **Привязка телефона** убрана из UI (таб «Личные данные»); сами эндпойнты `/profiles/phone/*` сохранены
