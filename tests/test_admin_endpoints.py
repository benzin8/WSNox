"""Smoke-тесты эндпойнтов /api/admin/*: shape, auth-gate."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from messenger.backend.app.api_v1.auth.dependencies import (
    get_current_admin,
    get_current_user,
)
from messenger.backend.app.main import app
from messenger.backend.db import get_db_session
from messenger.backend.models.user import User


def _make_user(is_admin: bool = False, user_id: int = 1, email: str = "a@example.com") -> User:
    u = User(id=user_id, name="A", username=f"u{user_id}", email=email, hashed_password="x")
    u.is_admin = is_admin
    u.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    u.last_seen = None
    return u


def test_admin_me_returns_is_admin_true_for_admin():
    app.dependency_overrides[get_current_user] = lambda: _make_user(is_admin=True)
    try:
        with TestClient(app) as c:
            r = c.get("/api/admin/me", headers={"Authorization": "Bearer x"})
            assert r.status_code == 200
            assert r.json() == {"is_admin": True}
    finally:
        app.dependency_overrides.clear()


def test_admin_me_returns_is_admin_false_for_user():
    app.dependency_overrides[get_current_user] = lambda: _make_user(is_admin=False)
    try:
        with TestClient(app) as c:
            r = c.get("/api/admin/me", headers={"Authorization": "Bearer x"})
            assert r.status_code == 200
            assert r.json() == {"is_admin": False}
    finally:
        app.dependency_overrides.clear()


def test_admin_stats_forbidden_for_non_admin():
    app.dependency_overrides[get_current_user] = lambda: _make_user(is_admin=False)
    try:
        with TestClient(app) as c:
            r = c.get("/api/admin/stats", headers={"Authorization": "Bearer x"})
            assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_admin_set_role_requires_matching_confirm_email():
    """Even an admin gets 400 if confirm_email doesn't match target.email."""
    target = _make_user(is_admin=False, user_id=2, email="bob@example.com")

    # mock session: target lookup returns bob
    session = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=target)
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    session.refresh = AsyncMock()

    app.dependency_overrides[get_current_admin] = lambda: _make_user(is_admin=True, user_id=1, email="admin@example.com")
    app.dependency_overrides[get_db_session] = lambda: session

    try:
        with TestClient(app) as c:
            r = c.patch(
                "/api/admin/users/2/admin",
                json={"is_admin": True, "confirm_email": "WRONG@example.com"},
                headers={"Authorization": "Bearer x"},
            )
            assert r.status_code == 400
            assert "не совпадает" in r.json()["detail"].lower()
            # БД не должна была коммитить
            session.commit.assert_not_called()
    finally:
        app.dependency_overrides.clear()


def test_admin_set_role_grants_when_confirm_matches():
    target = _make_user(is_admin=False, user_id=2, email="bob@example.com")
    session = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=target)
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    session.refresh = AsyncMock()

    app.dependency_overrides[get_current_admin] = lambda: _make_user(is_admin=True, user_id=1, email="admin@example.com")
    app.dependency_overrides[get_db_session] = lambda: session

    try:
        with TestClient(app) as c:
            r = c.patch(
                "/api/admin/users/2/admin",
                json={"is_admin": True, "confirm_email": "bob@example.com"},
                headers={"Authorization": "Bearer x"},
            )
            assert r.status_code == 200, r.text
            assert r.json()["is_admin"] is True
            assert target.is_admin is True
            session.commit.assert_called_once()
    finally:
        app.dependency_overrides.clear()


def test_admin_cannot_revoke_own_admin():
    """Защита от lock-out: нельзя снять админку с самого себя."""
    me = _make_user(is_admin=True, user_id=1, email="admin@example.com")
    app.dependency_overrides[get_current_admin] = lambda: me
    try:
        with TestClient(app) as c:
            r = c.patch(
                "/api/admin/users/1/admin",
                json={"is_admin": False, "confirm_email": "admin@example.com"},
                headers={"Authorization": "Bearer x"},
            )
            assert r.status_code == 400
            assert "себя" in r.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


def test_admin_stats_returns_full_shape_for_admin():
    """Admin → 200, shape с реальными + placeholder полями."""
    app.dependency_overrides[get_current_user] = lambda: _make_user(is_admin=True)
    app.dependency_overrides[get_current_admin] = lambda: _make_user(is_admin=True)

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

        try:
            with TestClient(app) as c:
                r = c.get("/api/admin/stats", headers={"Authorization": "Bearer x"})
                assert r.status_code == 200, r.text
                data = r.json()
                # реальные поля
                assert len(data["regs"]) == 90
                assert len(data["msgs"]) == 90
                assert len(data["dau"]) == 90
                assert len(data["labels"]) == 90
                assert data["kpis"]["users"]["total"] == 0
                assert data["live"]["online"] == 0
                # placeholder поля = null
                assert data["kpis"]["problems"] is None
                assert data["live"]["ws_connections"] is None
                assert data["funnel"] is None
                assert data["geo"] is None
                assert data["retention"] is None
        finally:
            app.dependency_overrides.clear()
