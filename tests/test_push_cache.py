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


# --- Task 2.4: push subscriptions cache -------------------------------------
from unittest.mock import patch  # noqa: E402

from messenger.backend.app.crud.push_subscription import (  # noqa: E402
    PushSubscriptionCRUD,
    cached_push_subs,
)
from messenger.backend.core.cache import push_subs  # noqa: E402


@pytest.mark.asyncio
async def test_cached_push_subs_empty_is_cached(fake_redis, monkeypatch):
    """Юзер без подписок: пустой список кэшируется, БД не дёргается повторно."""
    db = MagicMock()
    spy = AsyncMock(return_value=[])
    monkeypatch.setattr(PushSubscriptionCRUD, "get_by_user_id", spy)

    assert await cached_push_subs(fake_redis, db, 42) == []
    assert json.loads(await fake_redis.get(push_subs(42))) == []
    assert await cached_push_subs(fake_redis, db, 42) == []
    assert spy.await_count == 1


@pytest.mark.asyncio
async def test_cached_push_subs_projects_dicts(fake_redis, monkeypatch):
    db = MagicMock()
    row = MagicMock(id=5, endpoint="https://e", p256dh="P", auth="A")
    monkeypatch.setattr(PushSubscriptionCRUD, "get_by_user_id", AsyncMock(return_value=[row]))

    subs = await cached_push_subs(fake_redis, db, 42)
    assert subs == [{"id": 5, "endpoint": "https://e", "p256dh": "P", "auth": "A"}]


@pytest.mark.asyncio
async def test_create_busts_push_subs(fake_redis):
    await fake_redis.set(push_subs(42), json.dumps([]))
    db = MagicMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    await PushSubscriptionCRUD.create(
        db, user_id=42, endpoint="https://e", p256dh="P", auth="A", redis=fake_redis
    )
    assert await fake_redis.get(push_subs(42)) is None


@pytest.mark.asyncio
async def test_delete_by_id_busts_push_subs(fake_redis):
    await fake_redis.set(push_subs(42), json.dumps([{"id": 5}]))
    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    await PushSubscriptionCRUD.delete_by_id(db, 5, user_id=42, redis=fake_redis)
    assert await fake_redis.get(push_subs(42)) is None


@pytest.mark.asyncio
async def test_delete_by_endpoint_busts_push_subs(fake_redis):
    await fake_redis.set(push_subs(42), json.dumps([{"id": 5}]))
    db = MagicMock()
    rowcount = MagicMock(rowcount=1)
    db.execute = AsyncMock(return_value=rowcount)
    db.commit = AsyncMock()
    await PushSubscriptionCRUD.delete_by_endpoint(
        db, "https://e", user_id=42, redis=fake_redis
    )
    assert await fake_redis.get(push_subs(42)) is None


@pytest.mark.asyncio
async def test_subscribe_transfer_busts_both_uids(fake_redis):
    """endpoint переходит от uid=1 к uid=2: бьём ОБА ключа push:subs."""
    from messenger.backend.app.api_v1.routers import push_router as pr

    await fake_redis.set(push_subs(1), json.dumps([{"id": 5}]))
    await fake_redis.set(push_subs(2), json.dumps([]))

    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.add = MagicMock()
    db.refresh = AsyncMock()

    existing = MagicMock(user_id=1)
    user = MagicMock(id=2)

    with (
        patch.object(pr.PushSubscriptionCRUD, "get_by_endpoint",
                     new=AsyncMock(return_value=existing)),
        patch.object(pr.PushSubscriptionCRUD, "delete_by_endpoint",
                     new=AsyncMock(return_value=True)),
        patch.object(pr.PushSubscriptionCRUD, "create",
                     new=AsyncMock()),
        patch.object(pr, "get_redis", return_value=fake_redis),
    ):
        body = pr.PushSubscribeRequest(endpoint="https://e", p256dh="P", auth="A")
        await pr.subscribe(body=body, user=user, db=db)

        # The router computed both old (uid=1) and new (uid=2) owners and passed
        # them to the CRUD mutators (which bust each user's push:subs key).
        pr.PushSubscriptionCRUD.delete_by_endpoint.assert_awaited_once()
        assert pr.PushSubscriptionCRUD.delete_by_endpoint.await_args.kwargs["user_id"] == 1
        pr.PushSubscriptionCRUD.create.assert_awaited_once()
        assert pr.PushSubscriptionCRUD.create.await_args.kwargs["user_id"] == 2


@pytest.mark.asyncio
async def test_send_push_uses_cached_subs_and_busts_on_410(fake_redis):
    """send_push_to_user читает подписки из кэша; на 410 удаляет и бьёт кэш."""
    from pywebpush import WebPushException

    from messenger.backend.app.ws import push as push_mod

    await fake_redis.set(
        push_subs(42),
        json.dumps([{"id": 5, "endpoint": "https://e", "p256dh": "P", "auth": "A"}]),
    )

    resp = MagicMock(status_code=410)
    exc = WebPushException("gone", response=resp)

    inner = MagicMock(execute=AsyncMock(), commit=AsyncMock())
    db_ctx = MagicMock()
    db_ctx.__aenter__ = AsyncMock(return_value=inner)
    db_ctx.__aexit__ = AsyncMock(return_value=False)

    with (
        patch.object(push_mod, "get_redis", return_value=fake_redis),
        patch.object(push_mod, "AsyncSessionLocal", return_value=db_ctx),
        patch.object(push_mod.settings, "vapid_private_key", "x"),
        patch.object(push_mod.settings, "vapid_public_key", "y"),
        patch.object(push_mod, "webpush", side_effect=exc),
        patch.object(push_mod.PushSubscriptionCRUD, "delete_by_id",
                     new=AsyncMock()) as m_del,
    ):
        await push_mod.send_push_to_user(42, {"title": "hi"})

    m_del.assert_awaited_once()
    assert m_del.await_args.kwargs.get("user_id") == 42
