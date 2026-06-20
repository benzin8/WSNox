# RBAC — роли и права

Единый источник истины по системным ролям, их рангу (иерархии) и набору прав,
который даёт каждая роль. Заменяет старый булевый флаг `users.is_admin`: теперь
**роль — источник истины**, а `is_admin` выводится из неё. Роли участников
групп (`chat_members.role`: `admin` / `member`) — это **отдельная** история и к
этому RBAC отношения не имеют.

## Что умеет

| Возможность | Где |
|---|---|
| 4 системные роли с рангом (иерархией) | `core/permissions.py` — `ALL_ROLES`, `_RANK` |
| Набор прав, привязанный к роли | `ROLE_PERMISSIONS` |
| `is_admin` выводится из роли (admin/owner) | `is_admin_role`, `CachedUser.from_orm` |
| Гейт эндпойнта по конкретному праву | `require_permission(PERM_*)` |
| Иерархия назначения ролей (актор строго выше) | `can_assign_role` |
| Смена роли с подтверждением email + аудит | `admin_set_role` (`PATCH /api/admin/users/{id}/admin`) |
| Инвалидация identity-кэша при смене роли | `invalidate(user_auth(target.id))` |
| Журнал изменений ролей (последние 100) | `RoleAuditLog`, `GET /api/admin/audit` |
| Фронт-гейтинг роутов и кнопок по правам | `AdminRoute need=`, `useIsAdmin`, `features/roles.js` |

## Роли и ранги

Роли (от низшей к высшей), `core/permissions.py`:

```text
rank  role        что даёт
────  ─────────   ─────────────────────────────────────────────
 0    user        дефолт; обычное использование, без admin-поверхности
 1    moderator   read-only доступ к дашборду основателя / аналитике
 2    admin        дашборд + управление юзерами + назначение ролей (до admin)
 3    owner        founder; всё, может назначать админов
```

- `DEFAULT_ROLE = "user"`.
- `ADMIN_ROLES = frozenset({"admin", "owner"})` — роли, которые считаются
  «админскими» для легаси-флага `is_admin`.
- `normalize_role(role)` — приводит неизвестную / `None` роль к безопасному
  дефолту `user`. Используется везде, где роль читается из ORM / payload / dict.
- `role_rank(role)` — целочисленный ранг для сравнений иерархии.

## Права (permissions)

```text
PERM_VIEW_DASHBOARD     = "view_dashboard"       # видеть аналитику / дашборд
PERM_MANAGE_USERS       = "manage_users"         # список юзеров в admin-панели
PERM_MANAGE_ROLES       = "manage_roles"         # менять роли других юзеров
PERM_POST_ANNOUNCEMENTS = "post_announcements"   # постить в официальный канал WSNox
```

### Маппинг `ROLE_PERMISSIONS`

| Право | user | moderator | admin | owner |
|---|:---:|:---:|:---:|:---:|
| `view_dashboard` | — | ✅ | ✅ | ✅ |
| `manage_users` | — | — | ✅ | ✅ |
| `manage_roles` | — | — | ✅ | ✅ |
| `post_announcements` | — | — | ✅ | ✅ |

`user` — пустой `frozenset()` (default-deny). `admin` и `owner` имеют идентичный
набор прав — их различает **только ранг** (owner может управлять admin'ами,
admin — нет; см. `can_assign_role` ниже).

Хелперы:

| Функция | Что делает |
|---|---|
| `has_permission(role, perm)` | `perm in ROLE_PERMISSIONS[normalize_role(role)]` |
| `permissions_for(role)` | отсортированный `list[str]` прав роли (для `/me`) |
| `is_admin_role(role)` | `True` если роль в `ADMIN_ROLES` (admin/owner) |

## Как выводится `is_admin`

`is_admin` больше не хранит независимую истину — он **производное от роли**.

- `CachedUser.from_orm(user)` нормализует `user.role` и считает
  `is_admin = is_admin_role(role)`. То есть даже если в БД рассинхрон, снимок
  identity-кэша всегда консистентен с ролью.
- `CachedUser.has(permission)` делегирует в `has_permission(self.role, permission)`.
- `models/user.py`: колонка `role` (`String(20)`, `server_default="user"`) —
  источник истины; `is_admin` (`Boolean`) оставлен для обратной совместимости и
  **синхронизируется с ролью** при каждом `admin_set_role`
  (`target.is_admin = is_admin_role(new_role)`).

## Зависимости авторизации

`app/api_v1/auth/dependencies.py`:

| Зависимость | Поведение |
|---|---|
| `get_current_user` | декодит JWT → `CachedUser` из identity-кэша; 401 если нет |
| `get_current_admin` | 403 «Admin access required», если `current_user.is_admin` ложно (admin/owner) |
| `require_permission(perm)` | фабрика: возвращает зависимость, дающую 403 «Недостаточно прав», если `current_user.has(perm)` ложно |

`require_permission` — основной гейт для admin-эндпойнтов. Использование:

```python
@admin_router.get("/users")
async def admin_list_users(
    _admin: User = Depends(require_permission(PERM_MANAGE_USERS)),
    ...
):
    ...
```

Текущие гейты в `admin_router.py`:

| Эндпойнт | Гейт |
|---|---|
| `GET /api/admin/me` | `get_current_user` (любой залогиненный) |
| `GET /api/admin/stats` | `require_permission(PERM_VIEW_DASHBOARD)` |
| `GET /api/admin/live` | `require_permission(PERM_VIEW_DASHBOARD)` |
| `POST /api/admin/announcements` | `require_permission(PERM_POST_ANNOUNCEMENTS)` |
| `GET /api/admin/users` | `require_permission(PERM_MANAGE_USERS)` |
| `GET /api/admin/audit` | `require_permission(PERM_MANAGE_ROLES)` |
| `PATCH /api/admin/users/{id}/admin` | `require_permission(PERM_MANAGE_ROLES)` |

`/api/admin/me` отдаёт `{is_admin, role, permissions}` — фронт строит UI из
`permissions`, а не из роли напрямую.

## Иерархия назначения ролей — `can_assign_role`

```python
can_assign_role(actor_role, target_current_role, new_role) -> bool
```

Правила (актор может управлять только теми, кто **строго ниже** по рангу, и
назначать роли **строго ниже** своего ранга):

1. `new_role` должна быть валидной (есть в `_RANK`), иначе `False`.
2. У актора должно быть право `PERM_MANAGE_ROLES`, иначе `False`.
3. `role_rank(actor) > role_rank(target_current_role)` **и**
   `role_rank(actor) > role_rank(new_role)`.

Следствия:

- **admin** может управлять `user` / `moderator` и назначать им `user` /
  `moderator`, но **не может** трогать другого `admin` / `owner` и **не может**
  назначить роль `admin` / `owner`.
- **owner** может управлять `admin` / `moderator` / `user` и назначать вплоть до
  `admin`, но **не может** трогать другого `owner` и **не может** назначить
  `owner` (owner создаётся только миграцией).
- Самоизменение роли функция игнорирует — это **запрещает вызывающий**
  (`admin_set_role` отдаёт 400 «Нельзя менять собственную роль», защита от
  lock-out).

### Поток `admin_set_role` (PATCH `/api/admin/users/{user_id}/admin`)

1. Резолв новой роли: поле `role`, либо легаси-`is_admin` bool
   (`True → "admin"`, `False → "user"`); 400 если роли нет / 400 если она не в
   `ALL_ROLES`.
2. 400 если `user_id == current_admin.id` (нельзя менять свою роль).
3. 404 если цель не найдена.
4. **Confirm-email**: `payload.confirm_email` должен совпадать (case-insensitive)
   с `target.email`, иначе 400.
5. `can_assign_role(actor_role, target_role, new_role)` — иначе 403.
6. No-op, если роль не меняется (`target_role == new_role`).
7. Иначе: `target.role = new_role`, `target.is_admin = is_admin_role(new_role)`,
   запись в `RoleAuditLog` (актор, цель, старая/новая роль), `commit`, `refresh`.
8. **Инвалидация identity-кэша**: `invalidate(get_redis(), user_auth(target.id))`
   — чтобы новая роль подхватилась со следующего запроса, а не через TTL.
9. `logger.warning(...)` со старой → новой ролью и id/email актора и цели.

## Миграция и бэкфилл

Ревизия `d4e8b1a05c39_add_user_role_rbac` (down_revision `c7e1a9d04b2f`):

```python
op.add_column("users",
    sa.Column("role", sa.String(20), nullable=False, server_default="user"))
# существующие админы сохраняют доступ как 'admin'
op.execute("UPDATE users SET role = 'admin' WHERE is_admin = true")
# founder становится единственным 'owner' (и остаётся admin)
op.execute("UPDATE users SET role = 'owner', is_admin = true "
           "WHERE email = 'visdima0102@gmail.com'")
```

- Backfill: каждый, у кого `is_admin = true`, получает `role = 'admin'`.
- Founder (`visdima0102@gmail.com`) поднимается до `owner` (единственный owner;
  через UI/API роль `owner` назначить нельзя — см. `can_assign_role`).
- `downgrade()` — просто `drop_column("users", "role")`.

## Frontend

| Слой | Файл | Роль |
|---|---|---|
| Hook | `hooks/useIsAdmin.js` | дёргает `GET /api/admin/me`, кэширует в `localStorage` (TTL 1 час), отдаёт `{isAdmin, role, permissions, canViewDashboard, canManageUsers, canManageRoles, canPostAnnouncements, loading}` |
| Route guard | `components/AdminRoute.jsx` | `<AdminRoute need="...">` — редирект на `/chat`, если в `permissions` нет требуемого права (по умолчанию `view_dashboard`) |
| Зеркало RBAC | `features/roles.js` | `ROLES`, `RANK`, `ROLE_LABELS`, `ROLE_BADGE`, `canAssign`, `assignableRoles` — повторяет логику бэка для UI |
| Страница | `pages/AdminUsersPage.jsx` | список юзеров, бейджи ролей, кнопка «Изменить роль» |
| Модалка | `components/dashboard/RoleConfirmModal.jsx` | выбор роли + confirm-email |

### `AdminRoute need=`

`AdminRoute` — UX-редирект (бэк всё равно проверяет права). При `loading`
показывает спиннер; нет токена → редирект на `/auth/send-code`; нет нужного
permission в `permissions` → редирект на `/chat`. Параметр `need` задаёт
требуемое право (default `view_dashboard`).

### Бейджи ролей

`features/roles.js` → `ROLE_LABELS` / `ROLE_BADGE`:

| Роль | Лейбл | Бейдж (fg) |
|---|---|---|
| `user` | Пользователь | zinc |
| `moderator` | Модератор | голубой `#38bdf8` |
| `admin` | Админ | лайм `--color-lime-400` |
| `owner` | Владелец | янтарный `#fbbf24` |

`AdminUsersPage` рисует бейдж рядом с ником, а кнопку «Изменить роль» показывает
**только если** `canManageRoles && assignableRoles(actorRole, u.role).length > 0`
— то есть актор реально может назначить этому таргету хоть какую-то роль.

### `RoleConfirmModal` с email-подтверждением

- `options` — список ролей, доступных актору для этого таргета
  (`assignableRoles(actorRole, target.role)`).
- Кнопка «Применить» активна только когда `ready = matches && changed`:
  - `matches` — введённый email точно совпадает (case-insensitive) с email цели;
  - `changed` — выбранная роль отличается от текущей.
- Поле email подсвечивается лаймом при совпадении; Enter сабмитит при `ready`.
- `onConfirm(targetId, role, email)` шлёт PATCH; ошибка бэка показывается прямо в
  модалке. То есть confirm-email проверяется **и на клиенте, и на сервере**.

## Тесты

`tests/test_permissions.py` — 11 юнит-тестов чистой логики `core/permissions.py`:

- упорядоченность рангов; `normalize_role` фоллбэк на `user`; `is_admin_role`.
- `permissions_per_role` и default-deny у `user`.
- `can_assign_role`: owner назначает admin; owner **не** может сделать owner;
  admin **не** трогает admin/owner; admin управляет нижестоящими; требуется
  `manage_roles`; отклоняет неизвестную роль.

`tests/test_admin_endpoints.py` — 14 интеграционных тестов эндпойнтов:

- `/me` отдаёт роль + права для admin и для обычного юзера.
- `/stats` запрещён `user`, разрешён `moderator`; `/users` запрещён `moderator`.
- `set_role`: требует совпадения confirm-email; owner назначает admin; легаси-bod
  `is_admin` всё ещё работает; admin **не** может назначить admin, но может
  назначить moderator; нельзя менять свою роль.
- аудит: запись создаётся при смене роли; `/audit` запрещён `user`, отдаёт записи
  admin'у.
