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

        Each summary: {emoji: {emoji: count}, aura: count, my_emoji, my_aura}
        plus `emoji_users`/`aura_users` (reactor ids, ordered) which
        `attach_reactors` turns into avatars for low-count reactions. `my_*` is
        the *viewer's* own reaction so the UI can highlight it. Rows must be
        ordered by id so the first reactors are stable.
        """
        out: dict[int, dict] = {
            mid: {
                "emoji": {},
                "aura": 0,
                "my_emoji": None,
                "my_aura": False,
                "emoji_users": {},
                "aura_users": [],
            }
            for mid in message_ids
        }
        for r in rows:
            s = out.get(r.message_id)
            if s is None:
                continue
            if r.reaction_type == "aura":
                s["aura"] += 1
                s["aura_users"].append(r.user_id)
                if r.user_id == viewer_id:
                    s["my_aura"] = True
            else:
                s["emoji"][r.emoji] = s["emoji"].get(r.emoji, 0) + 1
                s["emoji_users"].setdefault(r.emoji, []).append(r.user_id)
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
                select(MessageReaction)
                .where(MessageReaction.message_id.in_(message_ids))
                .order_by(MessageReaction.id)
            )
        ).scalars().all()
        return ReactionCRUD._aggregate(rows, message_ids, viewer_id)

    # How many reactors to show as avatars before collapsing to a count.
    AVATAR_THRESHOLD = 3

    @staticmethod
    async def attach_reactors(db: AsyncSession, summaries: dict[int, dict], storage, redis) -> None:
        """Enrich summaries in place with reactor avatars for low-count groups.

        For each emoji/aura with fewer than AVATAR_THRESHOLD reactors we surface
        up to 2 reactors as `{url, name}` (Telegram-style faces); at/above the
        threshold we leave just the count. Raw reactor-id lists are dropped from
        the output so we don't leak who reacted beyond the shown faces.
        """
        from messenger.backend.models.profile import Profile
        from messenger.backend.services.avatar_urls import resolve_avatar_urls

        cap = ReactionCRUD.AVATAR_THRESHOLD - 1  # faces to show (≤2)
        needed: set[int] = set()
        for s in summaries.values():
            for emoji, cnt in s["emoji"].items():
                if cnt < ReactionCRUD.AVATAR_THRESHOLD:
                    needed.update(s["emoji_users"].get(emoji, [])[:cap])
            if 0 < s["aura"] < ReactionCRUD.AVATAR_THRESHOLD:
                needed.update(s["aura_users"][:cap])

        info: dict[int, dict] = {}
        if needed:
            profiles = {
                p.user_id: p
                for p in (
                    await db.execute(select(Profile).where(Profile.user_id.in_(needed)))
                ).scalars().all()
            }
            for uid in needed:
                p = profiles.get(uid)
                url = None
                if p and p.avatar:
                    url = (await resolve_avatar_urls(storage, p.avatar, redis=redis)).thumb
                info[uid] = {"url": url, "name": p.display_name if p else None}

        def faces(uids):
            return [info.get(u, {"url": None, "name": None}) for u in uids[:cap]]

        for s in summaries.values():
            s["emoji_reactors"] = {
                emoji: faces(s["emoji_users"].get(emoji, []))
                for emoji, cnt in s["emoji"].items()
                if cnt < ReactionCRUD.AVATAR_THRESHOLD
            }
            s["aura_reactors"] = (
                faces(s["aura_users"]) if 0 < s["aura"] < ReactionCRUD.AVATAR_THRESHOLD else []
            )
            s.pop("emoji_users", None)
            s.pop("aura_users", None)

    @staticmethod
    async def summary_for_message(db: AsyncSession, message_id: int, viewer_id: int) -> dict:
        return (await ReactionCRUD.summary_for_messages(db, [message_id], viewer_id))[message_id]

    @staticmethod
    async def chat_id_for_message(db: AsyncSession, message_id: int) -> int | None:
        """The message's chat (for membership checks); None if it doesn't exist."""
        return (
            await db.execute(select(Message.chat_id).where(Message.id == message_id))
        ).scalar_one_or_none()
