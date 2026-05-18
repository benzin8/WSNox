from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.core.crypto import decrypt_message, encrypt_message
from messenger.backend.models import Chat, Message


class MessageCRUD:
    @staticmethod
    async def create_text_message(db: AsyncSession, chat_id: int, sender_id: int, recipient_id: int, text: str) -> Message:
        encrypted_text = encrypt_message(text)
        message = Message(
            chat_id = chat_id,
            sender_id = sender_id,
            recipient_id = recipient_id,
            encrypted_data = encrypted_text
        )
        db.add(message)
        await db.execute(
            update(Chat)
            .where(Chat.id == chat_id)
            .values(updated_at=datetime.now(timezone.utc))
        )
        await db.commit()
        await db.refresh(message)
        return message

    @staticmethod
    async def get_messages(db: AsyncSession, chat_id: int) -> list[Message]:
        query = (
            select(Message)
            .where(Message.chat_id == chat_id)
            .order_by(Message.created_at.desc())
            .limit(100)
        )
        result = await db.execute(query)
        messages = result.scalars().all()
        for message in messages:
            message.text = decrypt_message(message.encrypted_data)
        return messages[::-1]

    @staticmethod
    async def mark_as_read(db: AsyncSession, chat_id: int, user_id: int) -> None:
        await db.execute(
            update(Message)
            .where(Message.chat_id == chat_id)
            .where(Message.recipient_id == user_id)
            .where(Message.is_read == False)  # noqa: E712
            .values(is_read=True)
        )
        await db.commit()
