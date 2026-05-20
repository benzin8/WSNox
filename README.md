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
