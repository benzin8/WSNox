# Fixes Round 2: Static Mount, Docker, Authorization, Tests

## 1. Двойной mount статики (`main.py`)

### Было
```python
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

# Второй mount — безусловный, всегда выполняется
app.mount("/assets",
        StaticFiles(directory=FRONTEND_PUBLIC_DIR / "assets"),
        name="assets")
```

### Стало
```python
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")
```

### Почему это было проблемой

FastAPI (Starlette под капотом) хранит mounted routes в списке. При двух `app.mount` с одинаковым именем `"assets"` добавляются **два** маршрута. Starlette будет матчить первый попавшийся — поведение непредсказуемо в зависимости от порядка. Кроме того, если `ASSETS_DIR` не существует (например, фронтенд ещё не собран), безусловный второй mount выбрасывает `RuntimeError: Directory does not exist` прямо при старте приложения — сервер не поднимется вообще.

Правило: один `mount` на один путь. Условие `exists()` защищает от падения при отсутствии собранного фронтенда.

---

## 2. `--reload` в Docker (`entrypoint.sh`)

### Было
```bash
exec uvicorn messenger.backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Стало
```bash
exec uvicorn messenger.backend.app.main:app --host 0.0.0.0 --port 8000
```

### Почему `--reload` опасен в продакшне

`--reload` запускает watchdog-процесс, который следит за изменениями файлов и перезапускает сервер при каждом изменении. В Docker с примонтированным volume (bind mount) это означает:

- **Нестабильность**: любое обращение к файловой системе может триггернуть перезапуск
- **Производительность**: watchdog потребляет CPU и держит файловые дескрипторы
- **Безопасность**: `--reload` использует `multiprocessing` иначе, чем production-режим — поведение воркеров различается
- **Несовместимость с несколькими воркерами**: `--reload` несовместим с `--workers N > 1`

`--reload` — исключительно для локальной разработки. В Docker всегда без него.

---

## 3. Авторизация в чатах (`chat_router.py` + `crud/chat.py`)

### Проблема

До исправления оба эндпоинта не проверяли, является ли текущий пользователь участником запрашиваемого чата:

```python
# Любой авторизованный пользователь мог вызвать:
GET /chats/999/messages   # чужой чат — возвращал сообщения
GET /chats/999/user       # чужой чат — возвращал данные участника
```

Достаточно было иметь **любой** валидный JWT-токен. Это называется **IDOR** (Insecure Direct Object Reference) — атака через перебор ID объектов.

### Что добавлено

**Новый метод в `ChatCRUD`:**
```python
@staticmethod
async def is_chat_member(session: AsyncSession, chat_id: int, user_id: int) -> bool:
    query = select(ChatMember).where(
        ChatMember.chat_id == chat_id,
        ChatMember.user_id == user_id,
    )
    result = await session.execute(query)
    return result.scalar_one_or_none() is not None
```

**Защита в роутере:**
```python
@chat_router.get("/{chat_id}/messages", ...)
async def get_messages_by_chat_id(chat_id: int, ...):
    if not await ChatCRUD.is_chat_member(db, chat_id, current_user.id):
        raise HTTPException(status_code=403, detail="Нет доступа к этому чату")
    ...

@chat_router.get("/{chat_id}/user", ...)
async def get_user_data_by_chat_id(chat_id: int, ...):
    if not await ChatCRUD.is_chat_member(db, chat_id, current_user.id):
        raise HTTPException(status_code=403, detail="Нет доступа к этому чату")
    user = await ChatCRUD.get_user_data_by_chat_id(...)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    ...
```

### Почему 403, а не 404?

Есть два подхода:
- **404** — "такого ресурса не существует" — скрывает факт существования чата
- **403** — "доступ запрещён" — честно говорит, что ты не в этом чате

Для мессенджера 403 правильнее: ID чата всё равно виден в URL при нормальной работе, скрывать его бессмысленно. Зато 403 явно сигнализирует клиенту "перелогинься или ты не в этом чате".

### Также убрано из роутера

- `logging.basicConfig(level=logging.INFO)` на уровне модуля — перезаписывал глобальную конфигурацию логирования приложения при каждом импорте модуля
- Неиспользуемый `bearer_scheme` из imports
- `from redis import UsernamePasswordCredentialProvider` из `schemas/chat.py` — случайно затесавшийся импорт из redis-клиента

---

## 4. Тесты (`tests/test_crypto.py`, `tests/test_security.py`)

### Что покрывают тесты

**`test_crypto.py` — 8 тестов:**

| Тест | Что проверяет |
|---|---|
| `test_roundtrip_ascii` | Базовый encrypt→decrypt для ASCII |
| `test_roundtrip_cyrillic` | Кириллица корректно шифруется/дешифруется |
| `test_roundtrip_long_message` | Сообщение в 1000 байт |
| `test_roundtrip_multiblock` | Сообщение на границе AES-блоков (47 байт) |
| `test_unique_ciphertexts_same_plaintext` | **Главный тест исправления IV** — одно сообщение шифруется дважды и даёт разный шифротекст |
| `test_ciphertext_is_base64_string` | Вывод — валидный base64 длиной > 16 байт |
| `test_invalid_base64_returns_error` | Мусор на входе → строка с ошибкой |
| `test_truncated_ciphertext_returns_error` | Только IV без тела → ошибка unpadding |

**`test_security.py` — 11 тестов:**

| Тест | Что проверяет |
|---|---|
| `test_hash_returns_bcrypt_string` | Хеш начинается с `$2b$` — bcrypt-формат |
| `test_verify_correct_password` | Правильный пароль верифицируется |
| `test_verify_wrong_password` | Неправильный пароль отклоняется |
| `test_same_password_different_hashes` | **Главный тест bcrypt-соли** — два хеша одного пароля не совпадают |
| `test_verify_still_works_after_different_hash` | verify работает для обоих хешей одного пароля |
| `test_create_pair_returns_both_tokens` | Возвращаются оба токена |
| `test_access_token_is_string` | Токены — строки |
| `test_access_and_refresh_differ` | Access ≠ Refresh |
| `test_access_token_payload` | Payload access-токена: `sub`, `type=access` |
| `test_refresh_token_payload` | Payload refresh-токена: `sub`, `type=refresh` |
| `test_expired_token_raises` | Токен с `exp` в прошлом выбрасывает `ExpiredSignatureError` |

### Как запустить

```bash
# из корня проекта
.venv/bin/pytest tests/ -v

# или просто
pytest tests/ -v
```

### Философия этих тестов

Тесты — **unit-тесты чистых функций** без базы данных, без HTTP, без Redis. Они:
1. Запускаются мгновенно (< 5 сек)
2. Не требуют запущенной инфраструктуры
3. Проверяют именно криптографические инварианты — то, что нельзя проверить глазами

Тест `test_unique_ciphertexts_same_plaintext` специально написан как "доказательство" исправления — он бы упал до правки IV.
Тест `test_same_password_different_hashes` аналогично доказывает, что bcrypt использует соль.

---

## Итого изменённых файлов

| Файл | Что изменено |
|---|---|
| `src/.../app/main.py` | Убран дублирующий `app.mount` |
| `entrypoint.sh` | Убран `--reload` |
| `src/.../crud/chat.py` | Добавлен `is_chat_member` |
| `src/.../routers/chat_router.py` | Проверки 403 в двух эндпоинтах, null-check, чистка импортов |
| `src/.../schemas/chat.py` | Убран `from redis import ...` |
| `tests/test_crypto.py` | Создан (8 тестов) |
| `tests/test_security.py` | Создан (11 тестов) |
| `pyproject.toml` | Добавлен pytest в dev-зависимости |
