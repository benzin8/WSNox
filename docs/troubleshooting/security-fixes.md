# Security Fixes: Crypto & Password Hashing

## Что было исправлено и почему

---

## 1. Повторное использование IV в AES-CBC (`crypto.py`)

### Было
```python
# Уровень модуля — выполняется ОДИН РАЗ при старте сервера
KEY = settings.secret_key.encode().ljust(32)[:32]
IV = os.urandom(16)

def encrypt_message(message: str) -> str:
    cipher = Cipher(algorithms.AES(KEY), modes.CBC(IV), ...)
    ...
    return base64.b64encode(IV + encrypted_data).decode('utf-8')
```

### Стало
```python
KEY = settings.secret_key.encode().ljust(32)[:32]

def encrypt_message(message: str) -> str:
    iv = os.urandom(16)   # <-- генерируется для КАЖДОГО сообщения
    cipher = Cipher(algorithms.AES(KEY), modes.CBC(iv), ...)
    ...
    return base64.b64encode(iv + encrypted_data).decode('utf-8')
```

### Почему это критично — теория AES-CBC

AES-CBC (Cipher Block Chaining) шифрует блоки данных по цепочке. Перед шифрованием первого блока он XOR-ится с **IV (Initialization Vector)** — случайным числом.

```
Plaintext₁ XOR IV       → AES(KEY) → Ciphertext₁
Plaintext₂ XOR Ciphertext₁ → AES(KEY) → Ciphertext₂
...
```

**Что происходит при одинаковом IV:**

Если два разных сообщения начинаются одинаково (например, `"Привет, "`) и шифруются одним IV и одним KEY, их первые блоки шифротекста будут **идентичны**. Это называется "утечка паттернов".

```
encrypt("Привет, Иван!")   → AAA...XYZ
encrypt("Привет, Мария!")  → AAA...QRS
                              ^^^
                    Одинаковое начало — видно, что сообщения похожи
```

Это нарушает **IND-CPA** (indistinguishability under chosen-plaintext attack) — базовое требование к шифрованию.

**Правило**: IV должен быть уникальным для каждой операции шифрования. Он не секретный — его можно хранить открыто рядом с шифротекстом (что и делается: `iv + encrypted_data`).

Функция `decrypt_message` уже была написана правильно — читала IV из первых 16 байт. Поэтому формат хранения не изменился, только исправлено место генерации IV.

---

## 2. Двойное хеширование паролей: SHA256 + bcrypt (`security.py`)

### Было
```python
import bcrypt
import hashlib
import bcrypt  # дубликат!
from pydantic.networks import import_email_validator  # не используется!

def hash_password(password: str) -> str:
    pass_hash = hashlib.sha256(password.encode()).digest()  # SHA256 сначала
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pass_hash, salt)                 # потом bcrypt
    return hashed.decode('utf-8')

def verify_password(password: str, hashed_password: str) -> bool:
    pass_hash = hashlib.sha256(password.encode()).digest()
    return bcrypt.checkpw(pass_hash, hashed_password.encode('utf-8'))
```

### Стало
```python
import bcrypt

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
```

### Почему SHA256 перед bcrypt — это ошибка

**Как работает bcrypt:**

bcrypt — это алгоритм хеширования, спроектированный специально для паролей. Его три ключевых свойства:

1. **Медленный намеренно** — вычисление занимает ~100ms. Brute-force перебор становится нереальным.
2. **Встроенная соль** — каждый хеш включает случайную соль, защищая от Rainbow Tables.
3. **Настраиваемая стоимость** — параметр `rounds` увеличивает время при росте мощности железа.

**Что делает SHA256 перед bcrypt:**

SHA256 — детерминированная, быстрая хеш-функция без соли. Когда ты делаешь:
```python
pass_hash = hashlib.sha256(password.encode()).digest()  # bytes, не str
bcrypt.hashpw(pass_hash, salt)
```

bcrypt получает **бинарный хеш фиксированной длины** вместо пароля. Это создаёт несколько проблем:

**Проблема 1 — усечение паролей bcrypt:**
bcrypt внутренне ограничивает вход 72 байтами. Длинные пароли тихо обрезаются. Пример:
```
"мой_очень_длинный_пароль_из_100_символов"
"мой_очень_длинный_пароль_из_100_символов_и_ещё_что-то"
# Оба дадут одинаковый хеш bcrypt — они "равны" с точки зрения входа
```
SHA256 даёт всегда 32 байта — это решало ограничение, но неправильным способом.

**Проблема 2 — снижение энтропии:**
SHA256 — детерминированная функция. Если атакующий знает, что ты применяешь SHA256 перед bcrypt (security through obscurity — плохая защита), он может:
- Предвычислить SHA256 от словаря паролей
- Скормить результаты в bcrypt-крекер
- Это быстрее, чем атаковать bcrypt напрямую

**Проблема 3 — семантическая ошибка:**
SHA256 возвращает `bytes`. bcrypt принимает `bytes`, но ожидает кодированный пароль. Передавая `digest()`, ты передаёшь бинарный хеш — bcrypt не знает, что это уже хеш, и всё равно применяет свою соль и итерации. Работает, но непредсказуемо.

**Правило**: bcrypt нужно передавать **сам пароль** в виде байт. bcrypt сам обработает его правильно.

---

## 3. Замена SECRET_KEY (`.env`)

### Было
```
SECRET_KEY=benzin
```

### Стало
```
SECRET_KEY=5ede207a9abbc82660b51183954ca463ebd9dc4b73eed3dc6bd3fdae69ab0d14
```

Сгенерирован через `secrets.token_hex(32)` — 64 hex-символа = 256 бит энтропии.

### Почему "benzin" — это катастрофа

JWT (JSON Web Token) подписывается SECRET_KEY через HMAC-SHA256. Если ты знаешь ключ — можешь подписать **любой токен** с любым `user_id`.

```python
# Атака: создать токен для user_id=1 (предположительно admin)
import jwt
fake_token = jwt.encode({"sub": "1", "type": "access"}, "benzin", algorithm="HS256")
# Этот токен примет сервер как валидный
```

Слова из словаря ломаются за секунды. `secrets.token_hex(32)` даёт 2²⁵⁶ вариантов — перебор невозможен в пределах возраста вселенной.

---

## Важно: сброс данных после исправлений

### Пароли пользователей
Старые хеши в БД были созданы через `SHA256 → bcrypt`. Новый код хеширует напрямую через `bcrypt`. Существующие пользователи **не смогут войти** — `verify_password` вернёт `False`.

**Решение:** Очисти таблицу пользователей и зарегистрируйся заново, или добавь временную миграционную логику.

### Зашифрованные сообщения
Смена `SECRET_KEY` меняет AES-KEY (`settings.secret_key.encode().ljust(32)[:32]`). Все сообщения в БД зашифрованы старым ключом — `decrypt_message` вернёт `[Ошибка расшифровки]`.

**Решение для dev:** Очисти таблицу `message`. Для продакшна — нужна процедура ре-шифрования с миграцией.

---

## Также убрано из `security.py`

| Удалено | Причина |
|---|---|
| `import bcrypt` (дубликат, строка 3) | Дублирующийся импорт |
| `import hashlib` | Больше не нужен |
| `from pydantic.networks import import_email_validator` | Нигде не использовался |
| `from passlib.context import CryptContext` | Не использовался |
