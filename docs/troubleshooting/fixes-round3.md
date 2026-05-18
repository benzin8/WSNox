# Fixes Round 3: Auth Race, Infinite List, Profile Modal, Last Message, 404 on Refresh, Mobile Adaptation

## 1. Двойной сабмит форм (auth pages)

### Проблема

При быстром нажатии кнопки «Отправить» форма могла дважды отправить запрос. Первый — мог упасть с ошибкой из-за состояния гонки на сервере (например, код уже не активен при повторной проверке). Второй — проходил успешно. Пользователь видел ошибку, жал ещё раз и заходил.

Причина: `disabled={loading}` полагается на React re-render, который асинхронен. Между первым кликом и отрисовкой `disabled` кнопка остаётся кликабельной несколько миллисекунд.

### Файлы

- `src/messenger/frontend_react/src/pages/auth/SendCodePage.jsx`
- `src/messenger/frontend_react/src/pages/auth/VerifyCodePage.jsx`
- `src/messenger/frontend_react/src/pages/auth/LoginPage.jsx`
- `src/messenger/frontend_react/src/pages/auth/RegisterPage.jsx`

### Решение

Добавлен синхронный guard через `useRef` — срабатывает до любого re-render:

```jsx
const isSubmitting = useRef(false);

const handleSubmit = async (e) => {
  e.preventDefault();
  if (isSubmitting.current) return;   // ← блокирует повторный вызов
  isSubmitting.current = true;
  try {
    // ... fetch ...
  } finally {
    isSubmitting.current = false;
  }
};
```

---

## 2. Бесконечный список чатов в dev-режиме (`npm run dev`)

### Проблема

При запуске `npm run dev` список чатов заполнялся тысячами элементов. В консоли ошибок не было.

Причина: Vite proxy не был настроен для реальных backend-маршрутов. Запрос `GET /chats/` уходил на Vite, который возвращал HTML-строку `index.html` вместо JSON. В `ChatPage.jsx` был код:

```js
setChats(prev => [...prev, ...newChats]);
```

`[...htmlString]` — spread строки — разворачивает каждый символ HTML в отдельный элемент массива. Результат: тысячи символов в `chats`.

### Файл

`src/messenger/frontend_react/vite.config.js`

### Решение

Добавлены proxy-правила для всех backend-маршрутов:

```js
'/auth': {
    target: 'http://localhost:8000',
    changeOrigin: true,
    bypass: (req) => { if (req.method === 'GET') return '/index.html'; },
},
'/chats': { target: 'http://localhost:8000', changeOrigin: true },
'/profiles': { target: 'http://localhost:8000', changeOrigin: true },
'/chat': {
    target: 'ws://localhost:8000',
    ws: true,
    bypass: (req) => { if (req.headers.upgrade !== 'websocket') return '/index.html'; },
},
```

---

## 3. 404 при обновлении страницы в dev-режиме

### Проблема

После `F5` или прямого перехода по URL (например, `/auth/login`) Vite proxy перехватывал запрос, пробовал проксировать его на бэкенд и получал 404. Пользователь видел белый экран.

Причина: frontend и backend используют **одинаковые** префиксы путей (`/auth/...`, `/chat`). Proxy не мог отличить навигацию браузера от API-запроса.

### Решение

`bypass`-функции в конфиге Vite:

- `/auth` — все GET-запросы это навигация (API всегда POST). Возвращаем `'/index.html'`.
- `/chat` — навигация не несёт заголовок `upgrade: websocket`. Возвращаем `'/index.html'`.

---

## 4. Редактирование профиля — переполнение модалки и UX

### Проблема

- Кнопка «Подтвердить» для верификации телефона выходила за границы модального окна.
- Номер телефона можно было ввести без `+7`.
- Поля профиля и личных данных были в одном большом скролле.

### Файл

`src/messenger/frontend_react/src/components/profile/EditProfileModal.jsx`

### Решение

1. **Вкладки** — добавлен `activeTab` state (`'profile' | 'personal'`). Поля разделены между вкладками.
2. **Телефон всегда +7** — onChange handler:
   ```js
   if (!val.startsWith("+7")) setPhoneNumber("+7");
   else setPhoneNumber(val);
   ```
   Начальное значение: `profile?.phone_number || "+7"`.
3. **Кнопка подтвердить** — контейнер кода и кнопки изменён с `flex gap-2` на `flex flex-col gap-2`. Кнопка теперь под инпутом, не рядом.
4. **Модалка** — добавлено `max-h-[90vh] overflow-y-auto`.

---

## 5. Последнее сообщение и непрочитанные в списке чатов

### Проблема

В боковой панели отображалось только имя собеседника — без последнего сообщения и счётчика непрочитанных.

### Изменённые файлы

- `src/messenger/backend/app/crud/chat.py`
- `src/messenger/backend/app/api_v1/routers/chat_router.py`
- `src/messenger/backend/app/api_v1/schemas/chat.py`
- `src/messenger/backend/app/crud/message.py`
- `src/messenger/frontend_react/src/components/chat/ChatList.jsx`

### Решение (бэкенд)

**`get_chats` переписан** с оконной функцией `ROW_NUMBER()`:

```python
last_msg_subq = (
    select(
        Message.chat_id,
        Message.encrypted_data,
        Message.created_at.label("last_msg_time"),
        func.row_number().over(
            partition_by=Message.chat_id,
            order_by=Message.created_at.desc()
        ).label("rn")
    )
    .subquery()
)
last_msg_filtered = (
    select(last_msg_subq)
    .where(last_msg_subq.c.rn == 1)
    .subquery()
)

unread_subq = (
    select(
        Message.chat_id,
        func.count().label("unread_cnt")
    )
    .where(Message.recipient_id == user_id)
    .where(Message.is_read == False)
    .group_by(Message.chat_id)
    .subquery()
)
```

`ChatResponse` дополнен полями `last_message`, `last_message_time`, `unread_count`.

**`mark_as_read`** добавлен в `MessageCRUD` — вызывается при открытии чата:

```python
@staticmethod
async def mark_as_read(db: AsyncSession, chat_id: int, user_id: int) -> None:
    await db.execute(
        update(Message)
        .where(Message.chat_id == chat_id)
        .where(Message.recipient_id == user_id)
        .where(Message.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
```

### Решение (фронтенд)

В `ChatList.jsx` добавлен бейдж непрочитанных:

```jsx
{chat.unread_count > 0 && (
    <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-lime-400 flex items-center justify-center text-[10px] font-bold text-zinc-900">
        {chat.unread_count > 99 ? '99+' : chat.unread_count}
    </span>
)}
```

---

## 6. Мобильная адаптация чата (Telegram-style slide)

### Проблема

На мобильных устройствах список чатов и окно чата отображались одновременно и не помещались на экране.

### Изменённые файлы

- `src/messenger/frontend_react/src/pages/chat/ChatPage.jsx`
- `src/messenger/frontend_react/src/components/chat/ChatWindow.jsx`

### Решение

**`ChatPage.jsx`** — добавлен `mobileView` state:

```jsx
const [mobileView, setMobileView] = useState('list');

// При выборе чата
const handleSelectChat = (chat) => {
    // ... логика загрузки чата ...
    setMobileView('chat');
};
```

Контейнер с абсолютным позиционированием, CSS-translate для слайда:

```jsx
// Боковая панель
className={`absolute inset-y-0 left-0 w-full flex flex-col bg-zinc-900/50 backdrop-blur-xl
    border-r border-zinc-800 z-10 transition-transform duration-200 ease-in-out
    md:relative md:inset-auto md:w-80 md:translate-x-0
    ${mobileView === 'list' ? 'translate-x-0' : '-translate-x-full'}`}

// Окно чата
className={`absolute inset-y-0 left-0 w-full flex flex-col
    transition-transform duration-200 ease-in-out
    md:relative md:inset-auto md:flex-1 md:translate-x-0
    ${mobileView === 'chat' ? 'translate-x-0' : 'translate-x-full'}`}
```

**`ChatWindow.jsx`** — добавлена кнопка «Назад» (только на мобильных):

```jsx
<button
    onClick={() => onBack?.()}
    className="md:hidden text-zinc-400 hover:text-lime-400 transition-colors"
>
    <ChevronLeft size={24} />
</button>
```

На `md:` и выше — обычный flex-layout без slide-анимации, оба панели видны одновременно.

---

## Итого изменённых файлов

| Файл | Что изменено |
|---|---|
| `pages/auth/SendCodePage.jsx` | `useRef` guard против двойного сабмита |
| `pages/auth/VerifyCodePage.jsx` | `useRef` guard, `trim()`, `inputMode="numeric"` |
| `pages/auth/LoginPage.jsx` | `useRef` guard |
| `pages/auth/RegisterPage.jsx` | `useRef` guard |
| `vite.config.js` | Proxy для всех backend-маршрутов с `bypass`-функциями |
| `components/profile/EditProfileModal.jsx` | Вкладки, телефон с +7, кнопка под инпутом, `overflow-y-auto` |
| `crud/chat.py` | `get_chats` с оконной функцией + unread subquery |
| `routers/chat_router.py` | Распаковка 5-tuple, decrypt, `mark_as_read` |
| `schemas/chat.py` | `last_message`, `last_message_time`, `unread_count` |
| `crud/message.py` | `mark_as_read` |
| `components/chat/ChatList.jsx` | Бейдж непрочитанных |
| `pages/chat/ChatPage.jsx` | `mobileView` state + CSS translate layout |
| `components/chat/ChatWindow.jsx` | `onBack` prop + кнопка назад |
