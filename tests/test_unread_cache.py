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


# ---------------------------------------------------------------------------
# cached_unread_total
# ---------------------------------------------------------------------------

from messenger.backend.app.crud.chat import ChatCRUD, cached_unread_total  # noqa: E402


@pytest.mark.asyncio
async def test_unread_total_miss_then_hit(fake_redis, monkeypatch):
    loader = AsyncMock(return_value=5)
    monkeypatch.setattr(ChatCRUD, "get_unread_total", staticmethod(loader))
    session = MagicMock()

    first = await cached_unread_total(fake_redis, session, 7)
    assert first == 5
    assert loader.await_count == 1
    assert await fake_redis.get(unread_total(7)) == "5"

    second = await cached_unread_total(fake_redis, session, 7)
    assert second == 5
    assert loader.await_count == 1  # served from cache


@pytest.mark.asyncio
async def test_unread_total_caches_zero(fake_redis, monkeypatch):
    loader = AsyncMock(return_value=0)
    monkeypatch.setattr(ChatCRUD, "get_unread_total", staticmethod(loader))
    session = MagicMock()
    assert await cached_unread_total(fake_redis, session, 7) == 0
    assert await fake_redis.get(unread_total(7)) == "0"


@pytest.mark.asyncio
async def test_unread_total_fail_open(monkeypatch):
    loader = AsyncMock(return_value=3)
    monkeypatch.setattr(ChatCRUD, "get_unread_total", staticmethod(loader))
    broken = MagicMock()
    broken.get = AsyncMock(side_effect=RedisError("boom"))
    broken.set = AsyncMock()
    session = MagicMock()
    assert await cached_unread_total(broken, session, 7) == 3
    assert loader.await_count == 1


# ---------------------------------------------------------------------------
# DEL-on-write: message create / read / delete bust unread_total
# ---------------------------------------------------------------------------

from messenger.backend.app.crud.message import MessageCRUD  # noqa: E402


def _commit_session():
    """Session that simulates a successful add/execute/commit/refresh cycle."""
    session = MagicMock()
    session.add = MagicMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_create_text_busts_private_recipient(fake_redis, monkeypatch):
    """Private text send DELs unread_total of the recipient (not the sender)."""
    monkeypatch.setattr("messenger.backend.app.crud.message.encrypt_message", lambda t: "ct")
    await fake_redis.set(unread_total(2), "9", ex=300)  # recipient
    await fake_redis.set(unread_total(1), "0", ex=300)  # sender
    session = _commit_session()

    await MessageCRUD.create_text_message(
        session, chat_id=5, sender_id=1, recipient_id=2, text="hi", redis=fake_redis,
    )
    assert await fake_redis.get(unread_total(2)) is None      # recipient busted
    assert await fake_redis.get(unread_total(1)) == "0"       # sender untouched


@pytest.mark.asyncio
async def test_create_text_group_busts_all_members(fake_redis, monkeypatch):
    """Group text send (recipient_id=None) busts every member except sender."""
    monkeypatch.setattr("messenger.backend.app.crud.message.encrypt_message", lambda t: "ct")
    monkeypatch.setattr(ChatCRUD, "get_member_ids", AsyncMock(return_value=[1, 2, 3]))
    for uid in (1, 2, 3):
        await fake_redis.set(unread_total(uid), "4", ex=300)
    session = _commit_session()

    await MessageCRUD.create_text_message(
        session, chat_id=5, sender_id=1, recipient_id=None, text="hi", redis=fake_redis,
    )
    assert await fake_redis.get(unread_total(1)) == "4"   # sender untouched
    assert await fake_redis.get(unread_total(2)) is None  # member busted
    assert await fake_redis.get(unread_total(3)) is None  # member busted


@pytest.mark.asyncio
async def test_create_media_busts_recipient(fake_redis, monkeypatch):
    monkeypatch.setattr("messenger.backend.app.crud.message.encrypt_message", lambda t: "ct")
    await fake_redis.set(unread_total(2), "7", ex=300)
    session = _commit_session()

    await MessageCRUD.create_media_message(
        session,
        chat_id=5, sender_id=1, recipient_id=2,
        msg_type="image", attachment_key="k", attachment_thumb_key=None,
        attachment_meta=None, caption="", redis=fake_redis,
    )
    assert await fake_redis.get(unread_total(2)) is None


@pytest.mark.asyncio
async def test_mark_as_read_busts_actor(fake_redis):
    """mark_as_read busts the acting user's unread_total after commit."""
    await fake_redis.set(unread_total(2), "3", ex=300)
    session = MagicMock()
    max_id_res = MagicMock()
    max_id_res.scalar.return_value = 11
    grp_res = MagicMock()
    grp_res.all.return_value = []
    session.execute = AsyncMock(side_effect=[max_id_res, MagicMock(), grp_res])
    session.commit = AsyncMock()

    await MessageCRUD.mark_as_read(session, chat_id=5, user_id=2, redis=fake_redis)
    assert session.commit.await_count == 1
    assert await fake_redis.get(unread_total(2)) is None


@pytest.mark.asyncio
async def test_mark_as_read_up_to_busts_actor(fake_redis):
    await fake_redis.set(unread_total(2), "3", ex=300)
    session = MagicMock()
    grp_res = MagicMock()
    grp_res.all.return_value = []
    session.execute = AsyncMock(side_effect=[MagicMock(), grp_res])
    session.commit = AsyncMock()

    await MessageCRUD.mark_as_read_up_to(
        session, chat_id=5, user_id=2, up_to_message_id=11, redis=fake_redis
    )
    assert await fake_redis.get(unread_total(2)) is None


@pytest.mark.asyncio
async def test_delete_message_busts_actor_and_recipient(fake_redis):
    """delete busts both the deleter and the original recipient."""
    await fake_redis.set(unread_total(1), "1", ex=300)  # actor/sender
    await fake_redis.set(unread_total(2), "1", ex=300)  # recipient
    message = MagicMock()
    message.id = 99
    message.sender_id = 1
    message.recipient_id = 2
    message.album_id = None  # single message, not an album
    res = MagicMock()
    res.scalar_one_or_none.return_value = message
    session = MagicMock()
    session.execute = AsyncMock(return_value=res)
    session.delete = AsyncMock()
    session.commit = AsyncMock()

    ok = await MessageCRUD.delete_message(session, message_id=99, user_id=1, redis=fake_redis)
    assert ok == [99]
    assert await fake_redis.get(unread_total(1)) is None
    assert await fake_redis.get(unread_total(2)) is None


@pytest.mark.asyncio
async def test_delete_message_not_owner_no_bust(fake_redis):
    """Non-owner delete attempt: no commit, no cache bust."""
    await fake_redis.set(unread_total(2), "1", ex=300)
    message = MagicMock()
    message.sender_id = 999  # someone else owns it
    message.recipient_id = 2
    res = MagicMock()
    res.scalar_one_or_none.return_value = message
    session = MagicMock()
    session.execute = AsyncMock(return_value=res)
    session.delete = AsyncMock()
    session.commit = AsyncMock()

    ok = await MessageCRUD.delete_message(session, message_id=99, user_id=1, redis=fake_redis)
    assert ok == []
    assert session.commit.await_count == 0
    assert await fake_redis.get(unread_total(2)) == "1"  # untouched


@pytest.mark.asyncio
async def test_create_text_fail_open_when_redis_broken(monkeypatch):
    """Broken redis on bust must not break the send (message still returned)."""
    monkeypatch.setattr("messenger.backend.app.crud.message.encrypt_message", lambda t: "ct")
    broken = MagicMock()
    broken.delete = AsyncMock(side_effect=RedisError("boom"))
    session = _commit_session()
    msg = await MessageCRUD.create_text_message(
        session, chat_id=5, sender_id=1, recipient_id=2, text="hi", redis=broken
    )
    assert msg is not None
    assert session.commit.await_count == 1


@pytest.mark.asyncio
async def test_create_text_no_redis_is_noop(monkeypatch):
    """redis=None (default) -> no invalidation attempted, send still works."""
    monkeypatch.setattr("messenger.backend.app.crud.message.encrypt_message", lambda t: "ct")
    session = _commit_session()
    msg = await MessageCRUD.create_text_message(
        session, chat_id=5, sender_id=1, recipient_id=2, text="hi"
    )
    assert msg is not None
