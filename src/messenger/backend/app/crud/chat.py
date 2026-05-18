from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from messenger.backend.app.api_v1.schemas.chat import ChatCreateRequest
from messenger.backend.models.chat import Chat, ChatMember
from messenger.backend.models.message import Message
from messenger.backend.models.user import User


class ChatCRUD:
    @staticmethod
    async def search_chats(session: AsyncSession, search_query: str, user_id: str) -> list[User]:
        query = (
            select(User)
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
    async def is_chat_member(session: AsyncSession, chat_id: int, user_id: int) -> bool:
        query = select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user_id,
        )
        result = await session.execute(query)
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def get_chats(session: AsyncSession, current_user_id: int):
        OtherUser = aliased(User)
        OtherMember = aliased(ChatMember)

        msg_ranked = (
            select(
                Message.chat_id,
                Message.encrypted_data,
                Message.created_at,
                func.row_number().over(
                    partition_by=Message.chat_id,
                    order_by=Message.created_at.desc(),
                ).label("rn"),
            )
        ).subquery()

        last_msg = select(msg_ranked).where(msg_ranked.c.rn == 1).subquery()

        unread_sub = (
            select(
                Message.chat_id,
                func.count(Message.id).label("cnt"),
            )
            .where(Message.recipient_id == current_user_id)
            .where(Message.is_read == False)  # noqa: E712
            .group_by(Message.chat_id)
        ).subquery()

        query = (
            select(
                Chat,
                OtherUser,
                last_msg.c.encrypted_data,
                last_msg.c.created_at.label("last_msg_time"),
                unread_sub.c.cnt,
            )
            .join(ChatMember, ChatMember.chat_id == Chat.id)
            .join(OtherMember, (OtherMember.chat_id == Chat.id) & (OtherMember.user_id != current_user_id))
            .join(OtherUser, OtherUser.id == OtherMember.user_id)
            .outerjoin(last_msg, last_msg.c.chat_id == Chat.id)
            .outerjoin(unread_sub, unread_sub.c.chat_id == Chat.id)
            .where(ChatMember.user_id == current_user_id)
            .order_by(func.coalesce(last_msg.c.created_at, Chat.updated_at).desc())
        )
        result = await session.execute(query)
        return result.all()