from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.models import Message, MessageReaction

# Fixed emoji set offered in the reaction picker (MVP — no free emoji picker).
ALLOWED_REACTION_EMOJI = ("👍", "❤️", "😂", "😮", "😢", "🔥")
_ALLOWED_EMOJI_SET = frozenset(ALLOWED_REACTION_EMOJI)
REACTION_TYPES = ("emoji", "aura")


class ReactionCRUD:
    @staticmethod
    def is_valid(reaction_type: str, emoji: str | None) -> bool:
        """Validate a toggle request before touching the DB."""
        if reaction_type == "aura":
            return True
        if reaction_type == "emoji":
            return emoji in _ALLOWED_EMOJI_SET
        return False

    @staticmethod
    async def toggle(
        db: AsyncSession, message_id: int, user_id: int, reaction_type: str, emoji: str | None
    ) -> str:
        """Toggle one user's reaction of a given type on a message.

        Independent per type (a user may have one emoji AND one aura). Returns
        the action taken: "added" | "removed" | "switched".

        - aura: present → remove; absent → add (emoji ignored).
        - emoji: same emoji → remove; different emoji → switch; none → add.
        """
        existing = (
            await db.execute(
                select(MessageReaction).where(
                    MessageReaction.message_id == message_id,
                    MessageReaction.user_id == user_id,
                    MessageReaction.reaction_type == reaction_type,
                )
            )
        ).scalar_one_or_none()

        if reaction_type == "aura":
            if existing:
                await db.delete(existing)
                await db.commit()
                return "removed"
            db.add(MessageReaction(message_id=message_id, user_id=user_id, reaction_type="aura"))
            await db.commit()
            return "added"

        # emoji
        if existing:
            if existing.emoji == emoji:
                await db.delete(existing)
                await db.commit()
                return "removed"
            existing.emoji = emoji
            await db.commit()
            return "switched"
        db.add(
            MessageReaction(
                message_id=message_id, user_id=user_id, reaction_type="emoji", emoji=emoji
            )
        )
        await db.commit()
        return "added"

    @staticmethod
    def _aggregate(rows, message_ids: list[int], viewer_id: int) -> dict[int, dict]:
        """Pure reduction of reaction rows → per-message summary.

        Each summary: {emoji: {emoji: count}, aura: count, my_emoji, my_aura}.
        `my_*` is the *viewer's* own reaction so the UI can highlight it.
        """
        out: dict[int, dict] = {
            mid: {"emoji": {}, "aura": 0, "my_emoji": None, "my_aura": False}
            for mid in message_ids
        }
        for r in rows:
            s = out.get(r.message_id)
            if s is None:
                continue
            if r.reaction_type == "aura":
                s["aura"] += 1
                if r.user_id == viewer_id:
                    s["my_aura"] = True
            else:
                s["emoji"][r.emoji] = s["emoji"].get(r.emoji, 0) + 1
                if r.user_id == viewer_id:
                    s["my_emoji"] = r.emoji
        return out

    @staticmethod
    async def summary_for_messages(
        db: AsyncSession, message_ids: list[int], viewer_id: int
    ) -> dict[int, dict]:
        if not message_ids:
            return {}
        rows = (
            await db.execute(
                select(MessageReaction).where(MessageReaction.message_id.in_(message_ids))
            )
        ).scalars().all()
        return ReactionCRUD._aggregate(rows, message_ids, viewer_id)

    @staticmethod
    async def summary_for_message(db: AsyncSession, message_id: int, viewer_id: int) -> dict:
        return (await ReactionCRUD.summary_for_messages(db, [message_id], viewer_id))[message_id]

    @staticmethod
    async def chat_id_for_message(db: AsyncSession, message_id: int) -> int | None:
        """The message's chat (for membership checks); None if it doesn't exist."""
        return (
            await db.execute(select(Message.chat_id).where(Message.id == message_id))
        ).scalar_one_or_none()
