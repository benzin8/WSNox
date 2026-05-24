"""Track which chat each user is currently viewing.

Stored in Redis with a TTL so it survives short WebSocket disconnects (e.g.
phone screen lock briefly drops the socket). Used by the push pipeline to
suppress notifications for the chat the user just had open.
"""

import redis.asyncio as redis_async

VIEWING_CHAT_TTL_SECONDS = 300


def _key(user_id: int) -> str:
    return f"viewing:{user_id}"


async def set_viewing_chat(
    redis: redis_async.Redis, user_id: int, chat_id: int
) -> None:
    await redis.set(_key(user_id), str(chat_id), ex=VIEWING_CHAT_TTL_SECONDS)


async def clear_viewing_chat(redis: redis_async.Redis, user_id: int) -> None:
    await redis.delete(_key(user_id))


async def get_viewing_chat(
    redis: redis_async.Redis, user_id: int
) -> int | None:
    raw = await redis.get(_key(user_id))
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None
