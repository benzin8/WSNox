"""Smoke-тесты эндпойнтов /api/admin/*: shape, auth-gate."""
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from messenger.backend.app.api_v1.auth.dependencies import (
    get_current_admin,
    get_current_user,
)
from messenger.backend.app.main import app
from messenger.backend.models.user import User


def _make_user(is_admin: bool = False) -> User:
    u = User(id=1, name="A", username="admin", email="a@example.com", hashed_password="x")
    u.is_admin = is_admin
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
