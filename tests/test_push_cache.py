"""Phase 2 — push fan-out caches: DND, muted set, push subscriptions."""
import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import RedisError

from messenger.backend.app.crud.notification import (
    NotificationCRUD,
    cached_get_dnd,
    cached_muted_chat_ids,
)
from messenger.backend.core.cache import notif_dnd, notif_muted


@pytest.mark.asyncio
async def test_cached_get_dnd_caches_negative_case(fake_redis, monkeypatch):
    """DND off (False) must be cached too — иначе горячий путь всегда бьёт БД."""
    spy = AsyncMock(return_value=False)
    monkeypatch.setattr(NotificationCRUD, "get_dnd", spy)
    db = MagicMock()

    # First call: miss -> loader awaited, value cached.
    assert await cached_get_dnd(fake_redis, db, 42) is False
    assert spy.await_count == 1
    assert await fake_redis.get(notif_dnd(42)) == json.dumps(False)
    # Second call: hit -> loader NOT awaited again.
    assert await cached_get_dnd(fake_redis, db, 42) is False
    assert spy.await_count == 1


@pytest.mark.asyncio
async def test_cached_get_dnd_fail_open(fake_redis, monkeypatch):
    """RedisError -> loader still runs, value returned (fail-open)."""
    broken = MagicMock()
    broken.get = AsyncMock(side_effect=RedisError("boom"))
    spy = AsyncMock(return_value=True)
    monkeypatch.setattr(NotificationCRUD, "get_dnd", spy)
    db = MagicMock()

    assert await cached_get_dnd(broken, db, 42) is True
    assert spy.await_count == 1


@pytest.mark.asyncio
async def test_set_dnd_busts_cache(fake_redis):
    """set_dnd commits then DELetes cache:notif:dnd:{uid}."""
    await fake_redis.set(notif_dnd(42), json.dumps(False))
    db = MagicMock()
    db.commit = AsyncMock()
    profile = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=profile)
    db.execute = AsyncMock(return_value=result)

    ok = await NotificationCRUD.set_dnd(db, 42, True, redis=fake_redis)

    assert ok is True
    assert db.commit.await_count == 1
    assert await fake_redis.get(notif_dnd(42)) is None


@pytest.mark.asyncio
async def test_cached_muted_chat_ids_hit_and_membership(fake_redis, monkeypatch):
    db = MagicMock()
    spy = AsyncMock(return_value=[7, 9])
    monkeypatch.setattr(NotificationCRUD, "list_muted_chat_ids", spy)

    ids = await cached_muted_chat_ids(fake_redis, db, 42)
    assert ids == [7, 9]
    assert 7 in ids and 5 not in ids
    assert spy.await_count == 1
    # Hit -> loader not re-awaited.
    assert await cached_muted_chat_ids(fake_redis, db, 42) == [7, 9]
    assert spy.await_count == 1
    assert json.loads(await fake_redis.get(notif_muted(42))) == [7, 9]


@pytest.mark.asyncio
async def test_cached_muted_empty_case(fake_redis, monkeypatch):
    """Не-muted (пустой список) кэшируется тоже."""
    db = MagicMock()
    monkeypatch.setattr(NotificationCRUD, "list_muted_chat_ids", AsyncMock(return_value=[]))

    assert await cached_muted_chat_ids(fake_redis, db, 42) == []
    assert json.loads(await fake_redis.get(notif_muted(42))) == []


@pytest.mark.asyncio
async def test_set_chat_mute_busts_cache_mute(fake_redis):
    await fake_redis.set(notif_muted(42), json.dumps([]))
    db = MagicMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock()

    await NotificationCRUD.set_chat_mute(db, 42, 7, True, redis=fake_redis)

    assert db.commit.await_count == 1
    assert await fake_redis.get(notif_muted(42)) is None


@pytest.mark.asyncio
async def test_set_chat_mute_busts_cache_unmute(fake_redis):
    await fake_redis.set(notif_muted(42), json.dumps([7]))
    db = MagicMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock()

    await NotificationCRUD.set_chat_mute(db, 42, 7, False, redis=fake_redis)

    assert db.commit.await_count == 1
    assert await fake_redis.get(notif_muted(42)) is None
