# Security Hardening

Реализовано в коммите [`354e0e3`](https://github.com/benzin8/WSNox/commit/354e0e3) (2026-05-24). Закрывает 5 из 6 пунктов аудита, оставшиеся слабые места и план описаны в задаче ProjectsFlow `a47353e3`.

## Что сделано

### 1. Разделение ключей: JWT vs шифрование сообщений

**Было:** один `SECRET_KEY` использовался и в `core/security.py` для подписи JWT, и в `core/crypto.py` для AES-шифрования сообщений. Любая утечка любого из контекстов скомпрометировала бы оба.

**Стало:** две независимые env-переменные:

```env
JWT_SECRET_KEY=<64+ hex chars>           # подпись JWT access/refresh
MESSAGE_ENCRYPTION_KEY=<64+ hex chars>   # AES-GCM 256-bit key для сообщений
SECRET_KEY=<legacy>                      # остаётся как fallback
```

Логика fallback в `core/security.py:8` и `core/crypto.py:11`:
```python
SECRET_KEY = settings.jwt_secret_key or settings.secret_key
_raw_key  = settings.message_encryption_key or settings.secret_key
```

Если новые переменные не заданы — обе использует старый `SECRET_KEY`. Это даёт мягкую миграцию: можно выкатить код без обновления env, потом постепенно прописать разные значения. **Когда обе переменные заданы — старая `SECRET_KEY` фактически не используется**, можно её удалить из `.env`.

### 2. AES-CBC → AES-GCM с обратной совместимостью

**Было:** AES-256-CBC + PKCS7 padding, без MAC. Уязвимо к подделке шифротекста и теоретически к padding-oracle.

**Стало:** AES-256-GCM (AEAD, встроенная аутентификация). Старые сообщения читаются автоматически — версионирование через первый байт payload:

```python
# core/crypto.py:14
_GCM_VERSION = b'\x01'

# При записи: payload = base64(version_byte + 12-byte nonce + ciphertext+tag)
# При чтении:
if raw_data[:1] == _GCM_VERSION:
    # New GCM path
else:
    # Legacy CBC path — IV в первых 16 байтах
```

Старые CBC-сообщения в БД продолжают читаться через legacy-ветку. Новые пишутся в GCM. Полная миграция произойдёт по мере перезаписи сообщений (в текущей модели сообщения immutable, так что старые так и останутся CBC — это OK).

### 3. Печать SMS-кода только в DEBUG

**Было:** `profile_router.py:93` — `print(f"[DEV] Phone verification code for {phone}: {code}")` всегда писал код в stdout, попадал в логи контейнера.

**Стало:** обёрнуто в `if settings.debug:`. По умолчанию `debug=False` (см. `core/config.py:21`). В прод-логах кодов больше нет.

### 4. HSTS-заголовок в nginx

`nginx/wsnox.conf:22`:
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

Браузер на год запоминает, что для `wsnox.urldot.ru` (и поддоменов) можно ходить только по HTTPS. Защищает от SSL-stripping атак на публичном Wi-Fi.

### 5. Rate-limit на code-sending эндпойнты

Новый модуль `core/rate_limit.py` — простой Redis-based счётчик по IP-адресу (берётся из `X-Real-IP` header, который nginx прокидывает):

```python
async def rate_limit_send_code(request: Request) -> None:
    client_ip = request.headers.get("x-real-ip") or request.client.host
    await check_rate_limit(f"rl:send_code:ip:{client_ip}", max_requests=5, window_seconds=300)
```

Применён к трём эндпойнтам через `Depends(...)`:
- `POST /auth/send-code` — email-код для логина
- `POST /auth/forgot-password` — ссылка сброса пароля
- `POST /profiles/phone/send-code` — SMS-код привязки телефона

Лимит: **5 запросов за 5 минут с одного IP**. На 6-ю попытку — HTTP 429. Защищает от спама на чужие ящики/телефоны.

## Конфигурация после миграции

Пример продакшн `.env`:

```env
# Старый ключ (можно удалить когда новые два прописаны)
SECRET_KEY=...

# Новые разделённые ключи (рекомендуется)
JWT_SECRET_KEY=<сгенерируй через: python -c "import secrets; print(secrets.token_urlsafe(48))">
MESSAGE_ENCRYPTION_KEY=<генерация так же>

# Debug-режим — false в проде, иначе утекают коды в логи
DEBUG=false
```

`deploy.yml` пока всё ещё пишет `SECRET_KEY` из GitHub Secret. Чтобы выкатить новые — добавь `JWT_SECRET_KEY` и `MESSAGE_ENCRYPTION_KEY` в Settings → Secrets → Actions, потом обнови `deploy.yml`:

```yaml
echo "JWT_SECRET_KEY=${{ secrets.JWT_SECRET_KEY }}"
echo "MESSAGE_ENCRYPTION_KEY=${{ secrets.MESSAGE_ENCRYPTION_KEY }}"
echo "DEBUG=false"
```

## Что НЕ закрывается этими фиксами

Эти фиксы — про «гигиену» и базовую защиту от типовых атак. Они **не** меняют фундаментальную модель доверия:

| Угроза | Защищён? | Почему |
|---|---|---|
| Снифинг трафика (ISP, Wi-Fi) | ✅ | TLS 1.2/1.3 + HSTS |
| Утечка только дампа БД без env | ✅ | `MESSAGE_ENCRYPTION_KEY` не в БД |
| Подделка шифротекста в БД | ✅ | AES-GCM auth-tag |
| Брутфорс email/телефона спамом | ✅ | rate-limit 5/5min |
| Downgrade на HTTP | ✅ | HSTS |
| **SSH-доступ к VPS** | ❌ | `.env` рядом с БД — забирает всё |
| **Сотрудник хостера** | ❌ | RAM/диск контейнера |
| **Метаданные** (кто/кому/когда) | ❌ | Сервер видит всегда |
| **SMTP-провайдер** видит коды/reset-ссылки | ❌ | Идут plain через Yandex |
| **GH Actions runner compromise** | ❌ | Все secrets утекут разом |

Кардинально лечит первые два пункта только **E2EE** (обсуждался отдельно — см. чат, оценка ~1–2 недели для X25519+AES-GCM или ~1–3 месяца для Signal-уровня).

## Что осталось из чек-листа

- ⏳ **Disappearing messages** — `Message.expires_at` + крон-чистилка. Защищает историю при будущем компромате сервера. Опциональная фича, не блокирует другие задачи.

## Файлы, которые тронуты

- `nginx/wsnox.conf` — HSTS header
- `src/messenger/backend/core/config.py` — `jwt_secret_key`, `message_encryption_key`, `debug` settings
- `src/messenger/backend/core/security.py` — JWT key fallback
- `src/messenger/backend/core/crypto.py` — AES-GCM + legacy CBC fallback
- `src/messenger/backend/core/rate_limit.py` — **new** Redis rate-limit helper
- `src/messenger/backend/app/api_v1/routers/auth_router.py` — `Depends(rate_limit_send_code)` на send-code и forgot-password
- `src/messenger/backend/app/api_v1/routers/profile_router.py` — `Depends(rate_limit_send_code)` + `if settings.debug` вокруг print
