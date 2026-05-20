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


async def sweep_once(redis: "Redis", manager: "ConnectionManager") -> None:
    """Single pass: broadcast offline for users in active_connections whose
    Redis key has expired, and reset state when the key reappears.

    Does NOT close sockets — they may still be alive (just a hidden tab).
    Dead-socket cleanup happens lazily on next send_json failure.
    """
    for user_id in list(manager.active_connections.keys()):
        alive = await is_present(redis, user_id)
        if not alive:
            if user_id not in manager.offline_broadcasted:
                await publish_presence_event(redis, user_id, online=False)
                manager.offline_broadcasted.add(user_id)
        else:
            manager.offline_broadcasted.discard(user_id)


async def sweep_forever(manager: "ConnectionManager") -> None:
    """Background task: run sweep_once every SWEEPER_INTERVAL_SECONDS."""
    redis = get_redis()
    try:
        while True:
            await asyncio.sleep(SWEEPER_INTERVAL_SECONDS)
            try:
                await sweep_once(redis, manager)
            except Exception:  # noqa: BLE001
                logger.exception("sweep_once failed")
    except asyncio.CancelledError:
        return


async def presence_listener(manager: "ConnectionManager") -> None:
    """Subscribe to PRESENCE_EVENTS_CHANNEL and fan out to local sockets.

    Only delivers to users who have the affected user in their chat partners.
    Resolves partners lazily on each event — cheap because Redis pub/sub
    fans out only state-transition events, not every ping.
    """
    from messenger.backend.app.crud.chat import ChatCRUD
    from messenger.backend.db.session import AsyncSessionLocal

    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(PRESENCE_EVENTS_CHANNEL)

    try:
        async for raw in pubsub.listen():
            if raw["type"] != "message":
                continue
            try:
                data = json.loads(raw["data"])
            except (ValueError, TypeError):
                continue
            affected_user_id = data.get("user_id")
            online = data.get("online")
            if affected_user_id is None or not isinstance(online, bool):
                continue

            async with AsyncSessionLocal() as db:
                partner_ids = await ChatCRUD.get_chat_partners(db, affected_user_id)

            payload = {"type": "presence", "user_id": affected_user_id, "online": online}
            for partner_id in partner_ids:
                sockets = manager.active_connections.get(partner_id, set())
                dead = []
                for ws in sockets:
                    try:
                        await ws.send_json(payload)
                    except Exception:  # noqa: BLE001
                        dead.append(ws)
                for ws in dead:
                    sockets.discard(ws)
                if not sockets and partner_id in manager.active_connections:
                    del manager.active_connections[partner_id]
    except asyncio.CancelledError:
        await pubsub.unsubscribe(PRESENCE_EVENTS_CHANNEL)
        await pubsub.aclose()
