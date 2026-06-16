"""Throttled `users.last_seen` updates via Redis SETNX.

Used as fire-and-forget telemetry from `get_current_user`. Никогда не должен
поднимать exception'ы наружу — это не бизнес-логика.
"""
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import func, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.models.user import User

THROTTLE_KEY_PREFIX = "user_active:"
THROTTLE_TTL_SECONDS = 60


async def acquire_last_seen_slot(redis: Redis, user_id: int) -> bool:
    """SETNX-троттл: True, если слот свободен (раз в минуту на юзера).

    Fail-open: любая ошибка Redis → False (запись пропускаем, наружу не падаем).
    """
    key = f"{THROTTLE_KEY_PREFIX}{user_id}"
    try:
        acquired = await redis.set(key, "1", ex=THROTTLE_TTL_SECONDS, nx=True)
    except RedisError:
        return False
    return bool(acquired)


async def write_last_seen(session: AsyncSession, user_id: int) -> None:
    """Пишет `users.last_seen = now()`. Silent fail: ошибка БД → rollback."""
    try:
        await session.execute(
            update(User).where(User.id == user_id).values(last_seen=func.now())
        )
        await session.commit()
    except SQLAlchemyError:
        await session.rollback()


async def bump_last_seen(redis: Redis, session: AsyncSession, user_id: int) -> None:
    """Бэк-совместимая обёртка: сначала слот, потом запись. Телеметрия, не бизнес."""
    if not await acquire_last_seen_slot(redis, user_id):
        return
    await write_last_seen(session, user_id)
