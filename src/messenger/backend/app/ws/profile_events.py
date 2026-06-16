"""Profile-change broadcasts.

Whenever a user updates their profile (name/display_name/bio/etc.) we
publish a single event to Redis. A background listener fans the event
out over WebSocket to every chat-partner so their UI can update without
a refresh.

Mirrors the design of `ws/presence.py`.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING, Any

from messenger.backend.core.redis import get_redis

if TYPE_CHECKING:
    from redis.asyncio import Redis

    from messenger.backend.app.ws.router import ConnectionManager

logger = logging.getLogger(__name__)

PROFILE_EVENTS_CHANNEL = "profile_events"


async def publish_profile_event(redis: "Redis", user_id: int, profile: dict[str, Any]) -> None:
    """Publish the changed profile snapshot to the pub/sub channel."""
    payload = json.dumps({"user_id": user_id, "profile": profile})
    await redis.publish(PROFILE_EVENTS_CHANNEL, payload)


async def profile_listener(manager: "ConnectionManager") -> None:
    """Subscribe to PROFILE_EVENTS_CHANNEL and fan out to local sockets.

    Only delivers to users who share a chat with the affected user.
    """
    from messenger.backend.app.crud.chat import cached_chat_partners
    from messenger.backend.db.session import AsyncSessionLocal

    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(PROFILE_EVENTS_CHANNEL)

    try:
        async for raw in pubsub.listen():
            if raw["type"] != "message":
                continue
            try:
                data = json.loads(raw["data"])
            except (ValueError, TypeError):
                continue
            affected_user_id = data.get("user_id")
            profile = data.get("profile")
            if affected_user_id is None or not isinstance(profile, dict):
                continue

            async with AsyncSessionLocal() as db:
                partner_ids = await cached_chat_partners(redis, db, affected_user_id)

            payload = {"type": "profile_update", "user_id": affected_user_id, **profile}
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
        await pubsub.unsubscribe(PROFILE_EVENTS_CHANNEL)
        await pubsub.aclose()
