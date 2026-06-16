"""Тесты ядра кэша: cached() read-through + invalidate(), fail-open и kill-switch."""
import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import RedisError

from messenger.backend.core import cache as cache_mod
from messenger.backend.core.cache import (
    ADMIN_LIVE_TTL,
    ADMIN_STATS_TTL,
    AVATAR_URL_TTL,
    CHATLIST_TTL,
    MEMBERS_TTL,
    NOTIF_PREF_TTL,
    PARTNERS_TTL,
    PREFS_TTL,
    PUSH_SUBS_TTL,
    UNREAD_TTL,
    USER_AUTH_TTL,
    admin_live,
    admin_stats,
    avatar_url,
    cached,
    chat_partners,
    chatlist,
    chats_of,
    chats_unread,
    invalidate,
    members,
    notif_dnd,
    notif_muted,
    prefs_rr,
    push_subs,
    unread_total,
    user_auth,
)


@pytest.mark.asyncio
async def test_miss_populates_and_returns(fake_redis):
    """Промах: loader вызывается, значение возвращается и пишется в Redis."""
    loader = AsyncMock(return_value={"a": 1})

    result = await cached(fake_redis, "cache:test:x", 60, loader)

    assert result == {"a": 1}
    assert loader.await_count == 1
    assert await fake_redis.get("cache:test:x") == json.dumps({"a": 1})


@pytest.mark.asyncio
async def test_hit_skips_loader(fake_redis):
    """Попадание: loader НЕ вызывается, возвращается десериализованное значение."""
    await fake_redis.set("cache:test:x", json.dumps({"a": 1}), ex=60)
    loader = AsyncMock(return_value={"a": 999})

    result = await cached(fake_redis, "cache:test:x", 60, loader)

    assert result == {"a": 1}
    assert loader.await_count == 0


@pytest.mark.asyncio
async def test_fail_open_on_redis_error_returns_loader(fake_redis):
    """RedisError на GET → fail-open: loader всё равно отдаёт значение."""
    broken = MagicMock()
    broken.get = AsyncMock(side_effect=RedisError("boom"))
    loader = AsyncMock(return_value={"a": 1})

    result = await cached(broken, "cache:test:x", 60, loader)

    assert result == {"a": 1}
    assert loader.await_count == 1


@pytest.mark.asyncio
async def test_kill_switch_bypasses_redis(fake_redis, monkeypatch):
    """cache_data_enabled=False → сразу loader, Redis не трогается вообще."""
    monkeypatch.setattr(cache_mod.settings, "cache_data_enabled", False)
    redis = MagicMock()
    redis.get = AsyncMock(side_effect=AssertionError("redis.get must not be called"))
    redis.set = AsyncMock(side_effect=AssertionError("redis.set must not be called"))
    loader = AsyncMock(return_value={"a": 1})

    result = await cached(redis, "cache:test:x", 60, loader)

    assert result == {"a": 1}
    assert loader.await_count == 1
    redis.get.assert_not_awaited()
    redis.set.assert_not_awaited()


@pytest.mark.asyncio
async def test_set_failure_still_returns_value(fake_redis):
    """RedisError на SET после промаха не должна ломать вызов — значение возвращается."""
    broken = MagicMock()
    broken.get = AsyncMock(return_value=None)
    broken.set = AsyncMock(side_effect=RedisError("boom"))
    loader = AsyncMock(return_value={"a": 1})

    result = await cached(broken, "cache:test:x", 60, loader)

    assert result == {"a": 1}
    assert loader.await_count == 1


@pytest.mark.asyncio
async def test_invalidate_deletes_keys(fake_redis):
    """invalidate() удаляет переданные ключи."""
    await fake_redis.set("cache:a", "1")
    await fake_redis.set("cache:b", "2")

    await invalidate(fake_redis, "cache:a", "cache:b")

    assert await fake_redis.get("cache:a") is None
    assert await fake_redis.get("cache:b") is None


@pytest.mark.asyncio
async def test_invalidate_empty_is_noop(fake_redis):
    """invalidate() без ключей — no-op, delete не вызывается."""
    redis = MagicMock()
    redis.delete = AsyncMock(side_effect=AssertionError("delete must not be called"))

    await invalidate(redis)

    redis.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_invalidate_fail_open_on_redis_error():
    """RedisError на DELETE проглатывается — исключение наружу не летит."""
    broken = MagicMock()
    broken.delete = AsyncMock(side_effect=RedisError("boom"))

    await invalidate(broken, "cache:a")  # must not raise


def test_key_builders_and_ttls():
    """Канонические имена ключей и значения TTL зафиксированы контрактом."""
    assert user_auth(7) == "cache:user:auth:7"
    assert notif_dnd(7) == "cache:notif:dnd:7"
    assert notif_muted(7) == "cache:notif:muted:7"
    assert push_subs(7) == "cache:push:subs:7"
    assert chat_partners(7) == "cache:chat_partners:7"
    assert members(42) == "cache:members:42"
    assert chats_of(7) == "cache:chats_of:7"
    assert prefs_rr(7) == "cache:prefs:rr:7"
    assert unread_total(7) == "cache:unread:total:7"
    assert chats_unread(7) == "cache:chats:unread:7"
    assert chatlist(7) == "cache:chatlist:7"
    assert avatar_url("dev/avatars/abc.jpg") == "cache:avatar_urls:dev/avatars/abc.jpg"
    assert admin_stats() == "cache:admin:stats"
    assert admin_live() == "cache:admin:live"

    assert USER_AUTH_TTL == 60
    assert NOTIF_PREF_TTL == 600
    assert PUSH_SUBS_TTL == 1800
    assert PARTNERS_TTL == 600
    assert MEMBERS_TTL == 3600
    assert PREFS_TTL == 300
    assert UNREAD_TTL == 300
    assert CHATLIST_TTL == 90
    assert AVATAR_URL_TTL == 3000
    assert ADMIN_STATS_TTL == 60
    assert ADMIN_LIVE_TTL == 12
