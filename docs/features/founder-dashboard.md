# Дашборд основателя

Защищённая страница `/dashboard` с аналитикой WSNox. Доступ гейтится правом
`view_dashboard` (RBAC), а не «голым» `is_admin` булем.

## Доступ (RBAC)

Дашборд теперь гейтится **правом** `PERM_VIEW_DASHBOARD`, а не сырым
`users.is_admin` (см. `core/permissions.py`). Эндпойнты завязаны на
`require_permission(...)`, а не на `get_current_admin`.

| Роль | view_dashboard | manage_users | manage_roles | post_announcements |
|---|:---:|:---:|:---:|:---:|
| `user` | — | — | — | — |
| `moderator` | ✅ (read-only) | — | — | — |
| `admin` | ✅ | ✅ | ✅ | ✅ |
| `owner` | ✅ | ✅ | ✅ | ✅ |

- `moderator` получает **read-only** доступ к дашборду/аналитике, но НЕ может
  управлять юзерами или менять роли (нет `manage_users` / `manage_roles`).
- `is_admin` (легаси-булевое) теперь **производное** от роли: `True` для
  `admin`/`owner` (`is_admin_role`). Колонка `users.is_admin` синхронизируется
  со сменой роли в `admin_set_role`.
- Смена роли — только через `PATCH /api/admin/users/{id}/admin` под
  `manage_roles`, с иерархией рангов (`can_assign_role`) и записью в
  [журнал изменений ролей](./role-audit-log.md).
- В шапке chat-страницы у юзера с правом появляется лаймовая иконка «дашборд»
  (grid). Клик → `/dashboard`.

## Эндпойнты

| Метод | Путь | Auth | Возвращает |
|---|---|---|---|
| GET | `/api/admin/me` | любой залогиненный | `{is_admin, role, permissions[]}` — для UI |
| GET | `/api/admin/stats` | `view_dashboard` (иначе 403) | 90-дневный `DashboardStats` |
| GET | `/api/admin/live` | `view_dashboard` | лёгкий `LiveBlock` (online / msgs-per-min / ws_connections) для polling'а |
| GET | `/api/admin/audit` | `manage_roles` | [журнал ролей](./role-audit-log.md), последние 100 |

Один запрос на `/stats` отдаёт всю аналитику. Фронт сам режет на 7/30 без
перезапроса при переключении периода. Live-секция дополнительно опрашивается
отдельным лёгким `/api/admin/live` раз в 10s (`useAdminStats` → `LIVE_POLL_MS`),
чтобы не пересчитывать тяжёлые 90-дневные агрегаты.

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

## Живые аналитические секции

Эти секции раньше были плейсхолдерами (`<ComingSoon />`), а теперь подключены к
реальным данным. В `_build_stats` (`admin_router.py`) `DashboardStats` теперь
заполняет поля `funnel/feed/retention/breakdown/health`, а `live.ws_connections`
берётся из `_ws_connection_count()`. Все агрегации — чистые async-функции в
`services/analytics.py` (тестируются на моках, без глобалов).

### Воронка онбординга (`funnel`)

`analytics.funnel` — три стадии, без таблицы событий, прямо из имеющихся колонок:

| Стадия | Источник |
|---|---|
| Регистрация | `COUNT(users)` (100%) |
| Написал сообщение | `COUNT(DISTINCT messages.sender_id)` |
| Активен (7д) | `COUNT(users WHERE last_seen >= now-7d)` |

Каждая стадия отдаёт `{stage, count, pct}` (pct от total регистраций). UI —
`FunnelPanel.jsx`, лаймовые progress-бары.

### Retention D1/D7/D30 (`retention`)

`analytics.retention` — **rolling activity retention**, честный прокси без
event-логов. Для каждого окна N (1/7/30): из юзеров, зарегистрированных раньше
чем N дней назад (`created_at < now-Nд`), доля активных за последние N дней
(`last_seen >= now-Nд`). Это не строгая cohort-аналитика, но реальный показатель
возвращаемости из колонок `created_at` + `last_seen`. Возвращает `{d1, d7, d30}`
в процентах. UI — `RetentionStrip.jsx` (4-я карточка — Stickiness из `kpi_dau`).

### Лента регистраций (`feed`)

`analytics.recent_signups(limit=12)` — последние регистрации (`username`, `name`,
`at`), отсортированы по `created_at DESC`. **Приватность:** только
admin-видимая идентичность (как в списке юзеров) и время — НИКАКОГО содержимого
сообщений. UI — `FeedPanel.jsx` (инициалы + `@username` + relative-time).

### Здоровье проекта (`health`)

`analytics.health` — состояние инфраструктуры и тоталы:

| Поле | Источник |
|---|---|
| `db_ok` | `SELECT 1` (try/except) |
| `redis_ok` | `redis.ping()` (try/except) |
| `cache_enabled` | `settings.cache_data_enabled` |
| `users` / `messages` / `chats` | `COUNT(*)` по таблицам |

UI — `HealthPanel.jsx` (OK/DOWN индикаторы + три тотала).

### Разбивка сообщений (`breakdown`)

`analytics.breakdowns` — агрегатные разбивки:

| Поле | Что |
|---|---|
| `msg_types` | `GROUP BY messages.msg_type` (text/image/video/…) |
| `chat_types` | `GROUP BY chats.chat_type` (private/group/channel) |
| `media_pct` | доля сообщений с `attachment_key IS NOT NULL` |
| `reply_pct` | доля сообщений с `reply_to_id IS NOT NULL` |

UI — `GeoPanel.jsx` (исторически назван `Geo`, но рендерит «Разбивку
сообщений»; не путать с настоящей гео-секцией, которая остаётся плейсхолдером).

### Live: WS-соединения (`live.ws_connections`)

`LiveBlock` теперь несёт `ws_connections` —
`_ws_connection_count()` суммирует `len(socks)` по
`manager.active_connections` (живые WS-сокеты across всех юзеров),
безопасный `0` при ошибке импорта. Считается СВЕЖИМ (не из bucketed
stats-кэша) и в `/stats`, и в `/live`. UI — `LivePanel.jsx`
(online / msgs-per-min / ws_connections; `?? '—'` если поле null).

## Метрики (сводно)

| Метрика | Поле `DashboardStats` | Источник |
|---|---|---|
| Регистрации / Сообщения / DAU (series + KPI + дельты) | `regs`/`msgs`/`dau`/`kpis` | `created_at` / `last_seen` |
| Воронка (3 стадии) | `funnel` | `funnel()` |
| Retention D1/D7/D30 | `retention` | `retention()` |
| Лента регистраций | `feed` | `recent_signups()` |
| Здоровье (db/redis/cache + тоталы) | `health` | `health()` |
| Разбивка сообщений | `breakdown` | `breakdowns()` |
| Live (online / msgs-per-min / ws_connections) | `live` | `live_online` / `live_msgs_per_min` / `_ws_connection_count` |

## Поведение placeholder-секций

В `DashboardStats` поля для нереализованных секций возвращаются как `null`
(не `[]`, не `{}`). Фронт проверяет `if (field === null)` → рендерит
`<ComingSoon title=... reason=... />` — lime-dotted рамка с пояснением что нужно
сделать для активации. Layout стабилен: при добавлении реальной секции вёрстка
не дёргается.

После подключения funnel/feed/retention/breakdown/health плейсхолдерами в
схеме остаются только `problems_by_severity` и `geo` (плюс `details`,
`latency_p50/p95` в `LiveBlock`) — данных под них пока нет.

## Что остаётся плейсхолдером

| Секция | Почему ещё placeholder | Что нужно сделать | Сложность |
|---|---|---|---|
| KPI «Проблемы» (`problems_by_severity`) | нет источника ошибок | Sentry SDK (frontend+backend) + `/api/admin/issues` адаптер | M |
| География (`geo`) | **нет IP-данных** — на регистрации не пишется страна/IP | GeoIP2 lookup, колонка `users.country_code` | M |
| Live: latency p50/p95 (`latency_p50/p95`) | нет метрик-мидлвара | prom-style middleware (`prometheus-fastapi-instrumentator`) | M |
| KPI-модалка «Регистрации» (источники трафика) | нет UTM-разметки | колонка `users.utm_source` в onboarding | S |

В UI `DashboardPage.jsx` карточка «Проблемы» по-прежнему рендерится как
`<ComingSoon title="Проблемы" reason="Появится после интеграции Sentry SDK" />`.
Активация остальных = соответствующее поле в `DashboardStats` перестаёт быть
`null` → фронт автоматически снимает `<ComingSoon />` без вёрсточных правок.

## Файлы

| Слой | Файл |
|---|---|
| Backend router | `src/messenger/backend/app/api_v1/routers/admin_router.py` |
| Backend service | `src/messenger/backend/services/analytics.py` |
| Backend throttle | `src/messenger/backend/core/last_seen.py` |
| Backend schemas | `src/messenger/backend/app/api_v1/schemas/admin.py` (`DashboardStats`, `LiveBlock`, `RoleAuditEntry`) |
| Backend RBAC | `src/messenger/backend/core/permissions.py` (роли, права, `can_assign_role`) |
| Auth dep | `src/messenger/backend/app/api_v1/auth/dependencies.py` (`require_permission(...)`) |
| Frontend page | `src/messenger/frontend_react/src/pages/DashboardPage.jsx`, `AdminUsersPage.jsx` |
| Frontend панели | `.../components/dashboard/panels/{Funnel,RetentionStrip,Feed,Health,Geo,Live}Panel.jsx` |
| Frontend audit | `.../components/dashboard/RoleAuditPanel.jsx`, `hooks/useAdminAudit.js` |
| Frontend hooks | `src/messenger/frontend_react/src/hooks/{useIsAdmin,useAdminStats}.js` |
| Route guard | `src/messenger/frontend_react/src/components/AdminRoute.jsx` |
| Тесты | `tests/test_last_seen_throttle.py`, `tests/test_analytics.py`, `tests/test_admin_endpoints.py` |

Журнал изменений ролей вынесен в отдельный документ:
[role-audit-log.md](./role-audit-log.md).

Дизайн-референс: handoff от claude design — `WSNox · Дашборд основателя.html` + `dashboard.js`.

Спека: `docs/superpowers/specs/2026-05-31-founder-dashboard-design.md` (локально, gitignored).
План: `docs/superpowers/plans/2026-05-31-founder-dashboard.md` (локально, gitignored).
