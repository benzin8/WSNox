# CORS и относительные URL

## Проблема

При доступе к приложению через публичный тоннель (localhost.run, cloudflare tunnel и т.д.) с других устройств браузер блокировал запросы с ошибкой:

```
Access to XMLHttpRequest at 'http://127.0.0.1:8000/auth/send-code'
from origin 'https://xxxx.lhr.life' has been blocked by CORS policy
```

**Причина:** фронтенд был собран с захардкоженными URL вида `http://127.0.0.1:8000` в переменных окружения Vite. При открытии с другого устройства браузер пытался обратиться к `127.0.0.1:8000` — своему локальному адресу, а не к серверу.

## Исправление

### 1. Относительные API URL

Все файлы, использующие `VITE_API_BASE_URL`, теперь фолбэкают на пустую строку:

```js
// было
const API_BASE = import.meta.env.VITE_API_BASE_URL;

// стало
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
```

Пустая строка означает, что запросы идут на тот же хост, с которого загружен фронт. Поскольку FastAPI сам отдаёт React-сборку, адрес всегда совпадает автоматически.

### 2. Относительный WebSocket URL

Аналогичный фикс в `useChatSocket.js`:

```js
const WS_BASE = import.meta.env.VITE_WS_BASE_URL ||
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
```

### 3. CORS middleware

`allow_origins=["*"]` с `allow_credentials=False` — разрешает запросы с любого origin. Подходит для dev/self-hosted. JWT передаётся через `Authorization` заголовок, который не зависит от credentials.

### 4. Переменные окружения фронта

`src/messenger/frontend_react/.env`:
```
VITE_API_BASE_URL=
VITE_WS_BASE_URL=
```

Пустые значения — Vite передаёт `undefined`, фолбэк срабатывает автоматически.

## Почему это работает

FastAPI монтирует React-сборку как статику и сам обслуживает все запросы. Фронт и бэк живут на одном домене — относительные URL всегда указывают куда надо, независимо от того, через какой тоннель или хост открыто приложение.
