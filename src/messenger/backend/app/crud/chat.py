from messenger.backend.models.chat import Chat, ChatMember
from messenger.backend.models.user import User
from messenger.backend.app.api_v1.schemas.chat import ChatCreateRequest

from messenger.backend.db.session import get_db_session

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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
    async def create_private_chat(session: AsyncSession, chat_data: ChatCreateRequest, members: list[int]) -> Chat:
        chat = Chat(
            chat_type = "private",
            name = f"{str(chat_data.user_id)}_{str(chat_data.other_user_id)}",
        )
        session.add(chat)
        await session.commit()
        await session.refresh(chat)

        for member in members:
            chat_member = ChatMember(
                chat_id = chat.id,
                user_id = member,
                role = "admin",
            )
            session.add(chat_member)
        await session.commit()
        await session.refresh(chat)
        return chat

    @staticmethod
    async def get_chat_by_user_id(session: AsyncSession, current_user_id: int, other_user_id: int) -> Chat:
        query = (select(Chat).where(Chat.members.any(ChatMember.user_id == current_user_id)).where(Chat.members.any(ChatMember.user_id == other_user_id)))
        result = await session.execute(query)
        return result.scalars().first()
