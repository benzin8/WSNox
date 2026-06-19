"""Official WSNox announcements channel.

A single broadcast chat (chat_type="channel") that every user is a member of.
Only users with PERM_POST_ANNOUNCEMENTS may post (enforced at the API layer);
for everyone else it is read-only (the WS send path rejects channel posts).

The channel is a singleton resolved by chat_type — there is exactly one row
with chat_type="channel". `get_or_create_channel` is the single entry point so
both the registration auto-join and the admin post endpoint converge on it.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.models.chat import Chat, ChatMember

CHANNEL_TYPE = "channel"
CHANNEL_NAME = "WSNox"


async def get_channel(session: AsyncSession) -> Chat | None:
    """Return the announcements channel, or None if it doesn't exist yet."""
    result = await session.execute(
        select(Chat).where(Chat.chat_type == CHANNEL_TYPE).order_by(Chat.id.asc()).limit(1)
    )
    return result.scalar_one_or_none()


async def get_or_create_channel(session: AsyncSession) -> Chat:
    """Find the singleton announcements channel, creating it if missing.

    Does NOT commit — the caller owns the transaction. Uses flush so the new
    chat gets an id for membership inserts.
    """
    chat = await get_channel(session)
    if chat is not None:
        return chat
    chat = Chat(chat_type=CHANNEL_TYPE, name=CHANNEL_NAME)
    session.add(chat)
    await session.flush()
    return chat


async def ensure_member(session: AsyncSession, chat_id: int, user_id: int) -> bool:
    """Add a user to the channel if not already a member. Returns True if added.

    Does NOT commit — caller owns the transaction.
    """
    existing = await session.execute(
        select(ChatMember.user_id).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return False
    session.add(ChatMember(chat_id=chat_id, user_id=user_id, role="member"))
    return True


async def join_channel(session: AsyncSession, user_id: int) -> None:
    """Ensure `user_id` is a member of the announcements channel (no commit)."""
    chat = await get_or_create_channel(session)
    await ensure_member(session, chat.id, user_id)
