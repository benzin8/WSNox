"""Real-time presence operations.

Source of truth: Redis key `presence:{user_id}` with TTL. Operations in this
module are pure with respect to the Redis client they receive — they accept
the client as an argument so tests can pass fakeredis without globals.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING

from messenger.backend.core.redis import get_redis

if TYPE_CHECKING:
    from redis.asyncio import Redis

    from messenger.backend.app.ws.router import ConnectionManager

logger = logging.getLogger(__name__)

PRESENCE_KEY_PREFIX = "presence:"
PRESENCE_TTL_SECONDS = 60
PRESENCE_EVENTS_CHANNEL = "presence_events"
SWEEPER_INTERVAL_SECONDS = 10


def _key(user_id: int) -> str:
    return f"{PRESENCE_KEY_PREFIX}{user_id}"


async def set_presence(redis: "Redis", user_id: int) -> bool:
    """Refresh presence TTL. Returns True iff the key did not exist before
    (signals an online state transition that callers should broadcast).
    """
    existed = await redis.exists(_key(user_id))
    await redis.setex(_key(user_id), PRESENCE_TTL_SECONDS, "1")
    return not existed


async def clear_presence(redis: "Redis", user_id: int) -> None:
    await redis.delete(_key(user_id))


async def is_present(redis: "Redis", user_id: int) -> bool:
    return bool(await redis.exists(_key(user_id)))


async def is_visible_online(
    redis: "Redis", viewer_id: int, target_user_id: int, target_pref: str | None
) -> bool:
    """Compute what `viewer_id` should see for `target_user_id`'s online state."""
    if viewer_id == target_user_id:
        return True
    if target_pref == "invisible":
        return False
    return await is_present(redis, target_user_id)


async def publish_presence_event(redis: "Redis", user_id: int, online: bool) -> None:
    """Publish a state-transition event to the presence pub/sub channel."""
    payload = json.dumps({"user_id": user_id, "online": online})
    await redis.publish(PRESENCE_EVENTS_CHANNEL, payload)
