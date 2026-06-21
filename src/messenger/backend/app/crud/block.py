from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.models.user_block import UserBlock


class BlockCRUD:
    @staticmethod
    async def block(db: AsyncSession, blocker_id: int, blocked_id: int) -> None:
        if blocker_id == blocked_id:
            return
        exists = await db.scalar(
            select(UserBlock.blocker_id).where(
                UserBlock.blocker_id == blocker_id, UserBlock.blocked_id == blocked_id
            )
        )
        if exists is None:
            db.add(UserBlock(blocker_id=blocker_id, blocked_id=blocked_id))
            await db.commit()

    @staticmethod
    async def unblock(db: AsyncSession, blocker_id: int, blocked_id: int) -> None:
        await db.execute(
            delete(UserBlock).where(
                UserBlock.blocker_id == blocker_id, UserBlock.blocked_id == blocked_id
            )
        )
        await db.commit()

    @staticmethod
    async def has_blocked(db: AsyncSession, blocker_id: int, blocked_id: int) -> bool:
        row = await db.scalar(
            select(UserBlock.blocker_id).where(
                UserBlock.blocker_id == blocker_id, UserBlock.blocked_id == blocked_id
            )
        )
        return row is not None

    @staticmethod
    async def is_blocked_either(db: AsyncSession, a: int, b: int) -> bool:
        """True if a blocked b OR b blocked a (DMs are blocked either way)."""
        row = await db.scalar(
            select(UserBlock.blocker_id)
            .where(
                or_(
                    and_(UserBlock.blocker_id == a, UserBlock.blocked_id == b),
                    and_(UserBlock.blocker_id == b, UserBlock.blocked_id == a),
                )
            )
            .limit(1)
        )
        return row is not None
