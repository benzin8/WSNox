"""Тесты RBAC-ядра (core/permissions): права ролей и правила назначения."""
from messenger.backend.core import permissions as p


def test_role_ranks_ordered():
    assert p.role_rank("user") < p.role_rank("moderator") < p.role_rank("admin") < p.role_rank("owner")


def test_normalize_role_falls_back_to_user():
    assert p.normalize_role(None) == "user"
    assert p.normalize_role("nope") == "user"
    assert p.normalize_role("admin") == "admin"


def test_is_admin_role():
    assert p.is_admin_role("admin") is True
    assert p.is_admin_role("owner") is True
    assert p.is_admin_role("moderator") is False
    assert p.is_admin_role("user") is False
    assert p.is_admin_role(None) is False


def test_permissions_per_role():
    assert p.permissions_for("user") == []
    assert p.PERM_VIEW_DASHBOARD in p.permissions_for("moderator")
    assert p.PERM_MANAGE_USERS not in p.permissions_for("moderator")
    for perm in (p.PERM_VIEW_DASHBOARD, p.PERM_MANAGE_USERS, p.PERM_MANAGE_ROLES):
        assert p.has_permission("admin", perm)
        assert p.has_permission("owner", perm)


def test_has_permission_default_deny():
    assert p.has_permission("user", p.PERM_VIEW_DASHBOARD) is False
    assert p.has_permission(None, p.PERM_MANAGE_ROLES) is False


def test_can_assign_role_owner_grants_admin():
    assert p.can_assign_role("owner", "user", "admin") is True
    assert p.can_assign_role("owner", "moderator", "admin") is True


def test_can_assign_role_owner_cannot_make_owner():
    # actor rank must be strictly greater than the new role rank.
    assert p.can_assign_role("owner", "user", "owner") is False


def test_can_assign_role_admin_cannot_touch_admin_or_owner():
    assert p.can_assign_role("admin", "user", "admin") is False   # can't assign admin
    assert p.can_assign_role("admin", "admin", "user") is False   # can't manage an admin
    assert p.can_assign_role("admin", "owner", "user") is False   # can't manage an owner


def test_can_assign_role_admin_manages_below():
    assert p.can_assign_role("admin", "user", "moderator") is True
    assert p.can_assign_role("admin", "moderator", "user") is True


def test_can_assign_role_requires_manage_roles_permission():
    assert p.can_assign_role("moderator", "user", "user") is False
    assert p.can_assign_role("user", "user", "user") is False


def test_can_assign_role_rejects_unknown_role():
    assert p.can_assign_role("owner", "user", "superadmin") is False
