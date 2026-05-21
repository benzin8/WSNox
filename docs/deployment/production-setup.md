# Production Setup — WSNox

---

## Что настроили

- CI/CD через GitHub Actions (`.github/workflows/deploy.yml`)
- Docker-образ в GHCR (`ghcr.io/benzin8/wsnox:latest`)
- Reverse proxy через nginx
- HTTPS через Let's Encrypt (certbot)
- `.env` хранится в GitHub Secrets, заливается на сервер при каждом деплое

---

## Как работает деплой

```
Push в main
    └── deploy.yml
            ├── Сборка Docker-образа → ghcr.io/benzin8/wsnox:latest
            └── SSH на сервер
                    ├── git pull origin main
                    ├── Запись .env из GitHub Secrets
                    ├── docker compose -f docker-compose.prod.yml pull
                    └── docker compose -f docker-compose.prod.yml up -d
```

---

## GitHub Secrets

| Секрет | Описание |
|--------|----------|
| `SERVER_HOST` | IP сервера |
| `SERVER_USER` | Пользователь SSH |
| `SERVER_SSH_KEY` | Приватный SSH-ключ |
| `DB_USER`, `DB_PASS`, `DB_HOST`, `DB_PORT`, `DB_NAME` | Параметры PostgreSQL |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Почта |
| `SECRET_KEY`, `ALGORITHM`, `REDIS_URL` | Безопасность и Redis |

---

## Проблемы и решения

### 1. Запускался старый docker-compose.yml вместо prod

На сервере поднимался образ `wsnox-backend` (локальная сборка) вместо `ghcr.io/benzin8/wsnox:latest`.

**Причина:** пайплайн запускал `docker compose up` без флага `-f`, поэтому использовался `docker-compose.yml`.

**Решение:** в deploy.yml явно указать файл:
```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

### 2. Неправильные переменные в .env

Backend не мог подключиться к базе данных.

**Причины:**
- `DB_HOST=localhost` вместо `db` (имя сервиса в Docker-сети)
- `DB_PORT=3306` (порт MySQL) вместо `5432` (PostgreSQL)
- `DB_USER=woglet` — данные от другого проекта попали в секрет

**Решение:** исправить секреты на GitHub, на сервере временно вручную:
```bash
sed -i 's/DB_HOST=localhost/DB_HOST=db/' ~/WSNox/.env
sed -i 's/DB_PORT=3306/DB_PORT=5432/' ~/WSNox/.env
docker compose -f docker-compose.prod.yml restart backend
```

---

### 3. Секреты с вложенным синтаксисом не работали

В GitHub были созданы Environment-секреты (DB, SERVER, SMTP, SECURITY), и в workflow использовался синтаксис `secrets.SERVER.SERVER_HOST`.

**Причина:** в GitHub Actions нет вложенных секретов — только плоский список. `secrets.SERVER.SERVER_HOST` всегда возвращает пустую строку.

**Решение:** перенести все секреты в Repository Secrets и обращаться напрямую: `secrets.SERVER_HOST`.

---

### 4. git pull не выполнялся на сервере

Сервер был позади на 5 коммитов — nginx продолжал работать со старым конфигом.

**Причина:** в deploy.yml не было шага `git pull`.

**Решение:** добавить в скрипт деплоя:
```bash
git pull origin main
```

---

### 5. Nginx падал при старте из-за отсутствия SSL-сертификата

Nginx не запускался потому что конфиг ссылался на `fullchain.pem`, которого ещё не было.

**Решение:** сначала поднять nginx с HTTP-only конфигом (без блока `443 ssl`), получить сертификат certbot, потом переключить на финальный конфиг с HTTPS.

---

### 6. Certbot возвращал 404 на challenge файл

Let's Encrypt не мог проверить домен — nginx отдавал 404 на `/.well-known/acme-challenge/`.

**Причина:** папка `certbot/www` не была примонтирована в nginx-контейнер (на сервере был старый `docker-compose.prod.yml` без этих volumes).

**Решение:** выполнить `git pull`, пересоздать nginx-контейнер:
```bash
git pull origin main
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

---

## Структура сервисов

```
nginx (80, 443)
    └── proxy → backend:8000
backend (внутренний порт)
    ├── db (postgres:16-alpine)
    └── redis (redis:7-alpine)
certbot (фоновое автообновление каждые 12ч)
```

Порты 5432 и 6379 не проброшены наружу — сервисы доступны только внутри Docker-сети.

---

## Ручные операции на сервере

```bash
# Логи в реальном времени
cd ~/WSNox
docker compose -f docker-compose.prod.yml logs -f

# Перезапуск конкретного сервиса
docker compose -f docker-compose.prod.yml restart backend

# Принудительное обновление без пуша в main
git pull origin main
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```
