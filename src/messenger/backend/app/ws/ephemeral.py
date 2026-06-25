"""Ephemeral ("one-time") chats.

A one-time chat lives ONLY in transit: messages are relayed over WebSocket and
held only in the two clients' RAM. Nothing is ever written to the database. The
chat self-destructs for BOTH participants the moment either one leaves, closes,
minimises or loses connection.

Why Redis (and not a plain in-process dict): the app runs multiple uvicorn
workers, so the two participants' sockets may live on different workers. Only
small ROUTING metadata is kept in Redis (the participant ids + status, short
TTL) and every server->client event is fanned out over a pub/sub channel that
each worker's `ephemeral_listener` consumes. Message *content* is never stored
anywhere — it is published to the channel and forgotten.
"""

import asyncio
import json
import secrets
from datetime import datetime, timezone

from messenger.backend.core.redis import get_redis

EPH_CHANNEL = "ephemeral_events"
PENDING_TTL = 90              # an unanswered invite expires after this
SESSION_TTL = 60 * 60 * 2    # safety cap on session metadata (not messages)


def _sess_key(eph_id: str) -> str:
    return f"eph:sess:{eph_id}"


def _user_key(uid: int) -> str:
    return f"eph:user:{uid}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _publish(targets: list[int], event: dict) -> None:
    """Fan an event out to the given user ids via the pub/sub channel.

    The per-worker `ephemeral_listener` picks it up and delivers to whatever
    sockets those users hold on that worker.
    """
    redis = get_redis()
    await redis.publish(EPH_CHANNEL, json.dumps({"targets": targets, "event": event}))


async def _load(eph_id: str) -> dict | None:
    redis = get_redis()
    h = await redis.hgetall(_sess_key(eph_id))
    if not h:
        return None
    try:
        return {"a": int(h["a"]), "b": int(h["b"]), "status": h.get("status", "pending")}
    except (KeyError, ValueError):
        return None


async def get_participants(eph_id: str) -> tuple[int, int] | None:
    sess = await _load(eph_id)
    if not sess:
        return None
    return sess["a"], sess["b"]


async def _index_add(uid: int, eph_id: str) -> None:
    redis = get_redis()
    await redis.sadd(_user_key(uid), eph_id)
    await redis.expire(_user_key(uid), SESSION_TTL)


async def _index_remove(uid: int, eph_id: str) -> None:
    await get_redis().srem(_user_key(uid), eph_id)


async def _cleanup(eph_id: str, sess: dict) -> None:
    redis = get_redis()
    await redis.delete(_sess_key(eph_id))
    await _index_remove(sess["a"], eph_id)
    await _index_remove(sess["b"], eph_id)


async def create_invite(
    inviter_id: int,
    invitee_id: int,
    inviter_name: str | None = None,
    inviter_avatar: str | None = None,
) -> str:
    """Open a pending one-time-chat invite from inviter to invitee."""
    redis = get_redis()
    eph_id = secrets.token_urlsafe(9)
    await redis.hset(_sess_key(eph_id), mapping={"a": inviter_id, "b": invitee_id, "status": "pending"})
    await redis.expire(_sess_key(eph_id), PENDING_TTL)
    await _index_add(inviter_id, eph_id)
    await _index_add(invitee_id, eph_id)
    await _publish([invitee_id], {
        "type": "eph_invited",
        "eph_id": eph_id,
        "from_id": inviter_id,
        "from_name": inviter_name,
        "from_avatar": inviter_avatar,
    })
    await _publish([inviter_id], {
        "type": "eph_invite_sent",
        "eph_id": eph_id,
        "to_id": invitee_id,
    })
    return eph_id


async def accept_invite(eph_id: str, user_id: int, profiles: dict[int, dict]) -> bool:
    """Invitee accepts. Marks the session active and tells both clients to open
    the chat. `profiles` maps each participant id -> {"name":..., "avatar_url":...}."""
    redis = get_redis()
    sess = await _load(eph_id)
    if not sess or sess["status"] != "pending" or user_id != sess["b"]:
        return False
    await redis.hset(_sess_key(eph_id), "status", "active")
    await redis.expire(_sess_key(eph_id), SESSION_TTL)
    a, b = sess["a"], sess["b"]
    participants = {str(a): profiles.get(a, {}), str(b): profiles.get(b, {})}
    await _publish([a, b], {
        "type": "eph_started",
        "eph_id": eph_id,
        "participants": participants,
    })
    return True


async def decline_invite(eph_id: str, user_id: int) -> None:
    sess = await _load(eph_id)
    if not sess or user_id not in (sess["a"], sess["b"]):
        return
    await _cleanup(eph_id, sess)
    await _publish([sess["a"]], {"type": "eph_declined", "eph_id": eph_id, "by_id": user_id})


async def relay_message(eph_id: str, sender_id: int, text: str, temp_id: str | None = None) -> bool:
    """Relay a message to the peer. Stored nowhere — published and forgotten."""
    sess = await _load(eph_id)
    if not sess or sess["status"] != "active" or sender_id not in (sess["a"], sess["b"]):
        return False
    peer = sess["b"] if sender_id == sess["a"] else sess["a"]
    await get_redis().expire(_sess_key(eph_id), SESSION_TTL)  # keep alive while active
    await _publish([peer], {
        "type": "eph_msg",
        "eph_id": eph_id,
        "sender_id": sender_id,
        "text": text,
        "temp_id": temp_id,
        "ts": _now_iso(),
    })
    return True


async def relay_typing(eph_id: str, sender_id: int, on: bool) -> None:
    sess = await _load(eph_id)
    if not sess or sess["status"] != "active" or sender_id not in (sess["a"], sess["b"]):
        return
    peer = sess["b"] if sender_id == sess["a"] else sess["a"]
    await _publish([peer], {"type": "eph_typing", "eph_id": eph_id, "sender_id": sender_id, "on": bool(on)})


async def destroy(eph_id: str, reason: str = "left", by_id: int | None = None) -> None:
    """Tear a session down and tell both participants to wipe it."""
    sess = await _load(eph_id)
    if not sess:
        return
    await _cleanup(eph_id, sess)
    await _publish([sess["a"], sess["b"]], {
        "type": "eph_destroyed",
        "eph_id": eph_id,
        "reason": reason,
        "by_id": by_id,
    })


async def leave(eph_id: str, user_id: int) -> None:
    sess = await _load(eph_id)
    if not sess or user_id not in (sess["a"], sess["b"]):
        return
    await destroy(eph_id, reason="left", by_id=user_id)


async def on_user_gone(user_id: int) -> None:
    """Backstop: when a user's LAST socket drops (crash / network loss), nuke
    every one-time chat they were in. Precise per-tab leaves are handled by the
    client sending `eph_leave` on visibility/unload."""
    redis = get_redis()
    eph_ids = await redis.smembers(_user_key(user_id))
    for eph_id in list(eph_ids):
        await destroy(eph_id, reason="disconnect", by_id=user_id)
    await redis.delete(_user_key(user_id))


async def ephemeral_listener(manager) -> None:
    """Per-worker task: deliver pub/sub events to local sockets of the targets."""
    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(EPH_CHANNEL)
    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                data = json.loads(message["data"])
            except (TypeError, ValueError):
                continue
            targets = data.get("targets", [])
            event = data.get("event", {})
            for uid in targets:
                sockets = manager.active_connections.get(int(uid))
                if not sockets:
                    continue
                dead = []
                for ws in list(sockets):
                    try:
                        await ws.send_json(event)
                    except Exception:  # noqa: BLE001
                        dead.append(ws)
                for ws in dead:
                    sockets.discard(ws)
    except asyncio.CancelledError:
        raise
    finally:
        try:
            await pubsub.unsubscribe(EPH_CHANNEL)
            await pubsub.aclose()
        except Exception:  # noqa: BLE001
            pass
