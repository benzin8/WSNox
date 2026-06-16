"""Phase 3: тесты кэша членства и партнёров (chat_partners / members / chats_of).

Кэши читаются в WS-воркерах, мутируются в HTTP-воркерах → инвалидация
проверяется ИСКЛЮЧИТЕЛЬНО через общий Redis (fake_redis), не in-process.
"""
import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import RedisError

from messenger.backend.app.crud import chat as chat_crud
from messenger.backend.core.cache import (
    chat_partners,
    chats_of,
    members,
    notif_muted,
    push_subs,
)


# ---------- cached_chat_partners ----------

@pytest.mark.asyncio
async def test_cached_chat_partners_miss_loads_and_stores(fake_redis, monkeypatch):
    loader = AsyncMock(return_value=[2, 3, 4])
    monkeypatch.setattr(chat_crud.ChatCRUD, "get_chat_partners", loader)
    session = MagicMock()

    result = await chat_crud.cached_chat_partners(fake_redis, session, 1)

    assert result == [2, 3, 4]
    assert loader.await_count == 1
    assert json.loads(await fake_redis.get(chat_partners(1))) == [2, 3, 4]


@pytest.mark.asyncio
async def test_cached_chat_partners_hit_skips_loader(fake_redis, monkeypatch):
    await fake_redis.set(chat_partners(1), json.dumps([7, 8]))
    loader = AsyncMock(return_value=[999])
    monkeypatch.setattr(chat_crud.ChatCRUD, "get_chat_partners", loader)

    result = await chat_crud.cached_chat_partners(fake_redis, MagicMock(), 1)

    assert result == [7, 8]
    assert loader.await_count == 0


@pytest.mark.asyncio
async def test_cached_chat_partners_fail_open_on_redis_error(monkeypatch):
    loader = AsyncMock(return_value=[5])
    monkeypatch.setattr(chat_crud.ChatCRUD, "get_chat_partners", loader)
    broken = MagicMock()
    broken.get = AsyncMock(side_effect=RedisError("boom"))

    result = await chat_crud.cached_chat_partners(broken, MagicMock(), 1)

    assert result == [5]
    assert loader.await_count == 1


# ---------- cached_member_ids ----------

@pytest.mark.asyncio
async def test_cached_member_ids_miss_loads_and_stores(fake_redis, monkeypatch):
    loader = AsyncMock(return_value=[1, 2, 3])
    monkeypatch.setattr(chat_crud.ChatCRUD, "get_member_ids", loader)

    result = await chat_crud.cached_member_ids(fake_redis, MagicMock(), 42)

    assert result == [1, 2, 3]
    assert loader.await_count == 1
    assert json.loads(await fake_redis.get(members(42))) == [1, 2, 3]


@pytest.mark.asyncio
async def test_cached_member_ids_hit_skips_loader(fake_redis, monkeypatch):
    await fake_redis.set(members(42), json.dumps([9, 10]))
    loader = AsyncMock(return_value=[111])
    monkeypatch.setattr(chat_crud.ChatCRUD, "get_member_ids", loader)

    result = await chat_crud.cached_member_ids(fake_redis, MagicMock(), 42)

    assert result == [9, 10]
    assert loader.await_count == 0


@pytest.mark.asyncio
async def test_cached_member_ids_fail_open_on_redis_error(monkeypatch):
    loader = AsyncMock(return_value=[1, 2])
    monkeypatch.setattr(chat_crud.ChatCRUD, "get_member_ids", loader)
    broken = MagicMock()
    broken.get = AsyncMock(side_effect=RedisError("boom"))

    result = await chat_crud.cached_member_ids(broken, MagicMock(), 42)

    assert result == [1, 2]
    assert loader.await_count == 1


# ---------- cached_chats_of / cached_is_chat_member ----------

@pytest.mark.asyncio
async def test_cached_chats_of_miss_loads_and_stores(fake_redis, monkeypatch):
    loader = AsyncMock(return_value=[10, 20, 30])
    monkeypatch.setattr(chat_crud, "_chats_of_loader", loader)

    result = await chat_crud.cached_chats_of(fake_redis, MagicMock(), 5)

    assert result == [10, 20, 30]
    assert loader.await_count == 1
    assert json.loads(await fake_redis.get(chats_of(5))) == [10, 20, 30]


@pytest.mark.asyncio
async def test_cached_is_chat_member_consults_chats_of(fake_redis, monkeypatch):
    await fake_redis.set(chats_of(5), json.dumps([10, 20, 30]))
    loader = AsyncMock(return_value=[999])  # must NOT be called on hit
    monkeypatch.setattr(chat_crud, "_chats_of_loader", loader)

    assert await chat_crud.cached_is_chat_member(fake_redis, MagicMock(), 20, 5) is True
    assert await chat_crud.cached_is_chat_member(fake_redis, MagicMock(), 99, 5) is False
    assert loader.await_count == 0


@pytest.mark.asyncio
async def test_cached_is_chat_member_fail_open(monkeypatch):
    loader = AsyncMock(return_value=[10, 20])
    monkeypatch.setattr(chat_crud, "_chats_of_loader", loader)
    broken = MagicMock()
    broken.get = AsyncMock(side_effect=RedisError("boom"))

    assert await chat_crud.cached_is_chat_member(broken, MagicMock(), 10, 5) is True
    assert loader.await_count == 1


# ---------- invalidate_membership ----------

@pytest.mark.asyncio
async def test_invalidate_membership_busts_all_three_caches(fake_redis):
    await fake_redis.set(members(42), json.dumps([1, 2]))
    await fake_redis.set(chat_partners(1), json.dumps([2]))
    await fake_redis.set(chat_partners(2), json.dumps([1]))
    await fake_redis.set(chats_of(1), json.dumps([42]))
    await fake_redis.set(chats_of(2), json.dumps([42]))

    await chat_crud.invalidate_membership(fake_redis, user_ids=[1, 2], chat_id=42)

    assert await fake_redis.get(members(42)) is None
    assert await fake_redis.get(chat_partners(1)) is None
    assert await fake_redis.get(chat_partners(2)) is None
    assert await fake_redis.get(chats_of(1)) is None
    assert await fake_redis.get(chats_of(2)) is None


@pytest.mark.asyncio
async def test_invalidate_membership_with_notif_busts_mutes_and_subs(fake_redis):
    await fake_redis.set(members(42), json.dumps([1, 2]))
    await fake_redis.set(notif_muted(1), json.dumps([42]))
    await fake_redis.set(push_subs(1), json.dumps([{"endpoint": "x"}]))
    await fake_redis.set(notif_muted(2), json.dumps([]))
    await fake_redis.set(push_subs(2), json.dumps([]))

    await chat_crud.invalidate_membership(
        fake_redis, user_ids=[1, 2], chat_id=42, bust_notif=True
    )

    assert await fake_redis.get(notif_muted(1)) is None
    assert await fake_redis.get(push_subs(1)) is None
    assert await fake_redis.get(notif_muted(2)) is None
    assert await fake_redis.get(push_subs(2)) is None
    assert await fake_redis.get(members(42)) is None


@pytest.mark.asyncio
async def test_invalidate_membership_fail_open_on_redis_error():
    broken = MagicMock()
    broken.delete = AsyncMock(side_effect=RedisError("boom"))
    await chat_crud.invalidate_membership(broken, user_ids=[1], chat_id=42)


@pytest.mark.asyncio
async def test_private_create_affected_set_is_both_participants(fake_redis):
    await fake_redis.set(chat_partners(1), json.dumps([99]))
    await fake_redis.set(chat_partners(7), json.dumps([99]))
    await fake_redis.set(members(55), json.dumps([1, 7]))
    await fake_redis.set(chats_of(1), json.dumps([55]))
    await fake_redis.set(chats_of(7), json.dumps([55]))

    await chat_crud.invalidate_membership(fake_redis, user_ids=[1, 7], chat_id=55)

    for key in (chat_partners(1), chat_partners(7), members(55), chats_of(1), chats_of(7)):
        assert await fake_redis.get(key) is None


@pytest.mark.asyncio
async def test_invalidation_visible_cross_worker_via_shared_redis(fake_redis, monkeypatch):
    """Кэш записан 'WS-воркером', инвалидация 'HTTP-воркером' видна через общий Redis."""
    loader = AsyncMock(return_value=[1, 2])
    monkeypatch.setattr(chat_crud.ChatCRUD, "get_member_ids", loader)
    await chat_crud.cached_member_ids(fake_redis, MagicMock(), 42)
    assert await fake_redis.get(members(42)) is not None

    await chat_crud.invalidate_membership(fake_redis, user_ids=[1, 2], chat_id=42)
    assert await fake_redis.get(members(42)) is None
