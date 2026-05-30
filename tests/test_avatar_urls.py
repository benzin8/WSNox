from unittest.mock import AsyncMock

import pytest

from messenger.backend.services.avatar_urls import AvatarUrls, resolve_avatar_urls


@pytest.mark.asyncio
async def test_none_avatar_returns_empty():
    storage = AsyncMock()
    result = await resolve_avatar_urls(storage, None)
    assert result == AvatarUrls(full=None, thumb=None, uploaded_at=None)
    storage.presigned_get.assert_not_called()


@pytest.mark.asyncio
async def test_none_storage_returns_empty():
    avatar = {"full_key": "k1", "thumb_key": "k2", "uploaded_at": "2026-05-30T00:00:00Z"}
    result = await resolve_avatar_urls(None, avatar)
    assert result == AvatarUrls(full=None, thumb=None, uploaded_at=None)


@pytest.mark.asyncio
async def test_valid_avatar_produces_two_urls():
    storage = AsyncMock()
    storage.presigned_get.side_effect = ["FULL_URL", "THUMB_URL"]
    avatar = {"full_key": "k1", "thumb_key": "k2", "uploaded_at": "2026-05-30T00:00:00Z"}

    result = await resolve_avatar_urls(storage, avatar)

    assert result.full == "FULL_URL"
    assert result.thumb == "THUMB_URL"
    assert result.uploaded_at == "2026-05-30T00:00:00Z"
    assert storage.presigned_get.await_count == 2


@pytest.mark.asyncio
async def test_missing_keys_returns_empty():
    storage = AsyncMock()
    avatar = {"full_key": None, "thumb_key": None}
    result = await resolve_avatar_urls(storage, avatar)
    assert result == AvatarUrls(full=None, thumb=None, uploaded_at=None)
    storage.presigned_get.assert_not_called()
