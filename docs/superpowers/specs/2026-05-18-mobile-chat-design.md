# Mobile Chat Adaptation — Design Spec

## Goal

На мобильных устройствах (< 768px) показывать список чатов и окно чата поочерёдно, как в Telegram: выбор чата сдвигает список влево и показывает окно, кнопка "назад" возвращает к списку. На десктопе (≥ md) поведение не меняется.

## Scope

Два файла:
- `src/messenger/frontend_react/src/pages/chat/ChatPage.jsx`
- `src/messenger/frontend_react/src/components/chat/ChatWindow.jsx`

## State

В `ChatPage` добавляется один стейт:

```js
const [mobileView, setMobileView] = useState('list'); // 'list' | 'chat'
```

- При вызове `handleSelectChat` — `setMobileView('chat')`
- Кнопка "назад" в `ChatWindow` вызывает `onBack` → `setMobileView('list')`
- На десктопе стейт не влияет на отображение (Tailwind `md:` классы оверрайдят)

## Layout

### Контейнер (замена `flex flex-1 overflow-hidden`)

```
relative flex-1 overflow-hidden md:flex
```

На мобильном — `relative`-контейнер для абсолютно позиционированных панелей.  
На десктопе — flex-ряд, как сейчас.

### Sidebar

```
absolute inset-y-0 left-0 w-full z-10
flex flex-col bg-zinc-900/50 backdrop-blur-xl border-r border-zinc-800
transition-transform duration-200 ease-in-out
[mobileView === 'list' ? 'translate-x-0' : '-translate-x-full']
md:relative md:inset-auto md:w-80 md:translate-x-0
```

### ChatWindow wrapper (новый div вокруг `<ChatWindow>`)

```
absolute inset-y-0 left-0 w-full
transition-transform duration-200 ease-in-out
[mobileView === 'chat' ? 'translate-x-0' : 'translate-x-full']
md:relative md:inset-auto md:flex-1 md:translate-x-0
```

## Back Button (ChatWindow)

Добавляется `onBack` prop. В хедере `ChatWindow`, перед аватаром собеседника:

```jsx
<button onClick={onBack} className="md:hidden mr-2 text-zinc-400 hover:text-lime-400 transition-colors">
  <ChevronLeft size={24} />
</button>
```

`ChevronLeft` — из `lucide-react` (уже используется в проекте).

## Transition

`duration-200 ease-in-out` — быстрый, не резкий слайд. Обе панели всегда в DOM, только смещаются через `transform`, без `display:none` — нет лишних remount.

## Edge Cases

- **Ресайз с мобильного на десктоп** при открытом чате: на десктопе оба блока видны через `md:` классы, стейт не важен — всё корректно.
- **Модалки** (ProfileModal, EditProfileModal) остаются вне слайдера — рендерятся в `ChatPage` как overlay поверх всего, z-index не конфликтует.
- **Баннер** телефона — над контейнером, не затронут.
