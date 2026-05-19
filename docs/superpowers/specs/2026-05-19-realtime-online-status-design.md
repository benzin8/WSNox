# Real-time online status — design spec

**Дата:** 2026-05-19
**Цель:** Заменить ручной строковый `status` в профиле на реальное вычисляемое присутствие на основе WebSocket-коннекта.

## Контекст

Сейчас `profiles.status` — строковое поле (`"Online" | "Offline" | "Не беспокоить" | "Недоступен"`), которое пользователь редактирует руками в `EditProfileModal`. Это ручной выбор, не отражающий реальное подключение. В `ConnectionManager.active_connections` есть точный источник правды о том, кто подключён к WebSocket, но он нигде не используется для статуса. В `ChatList` стоит TODO-комментарий `Online status indicator placeholder` — индикатора нет.

## Цель

- Online/offline вычисляется автоматически из факта активного WebSocket-коннекта и активности вкладки (Page Visibility).
- Никакого `last_seen` — только бинарный online/offline.
- Ручной контроль остаётся **только** для двух режимов: `dnd` (видим online + значок «не беспокоить») и `invisible` (для других всегда offline).
- Стандартный режим — `presence_preference = NULL`, online/offline полностью автоматически.

## 1. Модель данных

### Изменения в `profiles`

`status` → `presence_preference`:

```python
presence_preference: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
```

Домен значений: `NULL | "dnd" | "invisible"`. Любое другое значение отклоняется на уровне Pydantic.

### Миграция Alembic

`ALTER COLUMN status RENAME TO presence_preference`, тип меняется на `VARCHAR(20)`, дефолт `NULL`. Конвертация существующих данных:

- `"Не беспокоить"` → `"dnd"`
- Все остальные значения (`"Online"`, `"Offline"`, `"Недоступен"`, кастомные строки) → `NULL`

## 2. Источник правды: Redis

Один ключ на пользователя:

```
presence:{user_id}  →  "1"   (значение неважно, важен сам факт существования)
TTL: 60 секунд
```

### Операции

| Триггер | Действие |
|---|---|
| WS connect (после успешной auth) | `SETEX presence:{user_id} 60 "1"`; если ключа до этого не было → broadcast online |
| Heartbeat `{type: "ping"}` от клиента | То же: `SETEX presence:{user_id} 60 "1"`; broadcast online только если ключа не было |
| WS disconnect (graceful) | Если это был последний сокет user в `active_connections` → `DEL presence:{user_id}` + broadcast offline |
| Sweeper: ключ протух, но сокет ещё в `active_connections` | broadcast offline один раз (отметить в `offline_broadcasted` чтоб не дублировать) |

`SETEX` всегда переписывает ключ заново — это решает multi-tab корректно и идемпотентно для resume-сценария (вернулся из фона → следующий ping создаёт ключ).

### Чтение

```python
async def is_visible_online(viewer_id: int, target_user_id: int, pref: str | None, redis) -> bool:
    if target_user_id == viewer_id:
        return True
    if pref == "invisible":
        return False
    return bool(await redis.exists(f"presence:{target_user_id}"))
```

### Sweeper

Background-таск, запускается в `lifespan` FastAPI. Замечает, что ключ протух (клиент перестал пинговать — ушёл в фон/потерял сеть), но сокет ещё в `active_connections`. Шлёт broadcast offline один раз; **не закрывает сокет** — он может быть жив (просто tab в фоне), и через него ещё нужно доставлять входящие сообщения.

```python
async def sweep_presence():
    while True:
        await asyncio.sleep(10)
        for user_id in list(manager.active_connections.keys()):
            key_alive = await redis.exists(f"presence:{user_id}")
            if not key_alive and user_id not in manager.offline_broadcasted:
                await broadcast_presence_change(user_id, online=False)
                manager.offline_broadcasted.add(user_id)
            elif key_alive:
                manager.offline_broadcasted.discard(user_id)
```

`offline_broadcasted: Set[int]` — поле `ConnectionManager`, чтобы не спамить событиями. На следующий ping ключ возродится → sweeper уберёт user_id из set → ping-handler сам пошлёт broadcast online.

Sweeper НЕ определяет онлайн (это делает Redis TTL) и НЕ закрывает сокеты. Реальное закрытие зомби-сокетов происходит лениво: при попытке `send_json` в `pubsub_listener` — упадёт исключение, сокет удалится из `active_connections`.

## 3. WS-протокол

### От клиента к серверу

```js
{ type: "ping" }   // heartbeat, каждые 30 сек если вкладка visible
```

Других новых типов нет. `visibilitychange` обрабатывается чисто на клиенте — start/stop heartbeat-интервала. Сервер о состоянии вкладки знает только через факт «приходят ли пинги».

Поведение сервера на `ping`:
```python
async def handle_ping(user_id: int) -> None:
    key = f"presence:{user_id}"
    existed = await redis.exists(key)
    await redis.setex(key, 60, "1")
    if not existed:
        manager.offline_broadcasted.discard(user_id)
        await broadcast_presence_change(user_id, online=True)
```

### От сервера к клиенту

```js
{ type: "presence", user_id: 42, online: true }
{ type: "presence", user_id: 42, online: false }
```

### Redis pub/sub

Новый канал `presence_events` с payload `{"user_id": int, "online": bool}`.

Отдельный listener (не мешать с `pubsub_listener` для `chat_messages`) — каждый listener делает одно дело. Запускается отдельной asyncio task в lifespan.

### Кому броадкастить

При изменении presence у user 42 событие получают только те, у кого 42 есть в `chat_members`. Используется `ChatCRUD.get_chat_partners(user_id=42)` (новый метод) → список user_id. Для каждого получателя: если он есть в `active_connections` локального воркера — `send_json` каждому из его сокетов.

## 4. REST API

### Изменения в `UserProfileResponse`

```python
class UserProfileResponse(BaseModel):
    user_id: int
    username: str
    name: str
    phone_number: str | None
    display_name: str | None
    bio: str | None
    presence_preference: Literal["dnd", "invisible"] | None
    online: bool
    profile_photos: list
```

Поле `status` удалено. Это намеренный breaking change — фронт обновляется в той же ветке.

### Маскировка `presence_preference` для других

`/profiles/{user_id}` для `user_id != current_user.id`: если `presence_preference == "invisible"` → возвращаем `null`. Это скрывает факт настройки невидимки. Для `current_user.id == user_id` (свой профиль) — возвращаем настоящее значение.

`"dnd"` не маскируется — собеседник должен видеть значок «не беспокоить».

### `PUT /profiles/me`

Принимает поле `presence_preference: Literal["dnd", "invisible"] | None`. Pydantic валидация отклоняет любое другое значение.

### Новый эндпоинт: батч-снимок

```
GET /chats/presence
Authorization: Bearer <token>

→ 200 OK
{ "online_user_ids": [12, 47, 89] }
```

Возвращает user_id всех собеседников из `chat_members` текущего пользователя, у которых:
1. Ключ `presence:{id}` существует в Redis
2. `presence_preference != "invisible"` (невидимок исключаем)

Реализация: один SQL-запрос для partners → Redis `pipeline` с `EXISTS` для каждого → фильтр.

## 5. Frontend

### Новый hook `usePresence(socketRef, isConnected, lastPresenceEvent)`

Файл: `src/messenger/frontend_react/src/hooks/usePresence.js`.

Использует `axios` (как все остальные REST-хуки в проекте).

Ответственность:

1. **Initial snapshot.** После `isConnected === true` делает `GET /chats/presence`, заполняет `onlineUsers: Set<number>`.
2. **Heartbeat.** Когда `isConnected === true` И `document.visibilityState === "visible"` — запускает `setInterval(ws.send({type:"ping"}), 30000)` и сразу шлёт первый ping (без ожидания 30 сек). Чистит при unmount/смене состояния.
3. **Page Visibility.** Слушает `visibilitychange`:
   - `visible` → start heartbeat (немедленный ping + интервал)
   - `hidden` → stop heartbeat (никакого сообщения серверу не шлёт; ключ протухнет через 60 сек, sweeper заметит)
4. **Применение presence-событий.** Подписан на `lastPresenceEvent` из `useChatSocket`. На событие `{type:"presence", user_id, online}` — обновляет `onlineUsers` (add/delete).

Возвращает `{ onlineUsers }` — Set<number>.

### Изменения в `useChatSocket`

В `ws.onmessage` появляется ветка для `data.type === "presence"` — не кладёт в `messages`, ставит `setLastPresenceEvent(data)`. Хук возвращает `lastPresenceEvent` дополнительно.

### Изменения в компонентах

**`ChatList.jsx`** — индикатор на аватарке собеседника, если `onlineUsers.has(chat.user_id)`:

```jsx
<span className="absolute bottom-0 right-0 w-3 h-3 bg-lime-400 rounded-full border-2 border-zinc-900" />
```

(абсолютным позиционированием снизу-справа от аватара)

**`ChatWindow.jsx`** (header) — текст «в сети» / «не в сети» рядом с именем + значок DND если у собеседника `presence_preference === "dnd"`:

```jsx
<span className={isOnline ? "text-lime-400" : "text-zinc-500"}>
    {isOnline ? "в сети" : "не в сети"}
</span>
{otherUser.presence_preference === "dnd" && <BellOff size={14} className="text-amber-400" />}
```

**`ProfileModal.jsx`** — заменить сравнение `profile.status === "Online"` на `profile.online` (bool из API). Бейдж DND по `profile.presence_preference === "dnd"`.

**`EditProfileModal.jsx`** — заменить `STATUS_OPTIONS` на:

```js
const PRESENCE_OPTIONS = [
    { value: null,        label: "Обычный" },
    { value: "dnd",       label: "Не беспокоить" },
    { value: "invisible", label: "Невидимка" },
];
```

Поле в форме называется `presence_preference`, отправляется в `PUT /profiles/me`.

## 6. Архитектурные изменения

### `ConnectionManager.active_connections: Dict[int, Set[WebSocket]]`

Сейчас `Dict[int, WebSocket]` — открытие второй вкладки затирает первую в dict, старый сокет повисает зомби. Меняем на `Set[WebSocket]`:

- `connect` — `setdefault(user_id, set()).add(ws)`
- `disconnect(ws, user_id)` — `discard(ws)`; если set опустел — `del active_connections[user_id]` + `DEL presence:{user_id}` + broadcast offline
- В `pubsub_listener` (chat) — `send_json` каждому сокету в set

Это вытаскивает заодно старую проблему чат-маршрутов: сейчас сообщения доставляются только последней открытой вкладке. После фикса — всем.

### Reconnect на клиенте

`useChatSocket` дополняется логикой reconnect:

```js
ws.onclose = (event) => {
    setIsConnected(false);
    if (!event.wasClean && !manualClose) {
        scheduleReconnect();  // backoff 2/4/8/16/30 сек, потолок 30
    }
};
```

Без этого после смены сети или сна устройства клиент остаётся вечно offline.

## 7. Edge cases

| Случай | Поведение |
|---|---|
| Несколько вкладок одного юзера | `Set[WebSocket]`. Любая активная вкладка пингует — общий ключ живёт. Когда последний сокет закрывается → `DEL` + broadcast offline |
| Одна из двух вкладок ушла в фон | Вторая (visible) продолжает пинговать → ключ живёт → пользователь остаётся online. Корректно. |
| Все вкладки ушли в фон | Никто не пингует → ключ протухает за 60 сек → sweeper шлёт broadcast offline. Сокеты остаются открытыми — можно доставлять входящие сообщения |
| Вкладка вернулась из фона | Первый ping создаёт ключ заново → broadcast online |
| Network drop без graceful close | Аналогично «все в фоне»: ключ протухает за 60 сек → sweeper broadcast offline. Сокет закроется лениво при следующей попытке `send_json` |
| Reconnect после потери сети | Backoff 2/4/8/16/30 сек, восстанавливает presence через новый WS connect |
| Гонка snapshot ↔ broadcast | Snapshot дёргается после `auth_ok`, который сервер шлёт после `SETEX + broadcast` — любые broadcast'ы, случившиеся параллельно с snapshot-запросом, прилетают на уже-подключённый WS |
| Невидимка видит себя | `if target == viewer: return True` в `is_visible_online` |
| Шапка чата для невидимки | Текст «не в сети». DND-значок не показывается (маскируется в API) |
| Рестарт бэкенда | Redis-ключи протухнут сами через 60 сек, клиенты переподключатся и поставят новые |
| Worst-case задержка offline | До 60 сек (TTL) + 10 сек (sweeper) ≈ 70 сек при тихом обрыве |

## 8. Тесты

Backend (`tests/`):

- `test_presence_set_on_connect` — после WS-auth ключ `presence:{user_id}` есть в Redis
- `test_presence_deleted_on_disconnect` — после `WebSocketDisconnect` последнего сокета ключ удалён
- `test_presence_ttl_renewed_on_ping` — `{type:"ping"}` обновляет TTL ключа
- `test_ping_recreates_key_and_broadcasts` — если ключ отсутствует, ping создаёт его и шлёт broadcast online
- `test_invisible_returns_offline_to_others` — viewer != target, pref="invisible" → online=False
- `test_invisible_returns_online_to_self` — viewer == target, pref="invisible" → online=True
- `test_presence_preference_masked_for_others` — `/profiles/{id}` другому возвращает `presence_preference=null`, если у target `"invisible"`
- `test_dnd_does_not_affect_online` — pref="dnd" + ключ в Redis есть → online=True
- `test_chat_presence_endpoint_returns_only_online_visible_partners` — батч-эндпоинт исключает offline и invisible
- `test_multi_tab_keeps_presence_until_last_closes` — две вкладки, одна закрывается, presence остаётся, вторая закрывается → DEL + broadcast offline
- `test_sweeper_broadcasts_offline_once_when_key_expires` — sweeper не дублирует broadcast offline; после restoration сбрасывает state

Frontend — без новых тестов (в проекте сейчас нет фронтового test runner). Smoke-проверка вручную: открыть два браузера, проверить что точки появляются/исчезают real-time.

## 9. Изменяемые файлы

### Backend

| Файл | Что |
|---|---|
| `alembic/versions/<new>.py` | Миграция: status → presence_preference + конвертация значений |
| `src/messenger/backend/models/profile.py` | Поле `presence_preference: str \| None` |
| `src/messenger/backend/app/crud/profile.py` | Использовать новое имя поля |
| `src/messenger/backend/app/crud/chat.py` | Новый метод `get_chat_partners(user_id) -> list[int]` |
| `src/messenger/backend/app/api_v1/schemas/user.py` | `UserProfileResponse` без `status`, с `online`, `presence_preference: Literal[...] \| None`; `ProfileUpdate` принимает только новый домен |
| `src/messenger/backend/app/api_v1/routers/profile_router.py` | Вычисление `online` через Redis, маскировка `presence_preference` для других |
| `src/messenger/backend/app/api_v1/routers/chat_router.py` | Новый эндпоинт `GET /chats/presence` |
| `src/messenger/backend/app/ws/router.py` | `Dict[int, Set[WebSocket]]`, обработка `ping`, SETEX/DEL в Redis на connect/disconnect, broadcast в `presence_events` |
| `src/messenger/backend/app/ws/presence.py` (новый) | Отдельный pub/sub listener для `presence_events`, sweeper-таск, `broadcast_presence_change`, `offline_broadcasted` set |
| `src/messenger/backend/app/main.py` | Запуск presence-listener и sweeper в `lifespan` |

### Frontend

| Файл | Что |
|---|---|
| `src/messenger/frontend_react/src/hooks/usePresence.js` (новый) | Heartbeat, Page Visibility, snapshot, применение событий |
| `src/messenger/frontend_react/src/hooks/useChatSocket.js` | Ветка для `type=="presence"`, `lastPresenceEvent`, reconnect с backoff |
| `src/messenger/frontend_react/src/components/chat/ChatList.jsx` | Зелёная точка на аватарке |
| `src/messenger/frontend_react/src/components/chat/ChatWindow.jsx` | «в сети» / «не в сети» + значок DND |
| `src/messenger/frontend_react/src/components/profile/ProfileModal.jsx` | `profile.online` вместо `status === "Online"` |
| `src/messenger/frontend_react/src/components/profile/EditProfileModal.jsx` | Селект «Обычный / Не беспокоить / Невидимка» |
| `src/messenger/frontend_react/src/pages/chat/ChatPage.jsx` | Подключить `usePresence`, прокинуть `onlineUsers` в `ChatList`/`ChatWindow` |

## 10. Что не входит в этот спек

- `last_seen_at` и «был(а) недавно» — отвергнуто на этапе брейнсторма (только online/offline).
- Push-уведомления при появлении собеседника в сети.
- Typing indicator («печатает...»). Отдельная фича, использует похожую инфру (Redis + WS broadcast), но не пересекается с presence.
- Idle detection через `mousemove`/`keydown` (более тонкое, чем Page Visibility). Пока ограничиваемся только active-tab.
- Online-индикатор для авторов сообщений в истории чата. Только для собеседника в шапке и для аватарок в ChatList.
