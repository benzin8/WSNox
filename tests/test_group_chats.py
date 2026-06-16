"""Tests for group-chat fan-out logic.

The existing test suite doesn't spin up a real DB, so these tests cover the
pieces of the group flow that can be reasoned about in isolation:
- `_resolve_recipient_ids` excludes the sender
- `publish_chat_event` lands on the `:chat_events` channel
- `chat_events_listener` delivers only to listed member sockets
- `pubsub_listener` accepts the new `recipient_ids` list shape and falls back
  to the legacy single-`recipient_id` payload
"""

import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest

from messenger.backend.app.ws.router import (
    ConnectionManager,
    REDIS_CHAT_CHANNEL,
    _resolve_recipient_ids,
    publish_chat_event,
)


@pytest.mark.asyncio
async def test_resolve_recipient_ids_private_returns_single():
    db = AsyncMock()
    redis = AsyncMock()
    ids = await _resolve_recipient_ids(db, redis, chat_id=1, sender_id=10, chat_type="private", recipient_id=20)
    assert ids == [20]


@pytest.mark.asyncio
async def test_resolve_recipient_ids_private_with_no_recipient_returns_empty():
    db = AsyncMock()
    redis = AsyncMock()
    ids = await _resolve_recipient_ids(db, redis, chat_id=1, sender_id=10, chat_type="private", recipient_id=None)
    assert ids == []


@pytest.mark.asyncio
async def test_resolve_recipient_ids_group_excludes_sender():
    db = AsyncMock()
    redis = AsyncMock()
    with patch(
        "messenger.backend.app.crud.chat.cached_member_ids",
        new_callable=AsyncMock,
    ) as mock_get:
        mock_get.return_value = [10, 11, 12, 13]
        ids = await _resolve_recipient_ids(db, redis, chat_id=5, sender_id=11, chat_type="group", recipient_id=None)
        assert sorted(ids) == [10, 12, 13]
        mock_get.assert_awaited_once_with(redis, db, 5)


@pytest.mark.asyncio
async def test_publish_chat_event_lands_on_chat_events_channel(fake_redis):
    with patch("messenger.backend.app.ws.router.get_redis", return_value=fake_redis):
        pubsub = fake_redis.pubsub()
        await pubsub.subscribe(REDIS_CHAT_CHANNEL + ":chat_events")
        # Drain the subscribe confirmation
        await pubsub.get_message(timeout=0.1)
        await publish_chat_event({
            "type": "group_created",
            "chat_id": 7,
            "name": "Test",
            "member_ids": [1, 2, 3],
        })
        msg = await pubsub.get_message(timeout=0.5)
        assert msg is not None
        assert msg["type"] == "message"
        data = json.loads(msg["data"])
        assert data["type"] == "group_created"
        assert data["chat_id"] == 7


@pytest.mark.asyncio
async def test_chat_events_listener_only_notifies_listed_members(fake_redis):
    manager = ConnectionManager()
    # Register fake sockets for three users
    ws_alice = AsyncMock()
    ws_bob = AsyncMock()
    ws_eve = AsyncMock()
    manager.active_connections[1] = {ws_alice}
    manager.active_connections[2] = {ws_bob}
    manager.active_connections[3] = {ws_eve}  # not in member_ids — must not get the event

    with patch("messenger.backend.app.ws.router.get_redis", return_value=fake_redis):
        task = asyncio.create_task(manager.chat_events_listener())
        # Give the listener a moment to subscribe before we publish
        await asyncio.sleep(0.05)
        await publish_chat_event({
            "type": "group_deleted",
            "chat_id": 99,
            "member_ids": [1, 2],
        })
        await asyncio.sleep(0.1)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    ws_alice.send_json.assert_awaited()
    ws_bob.send_json.assert_awaited()
    ws_eve.send_json.assert_not_called()


@pytest.mark.asyncio
async def test_pubsub_listener_fans_out_to_recipient_ids(fake_redis):
    """Verify the new recipient_ids list shape delivers to every listed user."""
    manager = ConnectionManager()
    ws_a = AsyncMock()
    ws_b = AsyncMock()
    manager.active_connections[10] = {ws_a}
    manager.active_connections[11] = {ws_b}

    with (
        patch("messenger.backend.app.ws.router.get_redis", return_value=fake_redis),
        patch(
            "messenger.backend.app.ws.router.decrypt_message",
            return_value="hello group",
        ),
        patch.object(manager, "_should_push", new_callable=AsyncMock, return_value=False),
    ):
        task = asyncio.create_task(manager.pubsub_listener())
        await asyncio.sleep(0.05)
        await fake_redis.publish(REDIS_CHAT_CHANNEL, json.dumps({
            "recipient_ids": [10, 11],
            "encrypted_text": "ignored",
            "sender_id": 1,
            "chat_id": 5,
            "chat_type": "group",
            "chat_info": {"id": 5, "name": "G", "chat_type": "group", "recipient": None},
        }))
        await asyncio.sleep(0.1)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    ws_a.send_json.assert_awaited()
    ws_b.send_json.assert_awaited()
    a_payload = ws_a.send_json.await_args.args[0]
    assert a_payload["text"] == "hello group"
    assert a_payload["chat_type"] == "group"


@pytest.mark.asyncio
async def test_pubsub_listener_falls_back_to_legacy_recipient_id(fake_redis):
    """Old payloads (single recipient_id, no recipient_ids list) still deliver."""
    manager = ConnectionManager()
    ws_a = AsyncMock()
    manager.active_connections[42] = {ws_a}

    with (
        patch("messenger.backend.app.ws.router.get_redis", return_value=fake_redis),
        patch(
            "messenger.backend.app.ws.router.decrypt_message",
            return_value="legacy message",
        ),
        patch.object(manager, "_should_push", new_callable=AsyncMock, return_value=False),
    ):
        task = asyncio.create_task(manager.pubsub_listener())
        await asyncio.sleep(0.05)
        await fake_redis.publish(REDIS_CHAT_CHANNEL, json.dumps({
            # No recipient_ids — only the legacy single-recipient field.
            "recipient_id": 42,
            "encrypted_text": "ignored",
            "sender_id": 1,
            "chat_id": 5,
            "chat_info": {
                "id": 5,
                "name": "private_1_42",
                "chat_type": "private",
                "recipient": {"id": 1, "name": "X"},
            },
        }))
        await asyncio.sleep(0.1)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    ws_a.send_json.assert_awaited()
