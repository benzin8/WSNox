# Белый/чёрный экран у вернувшихся юзеров после деплоя

## Проблема

Юзер, заходивший на сайт пару дней/недель назад, открывает `https://wsnox.urldot.ru/` — и видит белый или чёрный экран. На свежих устройствах всё работает, у самого автора всё тоже работает. Devtools у пострадавшего показывают 404 на `/assets/index-XXXXXXXX.js`.

## Причина

nginx отдавал `index.html` **без `Cache-Control`** заголовка — только `etag` и `last-modified`. Браузер кеширует HTML по эвристике (≈ 10% от возраста `last-modified`) — для давно не менявшегося файла это часы, иногда дни.

Vite на каждый билд генерирует **новые имена ассетов с content-hash**: `index-CrbBcwdG.js`, `index-WN7l5yDg.css` и т.д. `index.html` ссылается на актуальные хеши. Если юзер сидит на старой кешированной версии `index.html` после деплоя:

1. Браузер из кеша берёт старый `index.html`.
2. Внутри ссылка на `assets/index-СТАРЫЙ.js`, которого на сервере уже нет (новый билд = новые хеши, старые файлы исчезают из `dist/`).
3. 404 на JS → React не монтируется → пустой `<div id="root">` → белый/чёрный экран (зависит от системной темы и/или `bg-zinc-950` на `body`).

### Что **не** виноват

- **Service worker** — `public/sw.js` минимальный, обрабатывает только `push` и `notificationclick`, никакого `fetch`-перехвата и никаких caches. SW не мог закешировать старый код.
- **ErrorBoundary** — стоит и при поимке React-ошибки умеет даже `unregister` SW и предложить reload. Но если React вообще не загрузился (JS не пришёл), Boundary тоже не отрендерится.

## Исправление

Заведена политика трёх классов кеширования в `nginx/wsnox.conf` и `nginx/wsnox.dev.conf`:

| URL | `Cache-Control` | Почему |
|---|---|---|
| `/` и SPA-роуты (`/chat`, `/auth/*` и т.д.) | `no-cache` | `index.html` пересобирается каждый деплой с новыми хешами — кеш всегда переспрашиваем |
| `/assets/index-XXXX.{js,css}` | `public, max-age=31536000, immutable` | Имя файла = хеш контента → новый билд = новый URL, старый — гарантированно неизменный, можно кешировать год |
| `/sw.js` | `no-cache` | Новый SW должен моментально вытеснить старый — без шанса залипнуть в кеше |

Конкретно — добавлены два `location`-блока **перед** catch-all:

```nginx
location /assets/ {
    proxy_pass http://backend:8000;
    # ... proxy headers ...
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location = /sw.js {
    proxy_pass http://backend:8000;
    # ... proxy headers ...
    add_header Cache-Control "no-cache" always;
}

location / {
    proxy_pass http://backend:8000;
    # ... proxy headers ...
    add_header Cache-Control "no-cache" always;
}
```

Модификатор `always` обязателен — без него `add_header` не применяется к error-ответам (4xx/5xx), и сломанный кеш может пережить даже неудачную загрузку.

## Как разовый-фикс прямо сейчас

Юзеру, у которого уже залип старый кеш:

| Платформа | Что сделать |
|---|---|
| Chrome / Edge / Firefox (desktop) | F12 → Network → ✅ Disable cache → F5. Или Ctrl+Shift+R (hard reload) |
| Safari (Mac) | Cmd+Shift+R |
| Safari (iPhone) | Настройки → Safari → Дополнения → Данные сайтов → найти `wsnox.urldot.ru` → удалить |
| PWA на home screen iOS | Удалить значок и установить заново (через «Поделиться» → «На экран Домой») |
| Грубо для всех | Открыть ссылку с любым query-параметром: `https://wsnox.urldot.ru/?v=новое` |

После одного hard-reload браузер скачает свежий `index.html` уже с `no-cache` — и больше никогда не залипнет.

## Тонкости

- **Когда добавишь CDN или Cloudflare** — проверь что edge-кеш уважает `Cache-Control` от origin. Иначе HTML может застрять на edge-кеше (на минуты-часы) при тех же симптомах.
- **Кеш браузера ≠ кеш SW**. Если в будущем SW обзаведётся `fetch`-handler с собственным caches — этот фикс не поможет. SW-cache обходится только через `caches.delete()` или unregister SW (что уже умеет `ErrorBoundary` при поимке ошибки).
- **Vite-конвенция нагло использована.** Если рефакторишь сборку (vue-cli, webpack-конфиг без content-hash в `output.filename`) — `immutable` на `/assets/` перестанет быть безопасным, кеш будет показывать старое.

## Файлы

| Слой | Где |
|---|---|
| Prod nginx | `nginx/wsnox.conf` |
| Dev nginx | `nginx/wsnox.dev.conf` |
| ErrorBoundary (страховка) | `src/messenger/frontend_react/src/components/ErrorBoundary.jsx` |
| Service worker | `src/messenger/frontend_react/public/sw.js` |

Внедрено в коммите `5ee0fe6` (2026-05-30).
