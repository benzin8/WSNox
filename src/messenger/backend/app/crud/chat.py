from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from messenger.backend.app.api_v1.schemas.chat import (
    ChatCreateRequest,
    GroupChatCreateRequest,
)
from messenger.backend.core.cache import (
    MEMBERS_TTL,
    PARTNERS_TTL,
    cached,
    chat_partners,
    chats_of,
    invalidate,
    members,
    notif_muted,
    push_subs,
)
from messenger.backend.models.chat import Chat, ChatMember
from messenger.backend.models.message import Message
from messenger.backend.models.profile import Profile
from messenger.backend.models.user import User


class ChatCRUD:
    @staticmethod
    async def search_chats(session: AsyncSession, search_query: str, user_id: str) -> list[User]:
        query = (
            select(User)
            .options(selectinload(User.profile))
            .where(User.username.ilike(f"%{search_query}%"))
            .where(User.id != user_id)
        )
        try:
            result = await session.execute(query)
            return result.scalars().all()
        except Exception:
            return None

    @staticmethod
    async def create_private_chat(session: AsyncSession, chat_data: ChatCreateRequest, members: list[int], current_user: User) -> Chat:
        unique_members = set(members)

        chat = Chat(
            chat_type = "private",
            name=f"private_{min(current_user.id, chat_data.other_user_id)}_{max(current_user.id, chat_data.other_user_id)}",
        )
        session.add(chat)
        await session.flush()

        for member_id in unique_members:
            chat_member = ChatMember(
                chat_id = chat.id,
                user_id = member_id,
                role = "admin",
            )
            session.add(chat_member)
        try:
            await session.commit()
            await session.refresh(chat)
        except Exception as e:
            await session.rollback()
            raise e
        return chat

    @staticmethod
    async def create_group_chat(
        session: AsyncSession,
        data: GroupChatCreateRequest,
        creator_id: int,
    ) -> Chat:
        """Create a group chat. Creator becomes admin; everyone else member.

        Member ids in the request are merged with the creator and de-duped, so
        a caller passing themselves in by accident is harmless.
        """
        member_ids = set(data.member_ids) | {creator_id}
        if len(member_ids) < 2:
            raise ValueError("A group needs at least 2 participants")

        chat = Chat(chat_type="group", name=data.name.strip()[:100] or "Group")
        session.add(chat)
        await session.flush()

        for uid in member_ids:
            session.add(ChatMember(
                chat_id=chat.id,
                user_id=uid,
                role="admin" if uid == creator_id else "member",
            ))
        try:
            await session.commit()
            await session.refresh(chat)
        except Exception:
            await session.rollback()
            raise
        return chat

    @staticmethod
    async def get_chat_by_user_id(session: AsyncSession, current_user_id: int, other_user_id: int) -> Chat:
        query = (
        select(Chat)
        .join(Chat.members)
        .where(Chat.chat_type == "private")
        .where(ChatMember.user_id.in_([current_user_id, other_user_id]))
        .group_by(Chat.id)
        .having(func.count(ChatMember.user_id) == 2)
    )
        result = await session.execute(query)
        return result.scalars().first()

    @staticmethod
    async def get_user_data_by_chat_id(session: AsyncSession, chat_id: int, current_user_id: int) -> User:
        query = (
            select(User)
            .options(selectinload(User.profile))
            .join(ChatMember, ChatMember.user_id == User.id)
            .where(ChatMember.chat_id == chat_id)
            .where(User.id != current_user_id)
        )
        result = await session.execute(query)
        return result.scalars().first()

    @staticmethod
    async def get_other_user_by_chat_id(session: AsyncSession, chat_id: int, current_user_id: int) -> list[ChatMember]:
        query = (
            select(ChatMember)
            .where(ChatMember.chat_id == chat_id)
            .where(ChatMember.user_id != current_user_id)
        )
        result = await session.execute(query)
        return result.scalars().first()

    @staticmethod
    async def get_member_ids(session: AsyncSession, chat_id: int) -> list[int]:
        """All user_ids in the chat — sender included.

        Used for fanout: callers usually filter out the sender themselves.
        """
        rows = await session.execute(
            select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
        )
        return [row[0] for row in rows.all()]

    @staticmethod
    async def get_chat_members_full(session: AsyncSession, chat_id: int) -> list[tuple[ChatMember, User, Profile | None]]:
        """Members with their user + profile, for the group-info screen."""
        rows = await session.execute(
            select(ChatMember, User, Profile)
            .join(User, User.id == ChatMember.user_id)
            .outerjoin(Profile, Profile.user_id == User.id)
            .where(ChatMember.chat_id == chat_id)
            .order_by(ChatMember.joined_at.asc())
        )
        return rows.all()

    @staticmethod
    async def get_chat(session: AsyncSession, chat_id: int) -> Chat | None:
        return await session.get(Chat, chat_id)

    @staticmethod
    async def add_members(session: AsyncSession, chat_id: int, user_ids: list[int]) -> list[int]:
        """Add users to a chat, skipping any who are already members.

        Returns the list of user_ids that were actually inserted.
        """
        if not user_ids:
            return []
        existing = await session.execute(
            select(ChatMember.user_id).where(
                ChatMember.chat_id == chat_id,
                ChatMember.user_id.in_(user_ids),
            )
        )
        already = {row[0] for row in existing.all()}
        new_ids = [uid for uid in user_ids if uid not in already]
        for uid in new_ids:
            session.add(ChatMember(chat_id=chat_id, user_id=uid, role="member"))
        try:
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        return new_ids

    @staticmethod
    async def remove_member(session: AsyncSession, chat_id: int, user_id: int) -> bool:
        """Remove a user from a chat. Returns True if a row was deleted."""
        from sqlalchemy import delete
        result = await session.execute(
            delete(ChatMember).where(
                ChatMember.chat_id == chat_id,
                ChatMember.user_id == user_id,
            )
        )
        await session.commit()
        return result.rowcount > 0

    @staticmethod
    async def delete_chat(session: AsyncSession, chat_id: int) -> bool:
        """Delete a chat (and via cascade — its members and messages)."""
        chat = await session.get(Chat, chat_id)
        if not chat:
            return False
        await session.delete(chat)
        await session.commit()
        return True

    @staticmethod
    async def is_chat_member(session: AsyncSession, chat_id: int, user_id: int) -> bool:
        query = select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user_id,
        )
        result = await session.execute(query)
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def get_chat_role(session: AsyncSession, chat_id: int, user_id: int) -> str | None:
        rows = await session.execute(
            select(ChatMember.role).where(
                ChatMember.chat_id == chat_id,
                ChatMember.user_id == user_id,
            )
        )
        return rows.scalar_one_or_none()

    @staticmethod
    async def get_chat_partners(session: AsyncSession, user_id: int) -> list[int]:
        """Return user_ids of everyone who shares at least one chat with `user_id`."""
        partner_chats = (
            select(ChatMember.chat_id)
            .where(ChatMember.user_id == user_id)
        ).subquery()
        query = (
            select(ChatMember.user_id)
            .where(ChatMember.chat_id.in_(select(partner_chats)))
            .where(ChatMember.user_id != user_id)
            .distinct()
        )
        result = await session.execute(query)
        return [row[0] for row in result.all()]

    @staticmethod
    async def get_chats(session: AsyncSession, current_user_id: int):
        """Return chats the user is in. For each row:
        (Chat, OtherUser|None, rcpt_display_name|None, rcpt_avatar|None,
         encrypted_data, msg_type, msg_created_at, unread_count,
         last_sender_id|None, last_sender_display_name|None, member_count|None)

        OtherUser/rcpt_* are only populated for `private` chats. For group
        chats we expose member_count and the sender of the last message so
        the chat list can render "Иван: …" preview + initials avatar.
        """
        OtherUser = aliased(User)
        OtherMember = aliased(ChatMember)
        SenderProfile = aliased(Profile)

        msg_ranked = (
            select(
                Message.chat_id,
                Message.encrypted_data,
                Message.msg_type,
                Message.sender_id,
                Message.created_at,
                func.row_number().over(
                    partition_by=Message.chat_id,
                    order_by=Message.created_at.desc(),
                ).label("rn"),
            )
        ).subquery()

        last_msg = select(msg_ranked).where(msg_ranked.c.rn == 1).subquery()

        # Unread count semantics:
        # * private chats: messages where I'm the recipient and is_read=False
        # * group chats: messages from someone else where I have no MessageRead row
        # We approximate both with: count of messages in chat sent by !=me and
        # for which there's no MessageRead(me) AND (private case is_read=False).
        # For MVP keep the simpler private-only formula and let group counts be
        # "messages from others without a MessageRead row".
        from messenger.backend.models.message_read import MessageRead
        unread_private = (
            select(
                Message.chat_id,
                func.count(Message.id).label("cnt"),
            )
            .where(Message.recipient_id == current_user_id)
            .where(Message.is_read == False)  # noqa: E712
            .group_by(Message.chat_id)
        ).subquery()

        unread_group = (
            select(
                Message.chat_id,
                func.count(Message.id).label("cnt"),
            )
            .join(Chat, Chat.id == Message.chat_id)
            .outerjoin(
                MessageRead,
                (MessageRead.message_id == Message.id) & (MessageRead.user_id == current_user_id),
            )
            .where(Chat.chat_type == "group")
            .where(Message.sender_id != current_user_id)
            .where(MessageRead.message_id.is_(None))
            .group_by(Message.chat_id)
        ).subquery()

        member_count_sub = (
            select(
                ChatMember.chat_id,
                func.count(ChatMember.user_id).label("cnt"),
            ).group_by(ChatMember.chat_id)
        ).subquery()

        query = (
            select(
                Chat,
                OtherUser,
                Profile.display_name.label("rcpt_display_name"),
                Profile.avatar.label("rcpt_avatar"),
                last_msg.c.encrypted_data,
                last_msg.c.msg_type.label("last_msg_type"),
                last_msg.c.created_at.label("last_msg_time"),
                last_msg.c.sender_id.label("last_sender_id"),
                SenderProfile.display_name.label("last_sender_display_name"),
                func.coalesce(unread_private.c.cnt, unread_group.c.cnt, 0).label("unread_cnt"),
                member_count_sub.c.cnt.label("member_count"),
            )
            .join(ChatMember, ChatMember.chat_id == Chat.id)
            # OtherMember/OtherUser only resolve for chats with exactly 2 members
            # (i.e. private). For groups the LEFT JOIN keeps the chat row but
            # OtherUser comes back NULL — caller renders group UI from chat.name
            # + member_count instead.
            .outerjoin(
                OtherMember,
                (OtherMember.chat_id == Chat.id)
                & (OtherMember.user_id != current_user_id)
                & (Chat.chat_type == "private"),
            )
            .outerjoin(OtherUser, OtherUser.id == OtherMember.user_id)
            .outerjoin(Profile, Profile.user_id == OtherUser.id)
            .outerjoin(last_msg, last_msg.c.chat_id == Chat.id)
            .outerjoin(SenderProfile, SenderProfile.user_id == last_msg.c.sender_id)
            .outerjoin(unread_private, unread_private.c.chat_id == Chat.id)
            .outerjoin(unread_group, unread_group.c.chat_id == Chat.id)
            .outerjoin(member_count_sub, member_count_sub.c.chat_id == Chat.id)
            .where(ChatMember.user_id == current_user_id)
            .order_by(func.coalesce(last_msg.c.created_at, Chat.updated_at).desc())
        )
        result = await session.execute(query)
        return result.all()

    @staticmethod
    async def get_unread_total(session: AsyncSession, current_user_id: int) -> int:
        """Total unread messages for a user across all their chats.

        Same semantics as the per-chat unread_count in get_chats:
        * private: messages where I'm the recipient and is_read is False
        * group:   messages from others in group chats with no MessageRead(me) row
        """
        from messenger.backend.models.message_read import MessageRead

        private_total = await session.scalar(
            select(func.count(Message.id))
            .where(Message.recipient_id == current_user_id)
            .where(Message.is_read == False)  # noqa: E712
        )

        group_total = await session.scalar(
            select(func.count(Message.id))
            .join(Chat, Chat.id == Message.chat_id)
            .outerjoin(
                MessageRead,
                (MessageRead.message_id == Message.id)
                & (MessageRead.user_id == current_user_id),
            )
            .where(Chat.chat_type == "group")
            .where(Message.sender_id != current_user_id)
            .where(MessageRead.message_id.is_(None))
        )

        return (private_total or 0) + (group_total or 0)


async def cached_chat_partners(redis: Redis, session: AsyncSession, user_id: int) -> list[int]:
    """Read-through кэш distinct partner-id для user_id (ключ chat_partners(uid)).

    Читается в presence/profile WS-листенерах и в /chats/presence на каждом
    state-переходе × воркер. Fail-open наследуется из cached()."""
    return await cached(
        redis,
        chat_partners(user_id),
        PARTNERS_TTL,
        lambda: ChatCRUD.get_chat_partners(session, user_id),
    )


async def cached_member_ids(redis: Redis, session: AsyncSession, chat_id: int) -> list[int]:
    """Read-through кэш всех user_id чата (ключ members(chat_id)).

    Горячий путь — фан-аут групповых сообщений (_resolve_recipient_ids).
    Sender включён в список; вызывающий фильтрует себя сам."""
    return await cached(
        redis,
        members(chat_id),
        MEMBERS_TTL,
        lambda: ChatCRUD.get_member_ids(session, chat_id),
    )


async def _chats_of_loader(session: AsyncSession, user_id: int) -> list[int]:
    """Все chat_id, в которых состоит user_id. Loader для cached_chats_of."""
    rows = await session.execute(
        select(ChatMember.chat_id).where(ChatMember.user_id == user_id)
    )
    return [row[0] for row in rows.all()]


async def cached_chats_of(redis: Redis, session: AsyncSession, user_id: int) -> list[int]:
    """Read-through кэш chat-id'ов юзера (ключ chats_of(uid))."""
    return await cached(
        redis,
        chats_of(user_id),
        MEMBERS_TTL,
        lambda: _chats_of_loader(session, user_id),
    )


async def cached_is_chat_member(
    redis: Redis, session: AsyncSession, chat_id: int, user_id: int
) -> bool:
    """Членство, отвечаемое из кэшированного chats_of(uid) без отдельного SELECT.

    Fail-open наследуется из cached_chats_of → cached()."""
    chat_ids = await cached_chats_of(redis, session, user_id)
    return chat_id in chat_ids


async def invalidate_membership(
    redis: Redis,
    *,
    user_ids: list[int],
    chat_id: int,
    bust_notif: bool = False,
) -> None:
    """Бьёт кэши членства после мутации (ВСЕГДА после commit).

    Удаляет chat_partners(uid) и chats_of(uid) для каждого затронутого юзера
    плюс members(chat_id). При bust_notif=True (delete_chat / удаление юзера)
    дополнительно бьёт notif_muted(uid) и push_subs(uid) — CASCADE в Postgres
    не чистит Redis. Fail-open: ошибки Redis проглатываются в invalidate()."""
    keys: list[str] = [members(chat_id)]
    for uid in user_ids:
        keys.append(chat_partners(uid))
        keys.append(chats_of(uid))
        if bust_notif:
            keys.append(notif_muted(uid))
            keys.append(push_subs(uid))
    await invalidate(redis, *keys)
