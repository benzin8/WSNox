# WSNox Energy Transition — повышение совпадения с прототипом

## Контекст

В `~/Downloads/design_handoff_wsnox/prototype-flow.jsx` — эталонная
реализация перехода auth → chat с лаймовым шаром «энергии». Текущая
реализация в `feature/auth-glow` (коммиты `c9774ba`, `ce7ce04`, `10e6f33`)
отличается от эталона в нескольких местах, из-за чего эффект «как в
Claude Design» не достигнут.

## Цель

Воспроизвести анимацию энергии auth → chat максимально близко к
`prototype-flow.jsx`, сохраняя текущий React Router и chat-логику.
Карточка авторизации должна уезжать в даль (уже сделано через
`AuthCardWrapper`), шар должен быть виден в центре карточки сразу
при заходе на любую auth-страницу, плавно раздуваться при submit и
оседать в правом верхнем углу чата.

## Архитектура

EnergyOrb смонтирован один раз на уровне `App.jsx` — он переживает
переходы между маршрутами и анимируется через CSS-transition между
фазами. Сами страницы (auth и chat) рулят локальной видимостью
через `useEnergy().orb.phase`.

```
App
├── EnergyProvider
│   ├── EnergyOrb (fixed, переживает navigate)
│   └── Routes
│       ├── /auth/* → AuthBackdrop + AuthCardWrapper + form
│       └── /chat → ChatPage (фейдится при mount из transit)
```

## Фазы и параметры (из прототипа)

| phase       | x    | y   | size | opacity | blur | duration |
|-------------|------|-----|------|---------|------|----------|
| `auth`      | 50   | 50  | 520  | 0.18    | 120  | 800      |
| `transit`   | 50   | 50  | 1900 | 0.22    | 200  | 1100     |
| `chat-idle` | 72   | 32  | 620  | 0.15    | 140  | 900      |
| `chat-rnd`  | 30..90 | 18..82 | 480..900 | 0.13..0.23 | 130..170 | 1000 |

## Триггеры фаз

1. **Mount любой auth-страницы** → `enterAuth()` → шар виден в центре
   карточки с opacity 0.18.
2. **Submit/Skip на LoginPage/RegisterPage** → `beginTransit()` →
   `setTimeout(950)` → `navigate('/chat')`. AuthCardWrapper параллельно
   фейдит карточку (opacity 0, scale 0.92, blur 8px, 600ms).
3. **Mount ChatPage** → шар остаётся в фазе `transit` (виден поверх).
   Внешний слой ChatPage фейдится из (opacity 0, scale 1.04) →
   `useEffect` → `settleInChat()` → фаза `chat-idle`, шар сжимается и
   уезжает в правый верх, чат-слой фейдится in (700ms ease 200ms).
4. **Клик по чату в ChatList** → `randomInChat()` → шар прыгает в
   случайное место.

## Изменения по файлам

| Файл | Что меняем |
|------|------------|
| `App.jsx` | div фон `bg-zinc-900` → `bg-zinc-950` (без промелька в момент navigate) |
| `features/energy/EnergyProvider.jsx` | INITIAL state — параметры фазы `auth` (см. таблицу); добавить метод `enterAuth()` который ставит те же значения (нужен для возврата на auth-страницы); в `beginTransit` duration 1100 вместо 950 |
| `features/energy/EnergyOrb.jsx` | zIndex всегда 0 (шар всегда под content; виден через прозрачный chat) |
| `pages/auth/SendCodePage.jsx`, `VerifyCodePage.jsx`, `LoginPage.jsx`, `RegisterPage.jsx` | `useEffect: enterAuth()` на mount |
| `pages/chat/ChatPage.jsx` | Обернуть корневой div в фазо-зависимый: при `phase === 'transit'` — opacity 0, transform scale(1.04); на `chat-idle` — opacity 1, transform scale(1). Inline style: `transition: 'opacity 700ms ease 200ms, transform 900ms cubic-bezier(.4,0,.2,1) 200ms'`. Pointer-events отключаем пока не chat-idle |
| `components/chat/ChatWindow.jsx` | Убрать `bg-zinc-950` с корневого div и empty-state div (заменить на `bg-transparent`); header уже `bg-zinc-950/90 backdrop-blur-md` — оставить |
| `components/chat/InputArea.jsx` | Уже `bg-zinc-950/50` — оставить |
| `pages/chat/ChatPage.jsx` корень | `bg-zinc-950` → `bg-zinc-950/0` или убрать (sidebar свой непрозрачный, chat-side прозрачный для тинта) |

## Что НЕ трогаем

- `ChatList` sidebar — фон остаётся непрозрачным.
- `AuthBackdrop` — уже работает корректно с нарастающим glow.
- `AuthCardWrapper` — fade уже реализован.
- Логика бэкенда / WebSocket / профили — не меняется.
- Существующие React Router маршруты — остаются.
- Демо-кнопка в empty-state — оставим (бэк теперь поднят, юзер
  зарегистрируется нормально).

## Особый случай: `RegisterPage` skip с dev-skip token

Skip кладёт фиктивный `dev-skip` токен. Бэк его отвергнет, но
ChatPage не упадёт — будет 401 на /profiles/me и /chats. UI
покажет пустое состояние (та же ветка, что для нового юзера без
чатов). Шар при этом всё равно осядет в правом верху, и демо-кнопка
будет работать. Это приемлемо — для теста анимации этого хватит.

## Спецификация поведения по фазам

```
   user opens   ┌──────┐  submit  ┌─────────┐  navigate  ┌──────────┐  click chat  ┌────────┐
   /auth/*  →   │ auth │ ───────→ │ transit │ ─────────→ │ chat-idle│ ───────────→ │chat-rnd│
               └──────┘          └─────────┘            └──────────┘              └────────┘
                opacity 0.18      size 1900             size 620                 random size
                viz: card+orb     card fades            chat fades in            orb teleports
```

Все переходы — CSS transition на `<EnergyOrb>` с duration из
текущей фазы. AuthCardWrapper и ChatPage обёртки — CSS transition
600ms (card) и 700ms+200ms delay (chat).

## Acceptance

1. На `/auth/send-code|verify|login|register` лаймовый шар сразу
   виден в центре карточки.
2. Клик «Войти/Зарегистрироваться/Пропустить» — шар раздувается за
   1100ms, карточка одновременно уезжает в даль за 600ms.
3. Через 950ms переход на /chat — шар плавно сжимается и уезжает в
   правый верх; чат-слой плавно появляется (sidebar+панель).
4. Клик по чату в списке — шар прыгает в случайное место в области
   чата с новым размером/яркостью.
5. На /chat шар виден как лаймовый тинт через прозрачный header
   и messages-area; sidebar — непрозрачный.

## Out of scope

- Single-page архитектура с phase-toggle внутри одного компонента
  (полный отказ от роутера).
- Делать ChatPage устойчивым к dev-skip токену — пользователь
  будет регистрироваться нормально через работающий бэкенд.
- Анимации reduced-motion — позже, если потребуется.
