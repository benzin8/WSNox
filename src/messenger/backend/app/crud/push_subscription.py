from redis.asyncio import Redis
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.core.cache import (
    PUSH_SUBS_TTL,
    cached,
    invalidate,
    push_subs,
)
from messenger.backend.models.push_subscription import PushSubscription


class PushSubscriptionCRUD:

    @staticmethod
    async def create(
        db: AsyncSession,
        user_id: int,
        endpoint: str,
        p256dh: str,
        auth: str,
        *,
        redis: Redis | None = None,
    ) -> PushSubscription:
        sub = PushSubscription(
            user_id=user_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
        )
        db.add(sub)
        await db.commit()
        await db.refresh(sub)
        if redis is not None:
            await invalidate(redis, push_subs(user_id))
        return sub

    @staticmethod
    async def get_by_endpoint(db: AsyncSession, endpoint: str) -> PushSubscription | None:
        result = await db.execute(
            select(PushSubscription).where(PushSubscription.endpoint == endpoint)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_user_id(db: AsyncSession, user_id: int) -> list[PushSubscription]:
        result = await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == user_id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def delete_by_endpoint(
        db: AsyncSession,
        endpoint: str,
        *,
        user_id: int | None = None,
        redis: Redis | None = None,
    ) -> bool:
        result = await db.execute(
            delete(PushSubscription).where(PushSubscription.endpoint == endpoint)
        )
        await db.commit()
        if redis is not None and user_id is not None:
            await invalidate(redis, push_subs(user_id))
        return result.rowcount > 0

    @staticmethod
    async def delete_by_id(
        db: AsyncSession,
        sub_id: int,
        *,
        user_id: int | None = None,
        redis: Redis | None = None,
    ) -> None:
        await db.execute(
            delete(PushSubscription).where(PushSubscription.id == sub_id)
        )
        await db.commit()
        if redis is not None and user_id is not None:
            await invalidate(redis, push_subs(user_id))


async def cached_push_subs(redis: Redis, db: AsyncSession, user_id: int) -> list[dict]:
    """Read-through кэш push-подписок (JSON-список dict'ов). Пустой список кэшируется."""
    async def _loader() -> list[dict]:
        rows = await PushSubscriptionCRUD.get_by_user_id(db, user_id)
        return [
            {"id": r.id, "endpoint": r.endpoint, "p256dh": r.p256dh, "auth": r.auth}
            for r in rows
        ]

    return await cached(redis, push_subs(user_id), PUSH_SUBS_TTL, _loader)
