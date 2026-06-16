"""Phase 4 cache: read-receipt prefs (prefs_rr) and global unread total.

Conventions: pytest-asyncio (asyncio_mode=auto), the shared `fake_redis`
fixture from tests/conftest.py, mocked DB sessions / AsyncMock loaders.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import RedisError

from messenger.backend.app.crud.notification import (
    NotificationCRUD,
    cached_read_receipts_enabled,
    should_expose_read_receipts,
)
from messenger.backend.core.cache import prefs_rr, unread_total


# ---------------------------------------------------------------------------
# cached_read_receipts_enabled
# ---------------------------------------------------------------------------

def _rr_session(value):
    """Session whose Profile.read_receipts_enabled scalar resolves to `value`."""
    session = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_rr_miss_then_hit_caches(fake_redis):
    """First call loads from DB and writes cache; second call skips DB."""
    session = _rr_session(True)
    first = await cached_read_receipts_enabled(fake_redis, session, 7)
    assert first is True
    assert session.execute.call_count == 1
    assert await fake_redis.get(prefs_rr(7)) == "true"

    second = await cached_read_receipts_enabled(fake_redis, session, 7)
    assert second is True
    assert session.execute.call_count == 1  # cache hit, no new DB query


@pytest.mark.asyncio
async def test_rr_caches_disabled_value(fake_redis):
    session = _rr_session(False)
    assert await cached_read_receipts_enabled(fake_redis, session, 7) is False
    assert await fake_redis.get(prefs_rr(7)) == "false"


@pytest.mark.asyncio
async def test_rr_fail_open_on_redis_error():
    """RedisError on GET -> fall through to the DB loader, value returned."""
    broken = MagicMock()
    broken.get = AsyncMock(side_effect=RedisError("boom"))
    broken.set = AsyncMock()
    session = _rr_session(True)
    assert await cached_read_receipts_enabled(broken, session, 7) is True
    assert session.execute.call_count == 1


@pytest.mark.asyncio
async def test_set_read_receipts_busts_cache(fake_redis):
    """set_read_receipts_enabled DELs prefs_rr(uid) after commit."""
    await fake_redis.set(prefs_rr(7), "true", ex=300)
    profile = MagicMock()
    profile.read_receipts_enabled = True
    result = MagicMock()
    result.scalar_one_or_none.return_value = profile
    session = MagicMock()
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()

    ok = await NotificationCRUD.set_read_receipts_enabled(
        session, 7, False, redis=fake_redis
    )
    assert ok is True
    assert session.commit.await_count == 1
    assert await fake_redis.get(prefs_rr(7)) is None  # key busted


@pytest.mark.asyncio
async def test_set_read_receipts_missing_profile_no_commit(fake_redis):
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    session = MagicMock()
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()

    ok = await NotificationCRUD.set_read_receipts_enabled(
        session, 7, False, redis=fake_redis
    )
    assert ok is False
    assert session.commit.await_count == 0


# ---------------------------------------------------------------------------
# should_expose_read_receipts via two cached lookups
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_expose_true_when_both_enabled(fake_redis):
    await fake_redis.set(prefs_rr(1), "true")
    await fake_redis.set(prefs_rr(2), "true")
    session = MagicMock()
    session.execute = AsyncMock()  # must NOT be hit (both cached)
    assert await should_expose_read_receipts(fake_redis, session, 1, 2) is True
    assert session.execute.call_count == 0


@pytest.mark.asyncio
async def test_expose_false_when_one_disabled(fake_redis):
    await fake_redis.set(prefs_rr(1), "true")
    await fake_redis.set(prefs_rr(2), "false")
    session = MagicMock()
    session.execute = AsyncMock()
    assert await should_expose_read_receipts(fake_redis, session, 1, 2) is False
    assert session.execute.call_count == 0
