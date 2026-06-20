from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.crud.chat import ChatCRUD
from messenger.backend.core.cache import invalidate, unread_total
from messenger.backend.core.crypto import decrypt_message, encrypt_message
from messenger.backend.models import Chat, Message
from messenger.backend.models.message_read import MessageRead


class MessageCRUD:
    @staticmethod
    async def _affected_member_ids(
        db: AsyncSession, chat_id: int, sender_id: int, recipient_id: int | None
    ) -> list[int]:
        """Юзеры, чей unread_total мог измениться от нового сообщения (без отправителя).

        private: один получатель; group: все участники чата минус отправитель
        (через кэшируемый get_member_ids после Фазы 3)."""
        if recipient_id is not None:
            return [recipient_id]
        members = await ChatCRUD.get_member_ids(db, chat_id)
        return [uid for uid in members if uid != sender_id]

    @staticmethod
    async def _bust_unread(redis: Redis | None, user_ids: list[int]) -> None:
        """DEL unread_total(uid) для всех затронутых юзеров. Fail-open, no-op без redis."""
        if redis is None or not user_ids:
            return
        await invalidate(redis, *[unread_total(uid) for uid in user_ids])

    @staticmethod
    async def create_text_message(db: AsyncSession, chat_id: int, sender_id: int, recipient_id: int | None, text: str, reply_to_id: int | None = None, *, redis: Redis | None = None) -> Message:
        encrypted_text = encrypt_message(text)
        message = Message(
            chat_id = chat_id,
            sender_id = sender_id,
            recipient_id = recipient_id,
            encrypted_data = encrypted_text,
            reply_to_id = reply_to_id,
        )
        db.add(message)
        await db.execute(
            update(Chat)
            .where(Chat.id == chat_id)
            .values(updated_at=datetime.now(timezone.utc))
        )
        await db.commit()
        await db.refresh(message)
        affected = await MessageCRUD._affected_member_ids(db, chat_id, sender_id, recipient_id)
        await MessageCRUD._bust_unread(redis, affected)
        return message

    @staticmethod
    async def create_media_message(
        db: AsyncSession,
        *,
        chat_id: int,
        sender_id: int,
        recipient_id: int,
        msg_type: str,
        attachment_key: str,
        attachment_thumb_key: str | None,
        attachment_meta: dict[str, Any] | None,
        caption: str = "",
        reply_to_id: int | None = None,
        redis: Redis | None = None,
    ) -> Message:
        """Persist a media message. Caption is encrypted just like text bodies
        (so an empty caption still produces a valid ciphertext) — callers that
        want NO caption pass an empty string."""
        encrypted_caption = encrypt_message(caption or "")
        message = Message(
            chat_id=chat_id,
            sender_id=sender_id,
            recipient_id=recipient_id,
            encrypted_data=encrypted_caption,
            msg_type=msg_type,
            reply_to_id=reply_to_id,
            attachment_key=attachment_key,
            attachment_thumb_key=attachment_thumb_key,
            attachment_meta=attachment_meta,
        )
        db.add(message)
        await db.execute(
            update(Chat)
            .where(Chat.id == chat_id)
            .values(updated_at=datetime.now(timezone.utc))
        )
        await db.commit()
        await db.refresh(message)
        affected = await MessageCRUD._affected_member_ids(db, chat_id, sender_id, recipient_id)
        await MessageCRUD._bust_unread(redis, affected)
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

        # Collect reply_to_ids and batch-fetch them
        reply_ids = {m.reply_to_id for m in messages if m.reply_to_id}
        reply_map: dict[int, tuple[str, str]] = {}
        if reply_ids:
            reply_result = await db.execute(
                select(Message).where(Message.id.in_(reply_ids))
            )
            for rm in reply_result.scalars().all():
                reply_map[rm.id] = (decrypt_message(rm.encrypted_data), rm.msg_type)

        for message in messages:
            message.text = decrypt_message(message.encrypted_data)
            if message.reply_to_id and message.reply_to_id in reply_map:
                reply_text, reply_type = reply_map[message.reply_to_id]
                message.reply_to_text = reply_text
                message.reply_to_msg_type = reply_type
            else:
                message.reply_to_text = None
                message.reply_to_msg_type = None
        return messages[::-1]

    @staticmethod
    async def delete_message(db: AsyncSession, message_id: int, user_id: int, *, redis: Redis | None = None) -> bool:
        """Delete a message if the user is the sender. Returns True if deleted."""
        result = await db.execute(
            select(Message).where(Message.id == message_id)
        )
        message = result.scalar_one_or_none()
        if not message or message.sender_id != user_id:
            return False
        recipient_id = message.recipient_id
        await db.delete(message)
        await db.commit()
        affected = {user_id}
        if recipient_id is not None:
            affected.add(recipient_id)
        await MessageCRUD._bust_unread(redis, list(affected))
        return True

    @staticmethod
    async def edit_message(db: AsyncSession, message_id: int, user_id: int, new_text: str) -> Message | None:
        """Edit a message if the user is the sender. Returns updated Message or None."""
        result = await db.execute(
            select(Message).where(Message.id == message_id)
        )
        message = result.scalar_one_or_none()
        if not message or message.sender_id != user_id:
            return None
        message.encrypted_data = encrypt_message(new_text)
        message.edited_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(message)
        return message

    @staticmethod
    async def _insert_group_reads(
        db: AsyncSession, chat_id: int, user_id: int, up_to_message_id: int | None = None
    ) -> int:
        """Record per-user read rows for group messages from other members.

        Group chats have no single recipient, so unread is tracked via
        MessageRead rows (see ChatCRUD unread formula) rather than the
        Message.is_read flag. This inserts the missing rows. Returns how many
        messages were newly marked. For private chats this matches nothing.
        """
        query = (
            select(Message.id)
            .join(Chat, Chat.id == Message.chat_id)
            .outerjoin(
                MessageRead,
                (MessageRead.message_id == Message.id) & (MessageRead.user_id == user_id),
            )
            .where(Message.chat_id == chat_id)
            .where(Chat.chat_type.in_(("group", "channel")))
            .where(Message.sender_id != user_id)
            .where(MessageRead.message_id.is_(None))
        )
        if up_to_message_id is not None:
            query = query.where(Message.id <= up_to_message_id)

        ids = [row[0] for row in (await db.execute(query)).all()]
        if not ids:
            return 0
        await db.execute(
            pg_insert(MessageRead)
            .values([{"message_id": mid, "user_id": user_id} for mid in ids])
            .on_conflict_do_nothing()
        )
        return len(ids)

    @staticmethod
    async def mark_as_read(db: AsyncSession, chat_id: int, user_id: int, *, redis: Redis | None = None) -> int:
        """Mark all unread messages in the chat as read.

        Private chats: flip is_read on messages addressed to the user.
        Group chats: insert per-user MessageRead rows for messages from others.
        Returns the max private message id marked (for the read-receipt WS
        event), or 0 if nothing private changed.
        """
        now = datetime.now(timezone.utc)
        # Get max id before update for the WS event
        max_id_result = await db.execute(
            select(func.max(Message.id))
            .where(Message.chat_id == chat_id)
            .where(Message.recipient_id == user_id)
            .where(Message.is_read == False)  # noqa: E712
        )
        max_id = max_id_result.scalar() or 0

        if max_id:
            await db.execute(
                update(Message)
                .where(Message.chat_id == chat_id)
                .where(Message.recipient_id == user_id)
                .where(Message.is_read == False)  # noqa: E712
                .values(is_read=True, read_at=now)
            )

        group_marked = await MessageCRUD._insert_group_reads(db, chat_id, user_id)

        if max_id or group_marked:
            await db.commit()
            await MessageCRUD._bust_unread(redis, [user_id])
        return max_id

    @staticmethod
    async def mark_as_read_up_to(db: AsyncSession, chat_id: int, user_id: int, up_to_message_id: int, *, redis: Redis | None = None) -> None:
        """Mark messages up to a specific message_id as read (private + group)."""
        now = datetime.now(timezone.utc)
        await db.execute(
            update(Message)
            .where(Message.chat_id == chat_id)
            .where(Message.recipient_id == user_id)
            .where(Message.id <= up_to_message_id)
            .where(Message.is_read == False)  # noqa: E712
            .values(is_read=True, read_at=now)
        )
        await MessageCRUD._insert_group_reads(db, chat_id, user_id, up_to_message_id)
        await db.commit()
        await MessageCRUD._bust_unread(redis, [user_id])
