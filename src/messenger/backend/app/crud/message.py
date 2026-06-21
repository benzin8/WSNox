from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.crud.chat import ChatCRUD
from messenger.backend.core.albums import album_keys_to_delete
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
        album_id: str | None = None,
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
            album_id=album_id,
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
    async def count_in_chat_by_sender(db: AsyncSession, chat_id: int, sender_id: int) -> int:
        """How many messages `sender_id` has sent in `chat_id` (consent gate)."""
        return (
            await db.scalar(
                select(func.count())
                .select_from(Message)
                .where(Message.chat_id == chat_id, Message.sender_id == sender_id)
            )
        ) or 0

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
            # IDOR guard: only resolve reply previews for messages IN THIS chat.
            # Without the chat_id filter, a crafted reply_to_id pointing at any
            # message id would leak that message's decrypted text in the preview.
            reply_result = await db.execute(
                select(Message).where(
                    Message.id.in_(reply_ids),
                    Message.chat_id == chat_id,
                )
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
    async def get_media_messages(
        db: AsyncSession, chat_id: int, *, before_id: int | None = None, limit: int = 30
    ) -> list[Message]:
        """Photos/videos in a chat, newest-first, id-cursor paginated.

        Captions are decrypted onto `.text` so the gallery can show them.
        """
        query = select(Message).where(
            Message.chat_id == chat_id,
            Message.msg_type.in_(("image", "video")),
        )
        if before_id is not None:
            query = query.where(Message.id < before_id)
        query = query.order_by(Message.id.desc()).limit(limit)
        rows = (await db.execute(query)).scalars().all()
        for m in rows:
            m.text = decrypt_message(m.encrypted_data)
        return list(rows)

    # Bounds for on-the-fly word search (approach A): scan messages in pages,
    # decrypting as we go, stopping at `limit` hits or once we've looked at
    # SCAN_CAP messages (so a huge channel can't make one query run forever).
    _SEARCH_PAGE = 200
    _SEARCH_SCAN_CAP = 2000

    @staticmethod
    async def search_messages(
        db: AsyncSession,
        chat_id: int,
        *,
        q: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        before_id: int | None = None,
        limit: int = 30,
    ) -> tuple[list[Message], int | None]:
        """Search one chat by words and/or date. Returns (messages, next_before_id).

        Date-only filters are pure SQL on the indexed `created_at`. Word search
        decrypts each candidate and keeps case-insensitive substring matches —
        message bodies are encrypted at rest, so this can't be a DB query.
        """
        def _scoped(stmt):
            stmt = stmt.where(Message.chat_id == chat_id)
            if date_from is not None:
                stmt = stmt.where(Message.created_at >= date_from)
            if date_to is not None:
                stmt = stmt.where(Message.created_at <= date_to)
            return stmt

        if not q:
            stmt = _scoped(select(Message))
            if before_id is not None:
                stmt = stmt.where(Message.id < before_id)
            stmt = stmt.order_by(Message.id.desc()).limit(limit)
            rows = list((await db.execute(stmt)).scalars().all())
            for m in rows:
                m.text = decrypt_message(m.encrypted_data)
            next_before = rows[-1].id if len(rows) == limit else None
            return rows, next_before

        needle = q.casefold()
        hits: list[Message] = []
        cursor = before_id
        scanned = 0
        last_scanned: int | None = None
        ended = False
        while len(hits) < limit and scanned < MessageCRUD._SEARCH_SCAN_CAP:
            stmt = _scoped(select(Message))
            if cursor is not None:
                stmt = stmt.where(Message.id < cursor)
            stmt = stmt.order_by(Message.id.desc()).limit(MessageCRUD._SEARCH_PAGE)
            batch = list((await db.execute(stmt)).scalars().all())
            if not batch:
                ended = True
                break
            reached = False
            for m in batch:
                scanned += 1
                last_scanned = m.id
                text = decrypt_message(m.encrypted_data)
                if needle in text.casefold():
                    m.text = text
                    hits.append(m)
                    if len(hits) >= limit:
                        reached = True
                        break
            cursor = batch[-1].id
            if reached:
                break
            if len(batch) < MessageCRUD._SEARCH_PAGE:
                ended = True
                break
        next_before = None if ended else last_scanned
        return hits, next_before

    @staticmethod
    async def delete_message(
        db: AsyncSession, message_id: int, user_id: int, *, redis: Redis | None = None, storage=None
    ) -> list[int]:
        """Delete a message (or its whole album) if the user is the sender.

        Returns the list of deleted message ids ([] if nothing was deleted —
        the caller's ``if deleted:`` truthiness check still works). Also removes
        the messages' S3 objects (best-effort) so deleted media doesn't orphan
        in the bucket and rack up storage cost.
        """
        result = await db.execute(
            select(Message).where(Message.id == message_id)
        )
        message = result.scalar_one_or_none()
        if not message or message.sender_id != user_id:
            return []
        recipient_id = message.recipient_id
        if message.album_id:
            # Delete the whole album: every row sharing this album_id owned by
            # the same sender (ownership already checked on the clicked row).
            rows = list((await db.execute(
                select(Message).where(
                    Message.album_id == message.album_id,
                    Message.sender_id == user_id,
                )
            )).scalars().all())
        else:
            rows = [message]
        deleted_ids = [m.id for m in rows]
        keys = album_keys_to_delete(rows)
        for row in rows:
            await db.delete(row)
        await db.commit()
        if storage is not None:
            for key in keys:
                try:
                    await storage.delete_object(key)
                except Exception:  # noqa: BLE001 — best-effort cleanup
                    pass
        affected = {user_id}
        if recipient_id is not None:
            affected.add(recipient_id)
        await MessageCRUD._bust_unread(redis, list(affected))
        return deleted_ids

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
