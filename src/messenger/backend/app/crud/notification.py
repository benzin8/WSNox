from redis.asyncio import Redis
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.core.cache import (
    NOTIF_PREF_TTL,
    PREFS_TTL,
    cached,
    invalidate,
    notif_dnd,
    notif_muted,
    prefs_rr,
)
from messenger.backend.models.chat_mute import ChatMute
from messenger.backend.models.profile import Profile


async def get_read_receipts_enabled_db(db: AsyncSession, user_id: int) -> bool:
    """Сырое чтение read_receipts_enabled из БД (default True для юзера без профиля)."""
    result = await db.execute(
        select(Profile.read_receipts_enabled).where(Profile.user_id == user_id)
    )
    value = result.scalar_one_or_none()
    return value if value is not None else True


async def cached_read_receipts_enabled(redis: Redis, db: AsyncSession, user_id: int) -> bool:
    """read_receipts_enabled через read-through кэш prefs_rr(uid)."""
    return await cached(
        redis,
        prefs_rr(user_id),
        PREFS_TTL,
        lambda: get_read_receipts_enabled_db(db, user_id),
    )


async def should_expose_read_receipts(
    redis: Redis, db: AsyncSession, user_a_id: int, user_b_id: int
) -> bool:
    """True только если у ОБОИХ пользователей read_receipts_enabled=True.

    Делает два кэшируемых single-uid чтения вместо одного батч-запроса IN(...),
    чтобы попадать в общий кэш prefs_rr(uid), который греется на каждый
    read-receipt по обоим участникам.
    """
    a = await cached_read_receipts_enabled(redis, db, user_a_id)
    b = await cached_read_receipts_enabled(redis, db, user_b_id)
    return a and b


class NotificationCRUD:
    """Per-user notification preferences: per-chat mutes + global DND flag."""

    @staticmethod
    async def list_muted_chat_ids(db: AsyncSession, user_id: int) -> list[int]:
        result = await db.execute(
            select(ChatMute.chat_id).where(ChatMute.user_id == user_id)
        )
        return [row[0] for row in result.all()]

    @staticmethod
    async def is_chat_muted(db: AsyncSession, user_id: int, chat_id: int) -> bool:
        result = await db.execute(
            select(ChatMute.chat_id).where(
                ChatMute.user_id == user_id, ChatMute.chat_id == chat_id
            )
        )
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def set_chat_mute(
        db: AsyncSession,
        user_id: int,
        chat_id: int,
        muted: bool,
        *,
        redis: Redis | None = None,
    ) -> None:
        if muted:
            db.add(ChatMute(user_id=user_id, chat_id=chat_id))
            try:
                await db.commit()
            except IntegrityError:
                await db.rollback()
        else:
            await db.execute(
                delete(ChatMute).where(
                    ChatMute.user_id == user_id, ChatMute.chat_id == chat_id
                )
            )
            await db.commit()
        if redis is not None:
            await invalidate(redis, notif_muted(user_id))

    @staticmethod
    async def get_dnd(db: AsyncSession, user_id: int) -> bool:
        result = await db.execute(
            select(Profile.notification_dnd).where(Profile.user_id == user_id)
        )
        value = result.scalar_one_or_none()
        return bool(value)

    @staticmethod
    async def set_dnd(
        db: AsyncSession, user_id: int, enabled: bool, *, redis: Redis | None = None
    ) -> bool:
        result = await db.execute(
            select(Profile).where(Profile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()
        if not profile:
            return False
        profile.notification_dnd = enabled
        await db.commit()
        if redis is not None:
            await invalidate(redis, notif_dnd(user_id))
        return True

    @staticmethod
    async def get_read_receipts_enabled(db: AsyncSession, user_id: int) -> bool:
        result = await db.execute(
            select(Profile.read_receipts_enabled).where(Profile.user_id == user_id)
        )
        value = result.scalar_one_or_none()
        return value if value is not None else True

    @staticmethod
    async def set_read_receipts_enabled(
        db: AsyncSession, user_id: int, enabled: bool, *, redis: Redis | None = None
    ) -> bool:
        result = await db.execute(
            select(Profile).where(Profile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()
        if not profile:
            return False
        profile.read_receipts_enabled = enabled
        await db.commit()
        if redis is not None:
            await invalidate(redis, prefs_rr(user_id))
        return True


async def cached_get_dnd(redis: Redis, db: AsyncSession, user_id: int) -> bool:
    """Read-through кэш DND-флага. Кэшируем и негативный кейс (False)."""
    return await cached(
        redis,
        notif_dnd(user_id),
        NOTIF_PREF_TTL,
        lambda: NotificationCRUD.get_dnd(db, user_id),
    )


async def cached_muted_chat_ids(redis: Redis, db: AsyncSession, user_id: int) -> list[int]:
    """Read-through кэш списка замьюченных чатов. Пустой список кэшируется тоже."""
    return await cached(
        redis,
        notif_muted(user_id),
        NOTIF_PREF_TTL,
        lambda: NotificationCRUD.list_muted_chat_ids(db, user_id),
    )
