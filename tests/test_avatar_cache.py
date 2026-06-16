"""Phase 5.3: avatar presigned-URL cache keyed by immutable S3 key."""
from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import RedisError

from messenger.backend.core.cache import AVATAR_URL_TTL, avatar_url
from messenger.backend.services.avatar_urls import (
    PRESIGN_TTL,
    resolve_avatar_thumb_url,
    resolve_avatar_urls,
)


def test_avatar_ttl_below_presign_ttl():
    assert AVATAR_URL_TTL < PRESIGN_TTL


@pytest.mark.asyncio
async def test_thumb_resolver_caches_and_reuses(fake_redis):
    storage = AsyncMock()
    storage.presigned_get.return_value = "SIGNED_THUMB"
    url1 = await resolve_avatar_thumb_url(storage, fake_redis, "dev/av/thumb.jpg")
    url2 = await resolve_avatar_thumb_url(storage, fake_redis, "dev/av/thumb.jpg")
    assert url1 == url2 == "SIGNED_THUMB"
    assert storage.presigned_get.await_count == 1
    assert await fake_redis.get(avatar_url("dev/av/thumb.jpg")) == "SIGNED_THUMB"


@pytest.mark.asyncio
async def test_thumb_resolver_none_storage_returns_none_and_no_cache(fake_redis):
    assert await resolve_avatar_thumb_url(None, fake_redis, "dev/av/thumb.jpg") is None
    assert await fake_redis.get(avatar_url("dev/av/thumb.jpg")) is None


@pytest.mark.asyncio
async def test_thumb_resolver_none_key_returns_none_and_no_cache(fake_redis):
    storage = AsyncMock()
    assert await resolve_avatar_thumb_url(storage, fake_redis, None) is None
    storage.presigned_get.assert_not_called()


@pytest.mark.asyncio
async def test_thumb_resolver_failopen_on_rediserror():
    storage = AsyncMock()
    storage.presigned_get.return_value = "SIGNED_THUMB"
    broken = MagicMock()
    broken.get = AsyncMock(side_effect=RedisError("boom"))
    broken.set = AsyncMock(side_effect=RedisError("boom"))
    url = await resolve_avatar_thumb_url(storage, broken, "dev/av/thumb.jpg")
    assert url == "SIGNED_THUMB"  # fail-open: presign всё равно отдали


@pytest.mark.asyncio
async def test_resolve_avatar_urls_caches_both_keys(fake_redis):
    storage = AsyncMock()
    storage.presigned_get.side_effect = ["FULL", "THUMB", "FULL2", "THUMB2"]
    avatar = {"full_key": "k_full", "thumb_key": "k_thumb", "uploaded_at": "2026-06-16T00:00:00Z"}
    r1 = await resolve_avatar_urls(storage, avatar, redis=fake_redis)
    r2 = await resolve_avatar_urls(storage, avatar, redis=fake_redis)
    assert r1.full == "FULL" and r1.thumb == "THUMB"
    assert r2.full == "FULL" and r2.thumb == "THUMB"
    assert storage.presigned_get.await_count == 2


@pytest.mark.asyncio
async def test_resolve_avatar_urls_without_redis_unchanged(fake_redis):
    """Без redis — старое поведение (всегда presign, без кэша)."""
    storage = AsyncMock()
    storage.presigned_get.side_effect = ["FULL", "THUMB"]
    avatar = {"full_key": "kf", "thumb_key": "kt", "uploaded_at": None}
    r = await resolve_avatar_urls(storage, avatar)
    assert r.full == "FULL" and r.thumb == "THUMB"
    assert storage.presigned_get.await_count == 2


@pytest.mark.asyncio
async def test_none_avatar_not_cached(fake_redis):
    storage = AsyncMock()
    r = await resolve_avatar_urls(storage, None, redis=fake_redis)
    assert r.full is None and r.thumb is None
    storage.presigned_get.assert_not_called()
    keys = [k async for k in fake_redis.scan_iter(match="cache:avatar_urls:*")]
    assert keys == []
