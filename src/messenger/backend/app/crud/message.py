from messenger.backend.models import Message, Chat
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timezone

from messenger.backend.core.crypto import encrypt_message, decrypt_message

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
        ) # Вывод последних 100 сообщений
        result = await db.execute(query)
        messages = result.scalars().all()
        for message in messages:
            message.text = decrypt_message(message.encrypted_data)
        return messages[::-1]
