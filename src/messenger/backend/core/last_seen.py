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


async def bump_last_seen(redis: Redis, session: AsyncSession, user_id: int) -> None:
    """SETNX-throttle: обновляет `users.last_seen` не чаще раз в минуту на юзера.

    Silent fail: любая ошибка Redis или БД глушится — это телеметрия, не бизнес.
    """
    key = f"{THROTTLE_KEY_PREFIX}{user_id}"
    try:
        acquired = await redis.set(key, "1", ex=THROTTLE_TTL_SECONDS, nx=True)
    except RedisError:
        return
    if not acquired:
        return
    try:
        await session.execute(
            update(User).where(User.id == user_id).values(last_seen=func.now())
        )
        await session.commit()
    except SQLAlchemyError:
        await session.rollback()
