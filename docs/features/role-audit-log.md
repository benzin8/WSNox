# Журнал изменений ролей (audit log)

Append-only журнал RBAC-действий: кто, кому и когда сменил роль. Создан, чтобы
у основателя была подотчётность над выдачей admin/owner-прав. Хранит **только
метаданные ролей** — никакого содержимого сообщений или иных приватных данных
пользователей.

## Что умеет

| Возможность | Где |
|---|---|
| Запись каждой смены роли (actor → target, old → new) | `RoleAuditLog` insert внутри `admin_set_role` |
| Атомарность с самой сменой роли (один commit) | `admin_router.py` — `session.add(RoleAuditLog(...))` перед `await session.commit()` |
| Только метаданные RBAC — без приватного контента | модель `RoleAuditLog` (нет полей под текст/вложения) |
| Просмотр последних 100 записей | `GET /api/admin/audit`, gated `PERM_MANAGE_ROLES` |
| UI-панель журнала за тоглом | `RoleAuditPanel.jsx` + `useAdminAudit.js` в `AdminUsersPage.jsx` |

## Архитектура

```text
PATCH /api/admin/users/{id}/admin   (смена роли)
        │
        ▼
admin_set_role  (require_permission PERM_MANAGE_ROLES)
        │  can_assign_role(actor, target, new) — иерархия рангов
        ▼
target.role = new_role
target.is_admin = is_admin_role(new_role)
session.add(RoleAuditLog(actor_*, target_*, old_role, new_role))
        │
        ▼
await session.commit()   ← роль И audit-запись фиксируются вместе (атомарно)
        │
        ▼
GET /api/admin/audit  →  последние 100 (created_at DESC)  →  RoleAuditPanel
```

## Backend

### Таблица `role_audit_log`

Модель `messenger.backend.models.role_audit.RoleAuditLog` (append-only):

| Поле | Тип | Назначение |
|---|---|---|
| `id` | `Integer PK autoincrement` | суррогатный ключ |
| `actor_id` | `Integer NOT NULL` (index) | кто сменил роль |
| `actor_email` | `String(255) NOT NULL` | email инициатора (денормализован для читаемости журнала) |
| `target_id` | `Integer NOT NULL` (index) | кому сменили роль |
| `target_email` | `String(255) NOT NULL` | email цели |
| `old_role` | `String(20) NOT NULL` | роль до изменения |
| `new_role` | `String(20) NOT NULL` | роль после изменения |
| `created_at` | `DateTime` (index), default `now(timezone.utc)` | момент действия |

**Приватность.** В таблице нет ни одной колонки под содержимое сообщений,
вложения или другой контент. Только RBAC-метаданные (actor / target / old_role
/ new_role / created_at). Это сознательное проектное решение: журнал даёт
подотчётность над правами, не вскрывая приватность переписки. `actor_email` и
`target_email` денормализованы прямо в запись, чтобы журнал оставался читаемым
даже если юзер потом удалён.

### Вставка внутри `admin_set_role`

`admin_router.py` — `admin_set_role` (PATCH `/api/admin/users/{user_id}/admin`):

- запись создаётся **только при реальной смене** роли (`target_role == new_role`
  — ранний `return _user_row(target)`, no-op, без audit-строки);
- `session.add(RoleAuditLog(...))` идёт **до** `await session.commit()` — смена
  роли и audit-запись фиксируются одним коммитом (атомарно): нельзя поменять
  роль и «потерять» запись в журнале, и наоборот;
- после коммита — `session.refresh(target)` и сброс auth-кэша
  (`invalidate(get_redis(), user_auth(target.id))`).

Дублирующая текстовая запись остаётся и в логах приложения
(`logger.warning("role change: ...")`) — но журнал в БД самостоятелен и не
зависит от лог-агрегатора.

### Эндпойнт `GET /api/admin/audit`

```
GET /api/admin/audit
  auth: require_permission(PERM_MANAGE_ROLES)   (иначе 403)
  → list[RoleAuditEntry]   (последние 100, created_at DESC)
```

`admin_role_audit` выбирает
`select(RoleAuditLog).order_by(RoleAuditLog.created_at.desc()).limit(100)` и
сериализует через `RoleAuditEntry.model_validate(r, from_attributes=True)`.

Гейт — `PERM_MANAGE_ROLES`, который по `core/permissions.py` есть только у
`admin` и `owner` (`moderator` его НЕ имеет — журнал ему недоступен, хотя
дашборд он видит).

Схема ответа `RoleAuditEntry` (`schemas/admin.py`):
`id, actor_id, actor_email, target_id, target_email, old_role, new_role, created_at`.

### Миграция

`alembic/versions/f6a1d3e72b58_role_audit_log.py` (revision `f6a1d3e72b58`,
down_revision `e5f9c2b16d4a`):

- `CREATE TABLE role_audit_log` со всеми колонками выше;
- три индекса: `ix_role_audit_log_actor_id`, `ix_role_audit_log_target_id`,
  `ix_role_audit_log_created_at` (последний — под `ORDER BY created_at DESC`).

## Frontend

| Файл | Роль |
|---|---|
| `hooks/useAdminAudit.js` | `useAdminAudit(enabled)` — `GET /api/admin/audit`, грузит по требованию (`enabled`), отдаёт `{entries, loading, error, refresh}` |
| `components/dashboard/RoleAuditPanel.jsx` | панель журнала: `target_email : old → new`, справа `actor_email` + дата; лейблы ролей через `ROLE_LABELS` |
| `pages/AdminUsersPage.jsx` | рендерит панель за тоглом |

В `AdminUsersPage` журнал показывается **только при `canManageRoles`** и за
кнопкой-тоглом (`showAudit`): «Показать журнал изменений ролей» /
«Скрыть журнал ролей». Хук вызывается с `useAdminAudit(true)` при монтировании
панели, так что запрос уходит лишь когда журнал реально раскрыт — лишних
обращений к API нет. Панель не показывает никакого контента переписки — только
строки вида `bob@example.com : Пользователь → Админ`.

## Что НЕ сделано (явно)

- **Пагинация / фильтры** — отдаётся ровно последние 100 записей, без
  постраничной выборки и поиска по actor/target.
- **Экспорт / retention-политика** — журнал растёт бесконечно, без архивации.
- **Аудит других действий** — пишутся только смены ролей; объявления, удаления
  и пр. в журнал не попадают (только в логи приложения).
- **WS/реалтайм-обновление** — панель тянет данные по открытию тогла, без
  live-подписки.

## Тесты

`tests/test_admin_endpoints.py`:

- `test_role_change_records_audit_entry` — после `PATCH .../admin` в сессию
  добавляется ровно одна `RoleAuditLog` с корректными `old_role`/`new_role` и
  email'ами actor/target.
- `test_audit_endpoint_forbidden_for_user` — `GET /api/admin/audit` под ролью
  `user` → 403 (нет `PERM_MANAGE_ROLES`).
- `test_audit_endpoint_returns_entries_for_admin` — под ролью `admin` эндпойнт
  возвращает записи (200, `new_role` в ответе).
