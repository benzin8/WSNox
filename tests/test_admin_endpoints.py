"""Smoke-тесты эндпойнтов /api/admin/*: RBAC-гейты, роли, shape."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.main import app
from messenger.backend.core.identity import CachedUser
from messenger.backend.core.permissions import is_admin_role
from messenger.backend.db import get_db_session
from messenger.backend.models.user import User


def _cached(role: str = "user", user_id: int = 1, email: str = "a@example.com") -> CachedUser:
    """Снимок текущего юзера (то, что реально возвращает get_current_user)."""
    return CachedUser(
        id=user_id,
        is_admin=is_admin_role(role),
        username=f"u{user_id}",
        name="A",
        email=email,
        phone_number=None,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        last_seen=None,
        role=role,
    )


def _target(role: str = "user", user_id: int = 2, email: str = "bob@example.com") -> User:
    u = User(id=user_id, name="Bob", username=f"u{user_id}", email=email, hashed_password="x")
    u.role = role
    u.is_admin = is_admin_role(role)
    u.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    u.last_seen = None
    return u


def _session_returning(target):
    session = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=target)
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    return session


def test_admin_me_returns_role_and_permissions_for_admin():
    app.dependency_overrides[get_current_user] = lambda: _cached(role="admin")
    try:
        with TestClient(app) as c:
            r = c.get("/api/admin/me", headers={"Authorization": "Bearer x"})
            assert r.status_code == 200
            body = r.json()
            assert body["is_admin"] is True
            assert body["role"] == "admin"
            assert "view_dashboard" in body["permissions"]
            assert "manage_roles" in body["permissions"]
    finally:
        app.dependency_overrides.clear()


def test_admin_me_for_plain_user():
    app.dependency_overrides[get_current_user] = lambda: _cached(role="user")
    try:
        with TestClient(app) as c:
            r = c.get("/api/admin/me", headers={"Authorization": "Bearer x"})
            assert r.status_code == 200
            body = r.json()
            assert body["is_admin"] is False
            assert body["role"] == "user"
            assert body["permissions"] == []
    finally:
        app.dependency_overrides.clear()


def test_stats_forbidden_for_user_allowed_for_moderator():
    # plain user -> 403
    app.dependency_overrides[get_current_user] = lambda: _cached(role="user")
    try:
        with TestClient(app) as c:
            assert c.get("/api/admin/stats", headers={"Authorization": "Bearer x"}).status_code == 403
    finally:
        app.dependency_overrides.clear()

    # moderator has view_dashboard -> not 403 (stats build is mocked elsewhere; here just gate)
    app.dependency_overrides[get_current_user] = lambda: _cached(role="moderator")
    with patch("messenger.backend.app.api_v1.routers.admin_router.analytics") as m:
        m.reg_series = AsyncMock(return_value=[0] * 90)
        m.msg_series = AsyncMock(return_value=[0] * 90)
        m.dau_series = AsyncMock(return_value=[0] * 90)
        m.labels_series = MagicMock(return_value=["3.3"] * 90)
        m.kpi_users = AsyncMock(return_value={"total": 0, "deltas": {"7": 0.0, "30": 0.0, "90": 0.0}})
        m.kpi_msgs = AsyncMock(return_value={"total": 0, "deltas": {"7": 0.0, "30": 0.0, "90": 0.0}})
        m.kpi_dau = AsyncMock(return_value={"value": 0, "mau": 0, "stickiness": 0.0, "deltas": {"7": 0.0, "30": 0.0, "90": 0.0}})
        m.live_online = AsyncMock(return_value=0)
        m.live_msgs_per_min = AsyncMock(return_value=0)
        m.funnel = AsyncMock(return_value=[])
        m.recent_signups = AsyncMock(return_value=[])
        m.retention = AsyncMock(return_value={})
        m.breakdowns = AsyncMock(return_value={})
        m.health = AsyncMock(return_value={})
        try:
            with TestClient(app) as c:
                assert c.get("/api/admin/stats", headers={"Authorization": "Bearer x"}).status_code == 200
        finally:
            app.dependency_overrides.clear()


def test_users_list_forbidden_for_moderator():
    """Moderator can view dashboard but NOT manage users."""
    app.dependency_overrides[get_current_user] = lambda: _cached(role="moderator")
    try:
        with TestClient(app) as c:
            assert c.get("/api/admin/users", headers={"Authorization": "Bearer x"}).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_set_role_requires_matching_confirm_email():
    target = _target(role="user")
    session = _session_returning(target)
    app.dependency_overrides[get_current_user] = lambda: _cached(role="owner", user_id=1, email="owner@example.com")
    app.dependency_overrides[get_db_session] = lambda: session
    try:
        with TestClient(app) as c:
            r = c.patch(
                "/api/admin/users/2/admin",
                json={"role": "admin", "confirm_email": "WRONG@example.com"},
                headers={"Authorization": "Bearer x"},
            )
            assert r.status_code == 400
            assert "не совпадает" in r.json()["detail"].lower()
            session.commit.assert_not_called()
    finally:
        app.dependency_overrides.clear()


def test_owner_grants_admin_role():
    target = _target(role="user")
    session = _session_returning(target)
    app.dependency_overrides[get_current_user] = lambda: _cached(role="owner", user_id=1, email="owner@example.com")
    app.dependency_overrides[get_db_session] = lambda: session
    try:
        with TestClient(app) as c:
            r = c.patch(
                "/api/admin/users/2/admin",
                json={"role": "admin", "confirm_email": "bob@example.com"},
                headers={"Authorization": "Bearer x"},
            )
            assert r.status_code == 200, r.text
            assert r.json()["role"] == "admin"
            assert r.json()["is_admin"] is True
            assert target.role == "admin"
            assert target.is_admin is True
            session.commit.assert_called_once()
    finally:
        app.dependency_overrides.clear()


def test_legacy_is_admin_body_still_works():
    """Old frontend sending {is_admin: true} maps to role=admin."""
    target = _target(role="user")
    session = _session_returning(target)
    app.dependency_overrides[get_current_user] = lambda: _cached(role="owner", user_id=1, email="owner@example.com")
    app.dependency_overrides[get_db_session] = lambda: session
    try:
        with TestClient(app) as c:
            r = c.patch(
                "/api/admin/users/2/admin",
                json={"is_admin": True, "confirm_email": "bob@example.com"},
                headers={"Authorization": "Bearer x"},
            )
            assert r.status_code == 200, r.text
            assert target.role == "admin"
    finally:
        app.dependency_overrides.clear()


def test_admin_cannot_assign_admin_role():
    """Hierarchy: an admin may not grant the admin role (only owner can)."""
    target = _target(role="user")
    session = _session_returning(target)
    app.dependency_overrides[get_current_user] = lambda: _cached(role="admin", user_id=1, email="admin@example.com")
    app.dependency_overrides[get_db_session] = lambda: session
    try:
        with TestClient(app) as c:
            r = c.patch(
                "/api/admin/users/2/admin",
                json={"role": "admin", "confirm_email": "bob@example.com"},
                headers={"Authorization": "Bearer x"},
            )
            assert r.status_code == 403
            session.commit.assert_not_called()
    finally:
        app.dependency_overrides.clear()


def test_admin_can_assign_moderator_role():
    target = _target(role="user")
    session = _session_returning(target)
    app.dependency_overrides[get_current_user] = lambda: _cached(role="admin", user_id=1, email="admin@example.com")
    app.dependency_overrides[get_db_session] = lambda: session
    try:
        with TestClient(app) as c:
            r = c.patch(
                "/api/admin/users/2/admin",
                json={"role": "moderator", "confirm_email": "bob@example.com"},
                headers={"Authorization": "Bearer x"},
            )
            assert r.status_code == 200, r.text
            assert target.role == "moderator"
            assert target.is_admin is False
    finally:
        app.dependency_overrides.clear()


def test_cannot_change_own_role():
    me = _cached(role="owner", user_id=1, email="owner@example.com")
    app.dependency_overrides[get_current_user] = lambda: me
    try:
        with TestClient(app) as c:
            r = c.patch(
                "/api/admin/users/1/admin",
                json={"role": "user", "confirm_email": "owner@example.com"},
                headers={"Authorization": "Bearer x"},
            )
            assert r.status_code == 400
            assert "роль" in r.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


def test_admin_stats_returns_full_shape():
    app.dependency_overrides[get_current_user] = lambda: _cached(role="admin")
    with patch("messenger.backend.app.api_v1.routers.admin_router.analytics") as m:
        m.reg_series = AsyncMock(return_value=[0] * 90)
        m.msg_series = AsyncMock(return_value=[0] * 90)
        m.dau_series = AsyncMock(return_value=[0] * 90)
        m.labels_series = MagicMock(return_value=["3.3"] * 90)
        m.kpi_users = AsyncMock(return_value={"total": 0, "deltas": {"7": 0.0, "30": 0.0, "90": 0.0}})
        m.kpi_msgs = AsyncMock(return_value={"total": 0, "deltas": {"7": 0.0, "30": 0.0, "90": 0.0}})
        m.kpi_dau = AsyncMock(return_value={"value": 0, "mau": 0, "stickiness": 0.0, "deltas": {"7": 0.0, "30": 0.0, "90": 0.0}})
        m.live_online = AsyncMock(return_value=0)
        m.live_msgs_per_min = AsyncMock(return_value=0)
        m.funnel = AsyncMock(return_value=[])
        m.recent_signups = AsyncMock(return_value=[])
        m.retention = AsyncMock(return_value={})
        m.breakdowns = AsyncMock(return_value={})
        m.health = AsyncMock(return_value={})
        try:
            with TestClient(app) as c:
                r = c.get("/api/admin/stats", headers={"Authorization": "Bearer x"})
                assert r.status_code == 200, r.text
                data = r.json()
                assert len(data["regs"]) == 90
                assert len(data["labels"]) == 90
                assert data["kpis"]["users"]["total"] == 0
                assert data["live"]["online"] == 0
                assert data["kpis"]["problems"] is None
        finally:
            app.dependency_overrides.clear()
