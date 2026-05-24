# Уведомления

Четыре независимых канала + серверная фильтрация по правам и контексту. Всё устроено так, чтобы пуш не прилетел в активный чат, не нарушил mute и не разбудил телефон в режиме DND.

## Каналы

| Канал | Когда срабатывает | Как реализовано |
|-------|-------------------|------------------|
| **Звук** | Открытая вкладка с чатом | Web Audio API — тоны (Ding/Chime/Bell) синтезируются в `audio/tones.js`, без mp3. `audio/unlock.js` прогревает `AudioContext` на первый user gesture, чтобы обойти autoplay-policy |
| **Бейдж в `document.title`** | Неактивная вкладка | `useNotificationTitle` дописывает `(N)` к заголовку |
| **Browser Notification** | Любой стейт OS | `useNotificationDesktop` через Notification API. Скип, если чат активен и вкладка видима. Дедуп — через `tag: chat-<id>` |
| **Web Push (VAPID)** | Вкладка закрыта, телефон в фоне | Service worker `public/sw.js` + бэкенд-фоллбэк, если у получателя нет активных WebSocket |

Каждый канал отключается отдельно в настройках. Звук / browser / title-badge / push-подписка живут в `localStorage`; mute по чатам и глобальный DND — серверные (см. ниже).

## Push-флоу

1. На фронте `usePushSubscription` регистрирует SW, дёргает `Notification.requestPermission()`, подписывается через `PushManager.subscribe()` с публичным ключом из `GET /api/v1/push/vapid-public-key`.
2. `POST /api/v1/push/subscribe` сохраняет `endpoint + p256dh + auth` в таблицу `push_subscriptions`.
3. В `pubsub_listener` (бэкенд) при доставке сообщения: если у получателя нет ни одного активного WebSocket, вызывается `ConnectionManager._should_push(recipient_id, chat_id)` — если он вернул `True`, через `pywebpush` пуш улетает во все сохранённые подписки. Stale-эндпойнты (HTTP 410) удаляются автоматически.

## Серверная фильтрация (`_should_push`)

Пуш подавляется, если выполнено хотя бы одно:

- **Активный чат** — пользователь сейчас открыл именно этот чат. Источник истины — Redis-ключ `viewing:{user_id} = chat_id` с TTL 300 с. Ставится клиентом через WS-сообщение `{type: "viewing_chat", chat_id}` при открытии чата, обновляется на каждое переключение. TTL переживает короткие дисконнекты (блокировка экрана iOS) — без этого пуш приходил бы в чат, из которого юзер не выходил, просто потому что Safari подвесил сокет.
- **DND включён** — поле `profiles.notification_dnd` (boolean). Глобальный «не беспокоить» отдельно от `presence_preference` (тот скрывает онлайн-статус от других, см. [Онлайн-статус](online-status.md)).
- **Чат замьючен** — есть строка в `chat_mutes(user_id, chat_id)`.

Только если ни одно правило не сработало — `send_push_to_user`.

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/v1/notifications/preferences` | `{dnd: bool, muted_chats: [int], read_receipts_enabled: bool}` |
| PUT | `/api/v1/notifications/dnd` | `{enabled: bool}` |
| PUT | `/api/v1/notifications/chats/{chat_id}/mute` | `{muted: bool}` |
| GET | `/api/v1/push/vapid-public-key` | публичный ключ для подписки |
| POST | `/api/v1/push/subscribe` | сохранить эндпойнт подписки |
| DELETE | `/api/v1/push/subscribe` | отписаться |

## Конфигурация (env)

```env
VAPID_PUBLIC_KEY=...     # urlsafe-base64 без padding
VAPID_PRIVATE_KEY=...    # 32 байта urlsafe-base64
VAPID_MAILTO=mailto:admin@example.com
```

Без ключей бэкенд молча пропускает любой push, эндпойнт `vapid-public-key` отвечает 503.

Генерация:
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

## Фронтенд: миграция

Mute-список изначально жил в `localStorage`. При первом логине после серверной фичи `NotificationSettingsProvider` подтягивает `/preferences`, и если бэк пустой а локально что-то есть — однократно проливает локальный список через PUT. Флаг `wsnox.notifications.migratedToBackend` исключает повторную миграцию, если потом пользователь снимает мьют с другого устройства.

## iOS PWA

- `public/manifest.json` + meta-теги в `index.html` — обязательное pre-req для Web Push на iOS 16.4+
- `PushPromptModal` — через 600 мс после входа в `ChatPage` показывает «Включи уведомления», dismissible (`push_prompt_dismissed` в localStorage)
- На iOS Safari вне standalone вместо кнопки «Разрешить» — хинт «Поделиться → На экран Домой»
- iOS-детект в `features/notifications/utils/platform.js`

## Файлы

| Слой | Где |
|------|-----|
| Backend — фильтр | `src/messenger/backend/app/ws/router.py` (`ConnectionManager._should_push`) |
| Backend — viewing_chat | `src/messenger/backend/app/ws/viewing_chat.py` |
| Backend — prefs | `src/messenger/backend/app/api_v1/routers/notification_router.py`, `app/crud/notification.py` |
| Backend — модели | `src/messenger/backend/models/chat_mute.py`, `profiles.notification_dnd` |
| Backend — push | `src/messenger/backend/app/ws/push.py`, `app/api_v1/routers/push_router.py` |
| Frontend — UI | `src/messenger/frontend_react/src/features/notifications/` |
| Frontend — провайдер | `features/notifications/context/NotificationSettingsProvider.jsx` |
| Frontend — push subscription | `features/notifications/hooks/usePushSubscription.js` |
| Service worker | `src/messenger/frontend_react/public/sw.js` |

## Тесты

- `tests/test_viewing_chat.py` — Redis-хелпер: set/get/clear/TTL
- `tests/test_push_filtering.py` — `_should_push` под разными комбинациями viewing/DND/mute (с моками CRUD)
