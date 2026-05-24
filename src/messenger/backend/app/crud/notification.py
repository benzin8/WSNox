from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.models.chat_mute import ChatMute
from messenger.backend.models.profile import Profile


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
        db: AsyncSession, user_id: int, chat_id: int, muted: bool
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

    @staticmethod
    async def get_dnd(db: AsyncSession, user_id: int) -> bool:
        result = await db.execute(
            select(Profile.notification_dnd).where(Profile.user_id == user_id)
        )
        value = result.scalar_one_or_none()
        return bool(value)

    @staticmethod
    async def set_dnd(db: AsyncSession, user_id: int, enabled: bool) -> bool:
        result = await db.execute(
            select(Profile).where(Profile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()
        if not profile:
            return False
        profile.notification_dnd = enabled
        await db.commit()
        return True
