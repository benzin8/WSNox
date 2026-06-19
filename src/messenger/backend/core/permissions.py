"""Role-based access control (RBAC) for WSNox.

A single source of truth for system roles, their rank (hierarchy), and the
permissions each role grants. Group-chat membership roles (`chat_members.role`)
are a SEPARATE concern and are not handled here.

Roles (low → high):
    user      — default; normal app usage, no admin surface.
    moderator — read-only access to the founder dashboard / analytics.
    admin     — dashboard + manage users + assign roles (up to admin).
    owner      — founder; everything, can assign admins.

`is_admin` (the legacy boolean) is derived: True for admin and owner.
"""
from __future__ import annotations

# --- Roles -------------------------------------------------------------------
ROLE_USER = "user"
ROLE_MODERATOR = "moderator"
ROLE_ADMIN = "admin"
ROLE_OWNER = "owner"

ALL_ROLES = (ROLE_USER, ROLE_MODERATOR, ROLE_ADMIN, ROLE_OWNER)
DEFAULT_ROLE = ROLE_USER

# Rank for hierarchy comparisons (higher can manage strictly-lower).
_RANK = {ROLE_USER: 0, ROLE_MODERATOR: 1, ROLE_ADMIN: 2, ROLE_OWNER: 3}

# Roles that count as "admin" for the legacy is_admin boolean.
ADMIN_ROLES = frozenset({ROLE_ADMIN, ROLE_OWNER})


# --- Permissions -------------------------------------------------------------
PERM_VIEW_DASHBOARD = "view_dashboard"   # see analytics / founder dashboard
PERM_MANAGE_USERS = "manage_users"       # list users in the admin area
PERM_MANAGE_ROLES = "manage_roles"       # change other users' roles

ALL_PERMISSIONS = (PERM_VIEW_DASHBOARD, PERM_MANAGE_USERS, PERM_MANAGE_ROLES)

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    ROLE_USER: frozenset(),
    ROLE_MODERATOR: frozenset({PERM_VIEW_DASHBOARD}),
    ROLE_ADMIN: frozenset({PERM_VIEW_DASHBOARD, PERM_MANAGE_USERS, PERM_MANAGE_ROLES}),
    ROLE_OWNER: frozenset({PERM_VIEW_DASHBOARD, PERM_MANAGE_USERS, PERM_MANAGE_ROLES}),
}


def normalize_role(role: str | None) -> str:
    """Coerce an unknown/None role to the safe default."""
    return role if role in _RANK else DEFAULT_ROLE


def role_rank(role: str | None) -> int:
    return _RANK.get(normalize_role(role), 0)


def is_admin_role(role: str | None) -> bool:
    """Legacy is_admin: True for admin/owner."""
    return normalize_role(role) in ADMIN_ROLES


def has_permission(role: str | None, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(normalize_role(role), frozenset())


def permissions_for(role: str | None) -> list[str]:
    return sorted(ROLE_PERMISSIONS.get(normalize_role(role), frozenset()))


def can_assign_role(actor_role: str | None, target_current_role: str | None, new_role: str) -> bool:
    """Whether `actor_role` may set a target (currently `target_current_role`)
    to `new_role`.

    Rules: the actor needs MANAGE_ROLES, the new role must be valid, and the
    actor may only manage targets and assign roles STRICTLY below their own
    rank (so an admin can manage user/moderator but never another admin/owner;
    an owner can manage admins but not other owners). Self-changes are handled
    by the caller (forbidden) — this function ignores identity.
    """
    if new_role not in _RANK:
        return False
    if not has_permission(actor_role, PERM_MANAGE_ROLES):
        return False
    actor = role_rank(actor_role)
    return actor > role_rank(target_current_role) and actor > role_rank(new_role)
