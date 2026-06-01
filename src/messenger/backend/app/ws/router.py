import asyncio
import json
from datetime import datetime, timezone
from typing import Dict

from fastapi import APIRouter, WebSocket
from fastapi.websockets import WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_user_from_token
from messenger.backend.app.api_v1.schemas.message import _utc_iso
from messenger.backend.app.crud.chat import ChatCRUD
from messenger.backend.app.crud.message import MessageCRUD
from messenger.backend.app.crud.notification import (
    NotificationCRUD,
    should_expose_read_receipts,
)
from messenger.backend.app.ws.push import send_push_to_user
from messenger.backend.app.ws.viewing_chat import (
    clear_viewing_chat,
    get_viewing_chat,
    set_viewing_chat,
)
from messenger.backend.core.crypto import decrypt_message
from messenger.backend.core.redis import get_redis
from messenger.backend.db.session import AsyncSessionLocal
from messenger.backend.models.message import Message
from messenger.backend.models.user import User

REDIS_CHAT_CHANNEL = "chat_messages"
AUTH_TIMEOUT_SECONDS = 10

# WebSocket close codes
WS_AUTH_FAILED = 4401  # custom 4xxx code, equivalent to HTTP 401


async def publish_media_message(
    db: AsyncSession,
    chat_id: int,
    sender_id: int,
    recipient_id: int,
    message: Message,
    caption: str,
    attachment_url: str | None,
    attachment_thumb_url: str | None,
) -> None:
    """Fan out a media message to the recipient via the existing pubsub channel.

    Mirrors the text-message flow in ``ConnectionManager.send_personal_message``
    but carries attachment fields. The recipient's WS handler in
    ``pubsub_listener`` already forwards every published payload — adding the
    attachment_* keys here is backwards-compatible for older clients that
    ignore unknown fields.
    """
    from sqlalchemy.orm import selectinload as _selectinload
    sender = await db.get(User, sender_id, options=[_selectinload(User.profile)])
    sender_display_name = sender.profile.display_name if sender.profile else None
    reply_to_text = None
    if message.reply_to_id:
        from messenger.backend.core.crypto import decrypt_message as _decrypt
        reply_msg = await db.get(Message, message.reply_to_id)
        if reply_msg:
            try:
                reply_to_text = _decrypt(reply_msg.encrypted_data)
            except Exception:  # noqa: BLE001
                pass

    payload = json.dumps({
        "recipient_id": recipient_id,
        "encrypted_text": message.encrypted_data,
        "sender_id": sender_id,
        "chat_id": chat_id,
        "created_at": _utc_iso(message.created_at),
        "message_id": message.id,
        "reply_to_id": message.reply_to_id,
        "reply_to_text": reply_to_text,
        "msg_type": message.msg_type,
        "attachment_url": attachment_url,
        "attachment_thumb_url": attachment_thumb_url,
        "attachment_meta": message.attachment_meta,
        "chat_info": {
            "id": chat_id,
            "name": f"private_{min(sender_id, recipient_id)}_{max(sender_id, recipient_id)}",
            "chat_type": "private",
            "recipient_id": sender_id,
            "recipient": {
                "id": sender.id,
                "name": sender.name,
                "username": sender.username,
                "display_name": sender_display_name,
            },
        },
    })
    redis = get_redis()
    await redis.publish(REDIS_CHAT_CHANNEL, payload)


async def publish_read_receipt(
    db: AsyncSession,
    chat_id: int,
    reader_id: int,
    up_to_message_id: int,
) -> None:
    """Fan out a messages_read event so the sender's client can flip the
    read indicator without a refresh. Caller must have already persisted
    the read_at update in the DB. Honors the reciprocity rule."""
    other = await ChatCRUD.get_other_user_by_chat_id(db, chat_id, reader_id)
    if not other:
        return
    if not await should_expose_read_receipts(db, reader_id, other.user_id):
        return
    payload = json.dumps({
        "type": "messages_read",
        "chat_id": chat_id,
        "up_to_message_id": up_to_message_id,
        "read_at": datetime.now(timezone.utc).isoformat(),
        "reader_id": reader_id,
    })
    redis = get_redis()
    await redis.publish(REDIS_CHAT_CHANNEL + ":read_receipts", payload)


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[int, set[WebSocket]] = {}
        self.offline_broadcasted: set[int] = set()

    async def connect(self, websocket: WebSocket, user_id: int) -> None:
        self.active_connections.setdefault(user_id, set()).add(websocket)
        self.offline_broadcasted.discard(user_id)

    async def disconnect(self, websocket: WebSocket, user_id: int) -> bool:
        """Remove `websocket` from the user's set. Returns True if the set is
        now empty (i.e. the user has no remaining sockets)."""
        sockets = self.active_connections.get(user_id)
        if not sockets:
            return True
        sockets.discard(websocket)
        if not sockets:
            del self.active_connections[user_id]
            return True
        return False

    async def send_personal_message(
        self,
        chat_id: int,
        text: str,
        recipient_id: int,
        sender_id: int,
        db: AsyncSession,
        reply_to_id: int | None = None,
    ) -> int:
        message = await MessageCRUD.create_text_message(
            db=db,
            chat_id=chat_id,
            sender_id=sender_id,
            recipient_id=recipient_id,
            text=text,
            reply_to_id=reply_to_id,
        )
        from sqlalchemy.orm import selectinload as _selectinload
        sender = await db.get(User, sender_id, options=[_selectinload(User.profile)])
        sender_display_name = sender.profile.display_name if sender.profile else None
        # Fetch reply-to text if this is a reply
        reply_to_text = None
        if message.reply_to_id:
            from messenger.backend.core.crypto import decrypt_message as _decrypt
            reply_msg = await db.get(Message, message.reply_to_id)
            if reply_msg:
                try:
                    reply_to_text = _decrypt(reply_msg.encrypted_data)
                except Exception:  # noqa: BLE001
                    pass

        payload = json.dumps({
            "recipient_id": recipient_id,
            "encrypted_text": message.encrypted_data,
            "sender_id": sender_id,
            "chat_id": chat_id,
            "created_at": _utc_iso(message.created_at),
            "message_id": message.id,
            "reply_to_id": message.reply_to_id,
            "reply_to_text": reply_to_text,
            "chat_info": {
                "id": chat_id,
                "name": f"private_{min(sender_id, recipient_id)}_{max(sender_id, recipient_id)}",
                "chat_type": "private",
                "recipient_id": sender_id,
                "recipient": {
                    "id": sender.id,
                    "name": sender.name,
                    "username": sender.username,
                    "display_name": sender_display_name,
                },
            },
        })
        redis = get_redis()
        await redis.publish(REDIS_CHAT_CHANNEL, payload)
        return message.id

    async def pubsub_listener(self) -> None:
        redis = get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(REDIS_CHAT_CHANNEL)

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = json.loads(message["data"])
                recipient_id = data.get("recipient_id")
                encrypted_text = data.get("encrypted_text")
                sender_id = data.get("sender_id")
                chat_id = data.get("chat_id")
                chat_info = data.get("chat_info")

                sockets = self.active_connections.get(recipient_id, set())
                if not sockets:
                    # No active WebSocket — consider push, but respect prefs
                    if await self._should_push(recipient_id, chat_id):
                        sender_name = (chat_info or {}).get("recipient", {}).get("name", "")
                        asyncio.create_task(send_push_to_user(recipient_id, {
                            "title": f"Новое сообщение от {sender_name}" if sender_name else "Новое сообщение",
                            "body": "Нажмите, чтобы открыть чат",
                            "chat_id": chat_id,
                            "sender_id": sender_id,
                        }))
                    continue
                try:
                    decrypted_text = decrypt_message(encrypted_text)
                except Exception:  # noqa: BLE001
                    continue
                payload = {
                    "text": decrypted_text,
                    "sender_id": sender_id,
                    "recipient_id": recipient_id,
                    "chat_id": chat_id,
                    "chat_info": chat_info,
                    "created_at": data.get("created_at"),
                    "message_id": data.get("message_id"),
                    "reply_to_id": data.get("reply_to_id"),
                    "reply_to_text": data.get("reply_to_text"),
                    "msg_type": data.get("msg_type", "text"),
                    "attachment_url": data.get("attachment_url"),
                    "attachment_thumb_url": data.get("attachment_thumb_url"),
                    "attachment_meta": data.get("attachment_meta"),
                }
                dead = []
                for ws in sockets:
                    try:
                        await ws.send_json(payload)
                    except Exception:  # noqa: BLE001
                        dead.append(ws)
                for ws in dead:
                    sockets.discard(ws)
                if not sockets:
                    self.active_connections.pop(recipient_id, None)
        except asyncio.CancelledError:
            await pubsub.unsubscribe(REDIS_CHAT_CHANNEL)

    async def read_receipts_listener(self) -> None:
        """Listen for read receipt events and fan out to the message sender."""
        redis = get_redis()
        pubsub = redis.pubsub()
        channel = REDIS_CHAT_CHANNEL + ":read_receipts"
        await pubsub.subscribe(channel)

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = json.loads(message["data"])
                if data.get("type") != "messages_read":
                    continue
                reader_id = data.get("reader_id")
                # Send to all participants of the chat EXCEPT the reader
                for uid, sockets in list(self.active_connections.items()):
                    if uid == reader_id:
                        continue
                    dead = []
                    for ws in sockets:
                        try:
                            await ws.send_json(data)
                        except Exception:  # noqa: BLE001
                            dead.append(ws)
                    for ws in dead:
                        sockets.discard(ws)
                    if not sockets and uid in self.active_connections:
                        del self.active_connections[uid]
        except asyncio.CancelledError:
            await pubsub.unsubscribe(channel)

    async def deletions_listener(self) -> None:
        """Listen for message deletion events and fan out to chat participants."""
        redis = get_redis()
        pubsub = redis.pubsub()
        channel = REDIS_CHAT_CHANNEL + ":deletions"
        await pubsub.subscribe(channel)

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = json.loads(message["data"])
                if data.get("type") != "message_deleted":
                    continue
                # Send to all connected users — they filter by chat_id client-side
                for uid, sockets in list(self.active_connections.items()):
                    dead = []
                    for ws in sockets:
                        try:
                            await ws.send_json(data)
                        except Exception:  # noqa: BLE001
                            dead.append(ws)
                    for ws in dead:
                        sockets.discard(ws)
                    if not sockets and uid in self.active_connections:
                        del self.active_connections[uid]
        except asyncio.CancelledError:
            await pubsub.unsubscribe(channel)

    async def edits_listener(self) -> None:
        """Listen for message edit events and fan out to chat participants."""
        redis = get_redis()
        pubsub = redis.pubsub()
        channel = REDIS_CHAT_CHANNEL + ":edits"
        await pubsub.subscribe(channel)

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = json.loads(message["data"])
                if data.get("type") != "message_edited":
                    continue
                for uid, sockets in list(self.active_connections.items()):
                    dead = []
                    for ws in sockets:
                        try:
                            await ws.send_json(data)
                        except Exception:  # noqa: BLE001
                            dead.append(ws)
                    for ws in dead:
                        sockets.discard(ws)
                    if not sockets and uid in self.active_connections:
                        del self.active_connections[uid]
        except asyncio.CancelledError:
            await pubsub.unsubscribe(channel)

    async def _should_push(self, recipient_id: int, chat_id: int) -> bool:
        """Apply notification preferences before sending a push.

        Returns False when push should be suppressed: user has the chat
        currently open (within grace window), user has DND on, or the chat
        is muted.
        """
        redis = get_redis()
        viewing = await get_viewing_chat(redis, recipient_id)
        if viewing is not None and viewing == chat_id:
            return False

        async with AsyncSessionLocal() as db:
            if await NotificationCRUD.get_dnd(db, recipient_id):
                return False
            if await NotificationCRUD.is_chat_muted(db, recipient_id, chat_id):
                return False
        return True


manager = ConnectionManager()
ws_router = APIRouter()


async def _authenticate(websocket: WebSocket) -> int | None:
    """Wait for the client's first message and validate the JWT inside it.

    Returns user_id on success, None on any failure (timeout, bad JSON,
    invalid token). The caller is responsible for closing the socket.
    """
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=AUTH_TIMEOUT_SECONDS)
        auth_data = json.loads(raw)
    except (asyncio.TimeoutError, json.JSONDecodeError):
        return None

    if auth_data.get("type") != "auth":
        return None
    token = auth_data.get("token")
    if not token:
        return None

    async with AsyncSessionLocal() as db:
        user = await get_user_from_token(token, db)

    return user.id if user else None


@ws_router.websocket("/chat")
async def websocket_chat(websocket: WebSocket) -> None:
    await websocket.accept()

    user_id = await _authenticate(websocket)
    if user_id is None:
        await websocket.close(code=WS_AUTH_FAILED, reason="auth failed")
        return

    from messenger.backend.app.ws.presence import (
        clear_presence,
        publish_presence_event,
        set_presence,
    )

    await manager.connect(websocket, user_id)
    redis = get_redis()
    transitioned = await set_presence(redis, user_id)
    if transitioned:
        await publish_presence_event(redis, user_id, online=True)

    try:
        await websocket.send_json({"type": "auth_ok", "user_id": user_id})

        while True:
            data = await websocket.receive_text()
            try:
                msg_data = json.loads(data)
            except json.JSONDecodeError:
                continue

            msg_type = msg_data.get("type")
            if msg_type == "ping":
                transitioned = await set_presence(redis, user_id)
                if transitioned:
                    manager.offline_broadcasted.discard(user_id)
                    await publish_presence_event(redis, user_id, online=True)
                continue

            if msg_type == "viewing_chat":
                viewing_chat_id = msg_data.get("chat_id")
                if viewing_chat_id is None:
                    await clear_viewing_chat(redis, user_id)
                else:
                    try:
                        await set_viewing_chat(redis, user_id, int(viewing_chat_id))
                    except (TypeError, ValueError):
                        pass
                continue

            if msg_type == "message_read":
                read_chat_id = msg_data.get("chat_id")
                last_message_id = msg_data.get("last_message_id")
                if read_chat_id and last_message_id:
                    try:
                        read_chat_id = int(read_chat_id)
                        last_message_id = int(last_message_id)
                    except (TypeError, ValueError):
                        continue
                    async with AsyncSessionLocal() as db:
                        if not await ChatCRUD.is_chat_member(db, read_chat_id, user_id):
                            continue
                        await MessageCRUD.mark_as_read_up_to(db, read_chat_id, user_id, last_message_id)
                        await publish_read_receipt(db, read_chat_id, user_id, last_message_id)
                continue

            if msg_type == "delete_message":
                del_message_id = msg_data.get("message_id")
                del_chat_id = msg_data.get("chat_id")
                if del_message_id and del_chat_id:
                    try:
                        del_message_id = int(del_message_id)
                        del_chat_id = int(del_chat_id)
                    except (TypeError, ValueError):
                        continue
                    async with AsyncSessionLocal() as db:
                        deleted = await MessageCRUD.delete_message(db, del_message_id, user_id)
                        if deleted:
                            other = await ChatCRUD.get_other_user_by_chat_id(db, del_chat_id, user_id)
                            if other:
                                del_payload = json.dumps({
                                    "type": "message_deleted",
                                    "chat_id": del_chat_id,
                                    "message_id": del_message_id,
                                })
                                await redis.publish(REDIS_CHAT_CHANNEL + ":deletions", del_payload)
                continue

            if msg_type == "edit_message":
                edit_message_id = msg_data.get("message_id")
                edit_chat_id = msg_data.get("chat_id")
                edit_text = msg_data.get("text")
                if edit_message_id and edit_chat_id and edit_text:
                    try:
                        edit_message_id = int(edit_message_id)
                        edit_chat_id = int(edit_chat_id)
                    except (TypeError, ValueError):
                        continue
                    async with AsyncSessionLocal() as db:
                        updated_msg = await MessageCRUD.edit_message(db, edit_message_id, user_id, edit_text)
                        if updated_msg:
                            edit_payload = json.dumps({
                                "type": "message_edited",
                                "chat_id": edit_chat_id,
                                "message_id": edit_message_id,
                                "text": edit_text,
                                "edited_at": _utc_iso(updated_msg.edited_at),
                            })
                            await redis.publish(REDIS_CHAT_CHANNEL + ":edits", edit_payload)
                continue

            chat_id = msg_data.get("chat_id")
            text = msg_data.get("text")
            if not (chat_id and text):
                continue

            reply_to_id = msg_data.get("reply_to_id")
            if reply_to_id is not None:
                try:
                    reply_to_id = int(reply_to_id)
                except (TypeError, ValueError):
                    reply_to_id = None

            async with AsyncSessionLocal() as db:
                if not await ChatCRUD.is_chat_member(db, chat_id, user_id):
                    continue
                other = await ChatCRUD.get_other_user_by_chat_id(db, chat_id, user_id)
                if not other:
                    continue
                message_id = await manager.send_personal_message(
                    chat_id=chat_id,
                    text=text,
                    recipient_id=other.user_id,
                    sender_id=user_id,
                    db=db,
                    reply_to_id=reply_to_id,
                )
                temp_id = msg_data.get("temp_id")
                if temp_id is not None:
                    await websocket.send_json({
                        "type": "message_ack",
                        "temp_id": temp_id,
                        "message_id": message_id,
                        "chat_id": chat_id,
                    })

    except WebSocketDisconnect:
        pass
    finally:
        last_socket = await manager.disconnect(websocket, user_id)
        if last_socket:
            await clear_presence(redis, user_id)
            await publish_presence_event(redis, user_id, online=False)
