"""Тесты официального канала WSNox: RBAC-гейт постинга + сервис канала."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.main import app
from messenger.backend.core.permissions import (
    PERM_POST_ANNOUNCEMENTS,
    has_permission,
)
from messenger.backend.db import get_db_session
from messenger.backend.services import announcements as ann
from messenger.backend.models.chat import Chat

from tests.test_admin_endpoints import _cached


# --- permission matrix -------------------------------------------------------

def test_post_announcements_permission_by_role():
    assert not has_permission("user", PERM_POST_ANNOUNCEMENTS)
    assert not has_permission("moderator", PERM_POST_ANNOUNCEMENTS)
    assert has_permission("admin", PERM_POST_ANNOUNCEMENTS)
    assert has_permission("owner", PERM_POST_ANNOUNCEMENTS)


# --- endpoint gate -----------------------------------------------------------

def _override_db():
    session = MagicMock()
    session.commit = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: session
    return session


def test_announcement_forbidden_for_user_and_moderator():
    for role in ("user", "moderator"):
        app.dependency_overrides[get_current_user] = lambda r=role: _cached(role=r)
        try:
            with TestClient(app) as c:
                r = c.post("/api/admin/announcements", json={"text": "hi"},
                           headers={"Authorization": "Bearer x"})
                assert r.status_code == 403
        finally:
            app.dependency_overrides.clear()


def test_announcement_empty_text_rejected():
    app.dependency_overrides[get_current_user] = lambda: _cached(role="admin")
    _override_db()
    try:
        with TestClient(app) as c:
            r = c.post("/api/admin/announcements", json={"text": "   "},
                       headers={"Authorization": "Bearer x"})
            assert r.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_announcement_admin_posts_ok():
    app.dependency_overrides[get_current_user] = lambda: _cached(role="admin")
    _override_db()
    chat = Chat(chat_type="channel", name="WSNox")
    chat.id = 7
    try:
        with patch("messenger.backend.services.announcements.get_or_create_channel",
                   new=AsyncMock(return_value=chat)), \
             patch("messenger.backend.app.ws.router.manager.send_personal_message",
                   new=AsyncMock(return_value=42)):
            with TestClient(app) as c:
                r = c.post("/api/admin/announcements", json={"text": "Новая фича!"},
                           headers={"Authorization": "Bearer x"})
                assert r.status_code == 200
                body = r.json()
                assert body["chat_id"] == 7
                assert body["message_id"] == 42
    finally:
        app.dependency_overrides.clear()


# --- service -----------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_or_create_channel_returns_existing():
    existing = Chat(chat_type="channel", name="WSNox")
    existing.id = 3
    session = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=existing)
    session.execute = AsyncMock(return_value=result)
    session.add = MagicMock()
    session.flush = AsyncMock()

    chat = await ann.get_or_create_channel(session)
    assert chat is existing
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_get_or_create_channel_creates_when_missing():
    session = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=None)
    session.execute = AsyncMock(return_value=result)
    session.add = MagicMock()
    session.flush = AsyncMock()

    chat = await ann.get_or_create_channel(session)
    assert chat.chat_type == ann.CHANNEL_TYPE
    session.add.assert_called_once()
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_ensure_member_adds_when_absent():
    session = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=None)
    session.execute = AsyncMock(return_value=result)
    session.add = MagicMock()

    added = await ann.ensure_member(session, chat_id=1, user_id=9)
    assert added is True
    session.add.assert_called_once()


@pytest.mark.asyncio
async def test_ensure_member_noop_when_present():
    session = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=9)
    session.execute = AsyncMock(return_value=result)
    session.add = MagicMock()

    added = await ann.ensure_member(session, chat_id=1, user_id=9)
    assert added is False
    session.add.assert_not_called()
