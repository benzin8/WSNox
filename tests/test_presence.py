import json as _json

import pytest

from messenger.backend.app.ws.presence import (
    PRESENCE_KEY_PREFIX,
    PRESENCE_TTL_SECONDS,
    clear_presence,
    is_present,
    is_visible_online,
    set_presence,
)


@pytest.mark.asyncio
async def test_set_presence_creates_key_and_signals_transition(fake_redis):
    transitioned = await set_presence(fake_redis, user_id=42)
    assert transitioned is True
    assert await fake_redis.exists(f"{PRESENCE_KEY_PREFIX}42") == 1
    ttl = await fake_redis.ttl(f"{PRESENCE_KEY_PREFIX}42")
    assert 0 < ttl <= PRESENCE_TTL_SECONDS


@pytest.mark.asyncio
async def test_set_presence_second_call_does_not_signal_transition(fake_redis):
    await set_presence(fake_redis, user_id=42)
    transitioned = await set_presence(fake_redis, user_id=42)
    assert transitioned is False


@pytest.mark.asyncio
async def test_clear_presence_deletes_key(fake_redis):
    await set_presence(fake_redis, user_id=42)
    await clear_presence(fake_redis, user_id=42)
    assert await fake_redis.exists(f"{PRESENCE_KEY_PREFIX}42") == 0


@pytest.mark.asyncio
async def test_is_present_reflects_key(fake_redis):
    assert await is_present(fake_redis, user_id=42) is False
    await set_presence(fake_redis, user_id=42)
    assert await is_present(fake_redis, user_id=42) is True


@pytest.mark.asyncio
async def test_invisible_returns_offline_to_others(fake_redis):
    await set_presence(fake_redis, user_id=42)
    online = await is_visible_online(
        redis=fake_redis, viewer_id=1, target_user_id=42, target_pref="invisible"
    )
    assert online is False


@pytest.mark.asyncio
async def test_invisible_returns_online_to_self(fake_redis):
    online = await is_visible_online(
        redis=fake_redis, viewer_id=42, target_user_id=42, target_pref="invisible"
    )
    assert online is True


@pytest.mark.asyncio
async def test_dnd_does_not_affect_online(fake_redis):
    await set_presence(fake_redis, user_id=42)
    online = await is_visible_online(
        redis=fake_redis, viewer_id=1, target_user_id=42, target_pref="dnd"
    )
    assert online is True


@pytest.mark.asyncio
async def test_no_preference_uses_redis_only(fake_redis):
    online = await is_visible_online(
        redis=fake_redis, viewer_id=1, target_user_id=42, target_pref=None
    )
    assert online is False
    await set_presence(fake_redis, user_id=42)
    online = await is_visible_online(
        redis=fake_redis, viewer_id=1, target_user_id=42, target_pref=None
    )
    assert online is True


@pytest.mark.asyncio
async def test_publish_presence_event_serializes_to_channel(fake_redis):
    from messenger.backend.app.ws.presence import (
        PRESENCE_EVENTS_CHANNEL,
        publish_presence_event,
    )

    pubsub = fake_redis.pubsub()
    await pubsub.subscribe(PRESENCE_EVENTS_CHANNEL)
    # consume the subscribe ack
    msg = await pubsub.get_message(timeout=1.0)
    assert msg is not None and msg["type"] == "subscribe"

    await publish_presence_event(fake_redis, user_id=42, online=True)

    msg = await pubsub.get_message(timeout=1.0)
    assert msg is not None
    assert msg["type"] == "message"
    payload = _json.loads(msg["data"])
    assert payload == {"user_id": 42, "online": True}

    await pubsub.unsubscribe(PRESENCE_EVENTS_CHANNEL)
    await pubsub.aclose()
