"""Tests for ConnectionManager._should_push notification gating.

Verifies that pushes are suppressed when the user is viewing the chat
(within the grace window), has DND on, or has the chat muted — and sent
otherwise.
"""

from unittest.mock import AsyncMock, patch

import pytest

from messenger.backend.app.ws.router import ConnectionManager
from messenger.backend.app.ws.viewing_chat import set_viewing_chat


@pytest.fixture
def manager():
    return ConnectionManager()


@pytest.fixture
def patch_db_session():
    """Replace AsyncSessionLocal with a no-op context manager.

    NotificationCRUD calls are patched separately, so the session itself is
    never used — but `_should_push` opens it via `async with`.
    """
    with patch("messenger.backend.app.ws.router.AsyncSessionLocal") as mock_factory:
        ctx = AsyncMock()
        ctx.__aenter__.return_value = AsyncMock()
        ctx.__aexit__.return_value = False
        mock_factory.return_value = ctx
        yield mock_factory


@pytest.fixture
def patch_crud():
    """Patch the cached DND/muted wrappers used by _should_push.

    cached_get_dnd -> bool; cached_muted_chat_ids -> list[int] (muted iff
    chat_id is in the list).
    """
    with (
        patch(
            "messenger.backend.app.ws.router.cached_get_dnd",
            new_callable=AsyncMock,
        ) as mock_dnd,
        patch(
            "messenger.backend.app.ws.router.cached_muted_chat_ids",
            new_callable=AsyncMock,
        ) as mock_muted,
    ):
        mock_dnd.return_value = False
        mock_muted.return_value = []
        yield mock_dnd, mock_muted


@pytest.fixture
def patch_redis(fake_redis):
    with patch(
        "messenger.backend.app.ws.router.get_redis", return_value=fake_redis
    ):
        yield fake_redis


@pytest.mark.asyncio
async def test_pushes_when_no_filter_matches(
    manager, patch_db_session, patch_crud, patch_redis
):
    assert await manager._should_push(recipient_id=42, chat_id=7) is True


@pytest.mark.asyncio
async def test_suppresses_when_viewing_same_chat(
    manager, patch_db_session, patch_crud, patch_redis
):
    await set_viewing_chat(patch_redis, user_id=42, chat_id=7)
    assert await manager._should_push(recipient_id=42, chat_id=7) is False


@pytest.mark.asyncio
async def test_pushes_when_viewing_different_chat(
    manager, patch_db_session, patch_crud, patch_redis
):
    await set_viewing_chat(patch_redis, user_id=42, chat_id=99)
    assert await manager._should_push(recipient_id=42, chat_id=7) is True


@pytest.mark.asyncio
async def test_suppresses_when_dnd_on(
    manager, patch_db_session, patch_crud, patch_redis
):
    mock_dnd, _ = patch_crud
    mock_dnd.return_value = True
    assert await manager._should_push(recipient_id=42, chat_id=7) is False


@pytest.mark.asyncio
async def test_suppresses_when_chat_muted(
    manager, patch_db_session, patch_crud, patch_redis
):
    _, mock_muted = patch_crud
    mock_muted.return_value = [7]
    assert await manager._should_push(recipient_id=42, chat_id=7) is False
