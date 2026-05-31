# Дашборд основателя

Защищённая страница `/dashboard` с аналитикой WSNox. Доступна только юзерам с
`users.is_admin = true`.

## Доступ

- Колонка `users.is_admin BOOLEAN NOT NULL DEFAULT false`.
- Миграцией владелец (`visdima0102@gmail.com`) выставляется admin'ом.
- Добавить нового админа: `UPDATE users SET is_admin=true WHERE email='...';` (SQL вручную, через UI/API не выставляется — это сознательная защита от эскалации привилегий).
- В шапке chat-страницы у admin'а появляется лаймовая иконка «дашборд» (grid). Клик → `/dashboard`.

## Эндпойнты

| Метод | Путь | Auth | Возвращает |
|---|---|---|---|
| GET | `/api/admin/me` | любой залогиненный | `{is_admin: bool}` — для UI |
| GET | `/api/admin/stats` | `is_admin=true` (иначе 403) | 90-дневный `DashboardStats` |

Один запрос на `/stats` отдаёт всю аналитику. Фронт сам режет на 7/30 без перезапроса при переключении периода.

## Метрики (MVP)

| Метрика | Источник |
|---|---|
| Регистрации (total + per-day + дельты 7/30/90) | `users.created_at` |
| Сообщения (total + per-day + дельты 7/30/90) | `messages.created_at` |
| DAU / MAU / stickiness + дельты | `users.last_seen` (новое поле) |
| Online сейчас | Redis-ключи `presence:*` через `SCAN` (не `KEYS` — блокирует Redis) |
| Сообщений/мин | `messages.created_at` за 60s |

### `last_seen` throttle

Колонка `users.last_seen` обновляется через `core/last_seen.bump_last_seen`,
вызывается fire-and-forget из `get_current_user`. SETNX-throttle с TTL 60s
на ключ `user_active:{user_id}` — не более одного UPDATE в минуту на юзера.
Фоновая задача открывает собственную async-session (не на request-session,
иначе бы упала после respond'a).

**Caveat:** после деплоя `last_seen` начинает заполняться с нуля. MAU реалистичен
только через 30 дней после релиза; stickiness в этот период — overestimate.

## Поведение placeholder-секций

В `DashboardStats` поля для нереализованных секций возвращаются как `null`
(не `[]`, не `{}`). Фронт проверяет `if (field === null)` → рендерит
`<ComingSoon title=... reason=... />` — lime-dotted рамка с пояснением что нужно
сделать для активации. Layout стабилен: при добавлении реальной секции вёрстка
не дёргается.

## Roadmap (плeйсхолдеры в UI)

| Секция | Что нужно сделать | Сложность |
|---|---|---|
| KPI «Проблемы» + модалка | Sentry SDK (frontend+backend) + `/api/admin/issues` адаптер | M |
| Live: WS-соединений, latency p50/p95 | prom-style metrics middleware (`prometheus-fastapi-instrumentator`) | M |
| Воронка онбординга | Таблица `user_events` + insert'ы в auth-flow | L |
| Retention D1/D7/D30 | `user_events` + cohort-SQL (window functions) | M |
| География | GeoIP2 lookup на регистрации, колонка `users.country_code` | M |
| Лента событий | `user_events` + Redis-pubsub канал `admin:feed` + WS-подписка | L |
| KPI-модалка «Регистрации» (источники трафика) | UTM-разметка в onboarding-ссылках, колонка `users.utm_source` | S |
| KPI-модалка «Сообщения» (типы) | Расширение `messages` колонкой `type` enum (text/reply/emoji/media) | M |

Каждая — отдельная фича со своим спек/планом. Активация = в `DashboardStats`
соответствующее поле перестаёт быть `null` → фронт автоматически снимает
`<ComingSoon />` без вёрсточных правок.

## Файлы

| Слой | Файл |
|---|---|
| Backend router | `src/messenger/backend/app/api_v1/routers/admin_router.py` |
| Backend service | `src/messenger/backend/services/analytics.py` |
| Backend throttle | `src/messenger/backend/core/last_seen.py` |
| Backend schemas | `src/messenger/backend/app/api_v1/schemas/admin.py` |
| Auth dep | `src/messenger/backend/app/api_v1/auth/dependencies.py` (`get_current_admin`) |
| Frontend page | `src/messenger/frontend_react/src/pages/DashboardPage.jsx` |
| Frontend components | `src/messenger/frontend_react/src/components/dashboard/**` |
| Frontend hooks | `src/messenger/frontend_react/src/hooks/{useIsAdmin,useAdminStats}.js` |
| Route guard | `src/messenger/frontend_react/src/components/AdminRoute.jsx` |
| Тесты | `tests/test_last_seen_throttle.py`, `tests/test_analytics.py`, `tests/test_admin_endpoints.py` |

Дизайн-референс: handoff от claude design — `WSNox · Дашборд основателя.html` + `dashboard.js`.

Спека: `docs/superpowers/specs/2026-05-31-founder-dashboard-design.md` (локально, gitignored).
План: `docs/superpowers/plans/2026-05-31-founder-dashboard.md` (локально, gitignored).
