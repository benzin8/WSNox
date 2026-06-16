"""Phase 5.4: admin dashboard caches — stats (TTL 60) and live (TTL 12)."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import RedisError

from messenger.backend.core.cache import (
    ADMIN_LIVE_TTL,
    ADMIN_STATS_TTL,
    admin_live,
    admin_stats,
)
from messenger.backend.services.admin_cache import (
    bucketed_utc_now,
    get_dashboard_stats_cached,
    get_live_block_cached,
)


def test_bucketed_now_floors_to_utc_day():
    n = datetime(2026, 6, 16, 13, 47, 9, tzinfo=timezone.utc)
    b = bucketed_utc_now(n)
    assert (b.hour, b.minute, b.second, b.microsecond) == (0, 0, 0, 0)
    assert (b.year, b.month, b.day) == (2026, 6, 16)
    assert b.tzinfo == timezone.utc


@pytest.mark.asyncio
async def test_stats_cached_loader_runs_once(fake_redis):
    calls = {"n": 0}

    async def loader():
        calls["n"] += 1
        return {"regs": [1, 2, 3], "labels": ["a", "b", "c"]}

    r1 = await get_dashboard_stats_cached(fake_redis, loader)
    r2 = await get_dashboard_stats_cached(fake_redis, loader)
    assert r1 == r2 == {"regs": [1, 2, 3], "labels": ["a", "b", "c"]}
    assert calls["n"] == 1  # второй раз — из кэша
    assert await fake_redis.ttl(admin_stats()) <= ADMIN_STATS_TTL
    assert await fake_redis.ttl(admin_stats()) > 0


@pytest.mark.asyncio
async def test_live_cached_loader_runs_once(fake_redis):
    calls = {"n": 0}

    async def loader():
        calls["n"] += 1
        return {"online": 42, "msgs_per_min": 7}

    await get_live_block_cached(fake_redis, loader)
    out = await get_live_block_cached(fake_redis, loader)
    assert out == {"online": 42, "msgs_per_min": 7}
    assert calls["n"] == 1
    assert 0 < await fake_redis.ttl(admin_live()) <= ADMIN_LIVE_TTL


@pytest.mark.asyncio
async def test_stats_failopen_runs_loader_on_rediserror():
    broken = MagicMock()
    broken.get = AsyncMock(side_effect=RedisError("boom"))

    async def loader():
        return {"ok": True}

    assert await get_dashboard_stats_cached(broken, loader) == {"ok": True}


@pytest.mark.asyncio
async def test_stats_and_live_use_distinct_keys(fake_redis):
    async def sloader():
        return {"s": 1}

    async def lloader():
        return {"l": 1}

    await get_dashboard_stats_cached(fake_redis, sloader)
    await get_live_block_cached(fake_redis, lloader)
    assert admin_stats() != admin_live()
    assert await fake_redis.exists(admin_stats()) == 1
    assert await fake_redis.exists(admin_live()) == 1
