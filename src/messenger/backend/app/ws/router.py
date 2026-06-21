import asyncio
import json
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Dict

from fastapi import APIRouter, WebSocket
from fastapi.websockets import WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from redis.asyncio import Redis

from messenger.backend.app.api_v1.auth.dependencies import get_user_from_token
from messenger.backend.app.api_v1.schemas.message import _utc_iso
from messenger.backend.app.crud.block import BlockCRUD
from messenger.backend.app.crud.chat import ChatCRUD, cached_is_chat_member
from messenger.backend.app.crud.message import MessageCRUD
from messenger.backend.app.crud.notification import (
    cached_get_dnd,
    cached_muted_chat_ids,
    should_expose_read_receipts,
)
from messenger.backend.app.crud.reaction import ReactionCRUD
from messenger.backend.app.ws.push import send_push_to_user
from messenger.backend.app.ws.viewing_chat import (
    clear_viewing_chat,
    get_viewing_chat,
    set_viewing_chat,
)
from messenger.backend.core.crypto import decrypt_message
from messenger.backend.core.identity import get_cached_user
from messenger.backend.core.redis import get_redis
from messenger.backend.db.session import AsyncSessionLocal
from messenger.backend.models.chat import Chat
from messenger.backend.models.message import Message
from messenger.backend.models.user import User

REDIS_CHAT_CHANNEL = "chat_messages"
AUTH_TIMEOUT_SECONDS = 10

# WebSocket close codes
WS_AUTH_FAILED = 4401  # custom 4xxx code, equivalent to HTTP 401


async def send_media_ack_to_sender(
    sender_id: int,
    temp_id: str,
    message_id: int,
    chat_id: int,
    attachment_url: str | None,
    attachment_thumb_url: str | None,
    attachment_meta: dict | None,
) -> None:
    """Push a `message_ack` directly to the sender's WS sockets.

    For text the WS handler echoes the ack on the same socket it received
    the send on. Media uploads go through HTTP — but the sender is still
    holding an open WS, so we look its sockets up in `manager` and emit
    the ack there. If the HTTP response is lost (slow link, proxy timeout)
    this is what flips the optimistic message from `uploading` to `sent`.
    """
    sockets = manager.active_connections.get(sender_id)
    if not sockets:
        return
    payload = {
        "type": "message_ack",
        "temp_id": temp_id,
        "message_id": message_id,
        "chat_id": chat_id,
        "attachment_url": attachment_url,
        "attachment_thumb_url": attachment_thumb_url,
        "attachment_meta": attachment_meta,
    }
    dead = []
    for ws in list(sockets):
        try:
            await ws.send_json(payload)
        except Exception:  # noqa: BLE001
            dead.append(ws)
    for ws in dead:
        sockets.discard(ws)


async def _resolve_sender_avatar_url(storage, profile) -> str | None:
    """Return a presigned thumb URL for a sender's avatar, if any.

    Used by the publishers so each WS message carries the sender's avatar
    URL — group bubbles can render the avatar next to the bubble without
    an extra fetch. Storage may be None in test/local setups; in that
    case we just return None.
    """
    if not profile or not profile.avatar or storage is None:
        return None
    from messenger.backend.services.avatar_urls import resolve_avatar_urls
    urls = await resolve_avatar_urls(storage, profile.avatar, redis=get_redis())
    return urls.thumb


async def publish_media_message(
    db: AsyncSession,
    chat_id: int,
    sender_id: int,
    recipient_id: int | None,
    message: Message,
    caption: str,
    attachment_url: str | None,
    attachment_thumb_url: str | None,
    chat_type: str = "private",
    storage=None,
) -> None:
    """Fan out a media message via the existing pubsub channel.

    For private chats we publish to the single ``recipient_id``. For group
    chats we resolve the chat's member list (minus the sender) and publish a
    ``recipient_ids`` list — the listener iterates it and delivers to each
    online socket. Either way the payload also carries sender display info so
    the receiving client can render the bubble immediately.
    """
    from sqlalchemy.orm import selectinload as _selectinload
    sender = await db.get(User, sender_id, options=[_selectinload(User.profile)])
    sender_display_name = sender.profile.display_name if sender.profile else None
    sender_avatar_url = await _resolve_sender_avatar_url(storage, sender.profile if sender else None)
    reply_to_text = None
    reply_to_msg_type = None
    if message.reply_to_id:
        from messenger.backend.core.crypto import decrypt_message as _decrypt
        reply_msg = await db.get(Message, message.reply_to_id)
        if reply_msg:
            try:
                reply_to_text = _decrypt(reply_msg.encrypted_data)
            except Exception:  # noqa: BLE001
                pass
            reply_to_msg_type = reply_msg.msg_type

    redis = get_redis()
    recipient_ids = await _resolve_recipient_ids(db, redis, chat_id, sender_id, chat_type, recipient_id)
    chat_info = await _build_chat_info(db, chat_id, sender_id, recipient_id, chat_type, sender, sender_display_name)

    payload = json.dumps({
        "recipient_id": recipient_id,
        "recipient_ids": recipient_ids,
        "encrypted_text": message.encrypted_data,
        "sender_id": sender_id,
        "sender_display_name": sender_display_name,
        "sender_avatar_url": sender_avatar_url,
        "chat_id": chat_id,
        "chat_type": chat_type,
        "created_at": _utc_iso(message.created_at),
        "message_id": message.id,
        "reply_to_id": message.reply_to_id,
        "reply_to_text": reply_to_text,
        "reply_to_msg_type": reply_to_msg_type,
        "msg_type": message.msg_type,
        "attachment_url": attachment_url,
        "attachment_thumb_url": attachment_thumb_url,
        "attachment_meta": message.attachment_meta,
        "chat_info": chat_info,
    })
    await redis.publish(REDIS_CHAT_CHANNEL, payload)


async def _resolve_recipient_ids(
    db: AsyncSession,
    redis: "Redis",
    chat_id: int,
    sender_id: int,
    chat_type: str,
    recipient_id: int | None,
) -> list[int]:
    """List of users who should receive a message fan-out, sender excluded."""
    if chat_type == "private":
        return [recipient_id] if recipient_id is not None else []
    from messenger.backend.app.crud.chat import cached_member_ids
    members = await cached_member_ids(redis, db, chat_id)
    return [uid for uid in members if uid != sender_id]


async def _build_chat_info(
    db: AsyncSession,
    chat_id: int,
    sender_id: int,
    recipient_id: int | None,
    chat_type: str,
    sender: User,
    sender_display_name: str | None,
) -> dict:
    """Build the chat_info blob the client uses to render the chat row.

    Private: includes the sender as the "recipient" (the client uses the
    other party). Group: includes name + chat_type so the client can render
    a group avatar/title from the chat object it already has.
    """
    if chat_type == "private":
        return {
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
        }
    chat = await db.get(Chat, chat_id)
    return {
        "id": chat_id,
        "name": chat.name if chat else f"chat_{chat_id}",
        "chat_type": chat.chat_type if chat else "group",
        "recipient_id": None,
        "recipient": None,
    }


async def publish_chat_event(payload: dict) -> None:
    """Publish a chat lifecycle event (group created / member left / deleted).

    Listener side iterates payload['member_ids'] and pushes the event to every
    online socket of each member, so their chat list can update without a
    refresh.
    """
    redis = get_redis()
    await redis.publish(REDIS_CHAT_CHANNEL + ":chat_events", json.dumps(payload))


async def publish_read_receipt(
    db: AsyncSession,
    chat_id: int,
    reader_id: int,
    up_to_message_id: int,
) -> None:
    """Fan out a messages_read event so the sender's client can flip the
    read indicator without a refresh.

    Private chats: only emit if the reciprocity rule allows it.
    Group chats: MVP suppresses read receipts entirely — the receipt model
    in groups is "seen by N of M" which is a separate iteration.
    """
    chat = await db.get(Chat, chat_id)
    if not chat or chat.chat_type == "group":
        return
    other = await ChatCRUD.get_other_user_by_chat_id(db, chat_id, reader_id)
    if not other:
        return
    redis = get_redis()
    if not await should_expose_read_receipts(redis, db, reader_id, other.user_id):
        return
    payload = json.dumps({
        "type": "messages_read",
        "chat_id": chat_id,
        "up_to_message_id": up_to_message_id,
        "read_at": datetime.now(timezone.utc).isoformat(),
        "reader_id": reader_id,
    })
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
        recipient_id: int | None,
        sender_id: int,
        db: AsyncSession,
        reply_to_id: int | None = None,
        chat_type: str = "private",
        storage=None,
    ) -> int:
        """Persist + fan out a text message.

        ``recipient_id`` is the single counterpart for private chats. For
        groups it must be None — fan-out resolves the member list from the
        chat itself. ``chat_type`` is used to pick the right code path.
        """
        message = await MessageCRUD.create_text_message(
            db=db,
            chat_id=chat_id,
            sender_id=sender_id,
            recipient_id=recipient_id,
            text=text,
            reply_to_id=reply_to_id,
            redis=get_redis(),
        )
        from sqlalchemy.orm import selectinload as _selectinload
        sender = await db.get(User, sender_id, options=[_selectinload(User.profile)])
        sender_display_name = sender.profile.display_name if sender.profile else None
        sender_avatar_url = await _resolve_sender_avatar_url(storage, sender.profile if sender else None)
        reply_to_text = None
        reply_to_msg_type = None
        if message.reply_to_id:
            from messenger.backend.core.crypto import decrypt_message as _decrypt
            reply_msg = await db.get(Message, message.reply_to_id)
            if reply_msg:
                try:
                    reply_to_text = _decrypt(reply_msg.encrypted_data)
                except Exception:  # noqa: BLE001
                    pass
                reply_to_msg_type = reply_msg.msg_type

        redis = get_redis()
        recipient_ids = await _resolve_recipient_ids(db, redis, chat_id, sender_id, chat_type, recipient_id)
        chat_info = await _build_chat_info(db, chat_id, sender_id, recipient_id, chat_type, sender, sender_display_name)

        payload = json.dumps({
            "recipient_id": recipient_id,
            "recipient_ids": recipient_ids,
            "encrypted_text": message.encrypted_data,
            "sender_id": sender_id,
            "sender_display_name": sender_display_name,
            "sender_avatar_url": sender_avatar_url,
            "chat_id": chat_id,
            "chat_type": chat_type,
            "created_at": _utc_iso(message.created_at),
            "message_id": message.id,
            "reply_to_id": message.reply_to_id,
            "reply_to_text": reply_to_text,
            "reply_to_msg_type": reply_to_msg_type,
            "chat_info": chat_info,
        })
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
                encrypted_text = data.get("encrypted_text")
                sender_id = data.get("sender_id")
                chat_id = data.get("chat_id")
                chat_info = data.get("chat_info")
                sender_display_name = data.get("sender_display_name")
                message_id = data.get("message_id")
                # New payloads include `recipient_ids` (list). Old single-
                # recipient payloads (or anything from before this migration)
                # fall back to wrapping `recipient_id` in a 1-element list so
                # the dispatch path is uniform.
                recipient_ids = data.get("recipient_ids")
                if recipient_ids is None:
                    rid = data.get("recipient_id")
                    recipient_ids = [rid] if rid is not None else []

                try:
                    decrypted_text = decrypt_message(encrypted_text)
                except Exception:  # noqa: BLE001
                    continue

                online_recipients = []
                offline_recipients = []
                for recipient_id in recipient_ids:
                    if self.active_connections.get(recipient_id):
                        online_recipients.append(recipient_id)
                    else:
                        offline_recipients.append(recipient_id)

                # Offline recipients: gate + push in a single shared session.
                await self._fanout_offline_pushes(
                    recipient_ids=offline_recipients,
                    chat_id=chat_id,
                    message_id=message_id,
                    chat_info=chat_info,
                    sender_id=sender_id,
                    sender_display_name=sender_display_name,
                    decrypted_text=decrypted_text,
                )

                # Online recipients: deliver over their live sockets.
                for recipient_id in online_recipients:
                    sockets = self.active_connections.get(recipient_id, set())
                    if not sockets:
                        continue
                    payload = {
                        "text": decrypted_text,
                        "sender_id": sender_id,
                        "sender_display_name": sender_display_name,
                        "sender_avatar_url": data.get("sender_avatar_url"),
                        "recipient_id": recipient_id,
                        "chat_id": chat_id,
                        "chat_type": data.get("chat_type", "private"),
                        "chat_info": chat_info,
                        "created_at": data.get("created_at"),
                        "message_id": data.get("message_id"),
                        "reply_to_id": data.get("reply_to_id"),
                        "reply_to_text": data.get("reply_to_text"),
                        "reply_to_msg_type": data.get("reply_to_msg_type"),
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

    async def chat_events_listener(self) -> None:
        """Fan out chat lifecycle events (group_created / member_left / deleted)
        to the members listed in payload['member_ids']."""
        redis = get_redis()
        pubsub = redis.pubsub()
        channel = REDIS_CHAT_CHANNEL + ":chat_events"
        await pubsub.subscribe(channel)

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = json.loads(message["data"])
                member_ids = data.get("member_ids") or []
                for uid in member_ids:
                    sockets = self.active_connections.get(uid)
                    if not sockets:
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

    async def reactions_listener(self) -> None:
        """Listen for reaction_update events and fan out to live sockets.

        Like edits/deletions: broadcast to all local sockets; clients apply the
        update only to a message they have loaded (and ignore the rest).
        """
        redis = get_redis()
        pubsub = redis.pubsub()
        channel = REDIS_CHAT_CHANNEL + ":reactions"
        await pubsub.subscribe(channel)

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = json.loads(message["data"])
                if data.get("type") != "reaction_update":
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

    async def _fanout_offline_pushes(
        self,
        recipient_ids: list[int],
        chat_id: int,
        chat_info: dict | None,
        sender_id: int | None,
        sender_display_name: str | None,
        decrypted_text: str | None,
        message_id: int | None = None,
    ) -> None:
        """Отправить пуши всем офлайн-получателям сообщения в ОДНОЙ сессии.

        Сессия открывается один раз на сообщение и переиспользуется в
        _should_push для всех получателей (батчинг). Сам пуш — fire-and-forget
        задача со своей короткоживущей сессией.
        """
        offline = [rid for rid in recipient_ids if not self.active_connections.get(rid)]
        if not offline:
            return
        from messenger.backend.app.ws.presence import is_present
        redis = get_redis()
        async with AsyncSessionLocal() as db:
            for recipient_id in offline:
                # `active_connections` is per-worker; with several uvicorn workers
                # a user connected to ANOTHER worker looks "offline" here. Redis
                # presence is cross-worker — if they're online anywhere, their live
                # socket already shows an in-app notification, so a push would be a
                # duplicate of it.
                if await is_present(redis, recipient_id):
                    continue
                if not await self._should_push(recipient_id, chat_id, db=db):
                    continue
                # Every worker's pubsub listener runs this fan-out, so a truly
                # offline user would otherwise be pushed once per worker. The first
                # worker to claim the (message, recipient) key sends; the rest skip.
                if message_id is not None and not await redis.set(
                    f"push:dedup:{message_id}:{recipient_id}", "1", nx=True, ex=120,
                ):
                    continue
                chat_type = (chat_info or {}).get("chat_type", "private")
                if chat_type == "channel":
                    title = f"📣 {(chat_info or {}).get('name') or 'WSNox'}"
                elif chat_type == "group":
                    group_name = (chat_info or {}).get("name", "")
                    title = f"{sender_display_name or 'Кто-то'} в {group_name}" if group_name else f"Новое сообщение от {sender_display_name or 'участника'}"
                else:
                    sender_name = ((chat_info or {}).get("recipient") or {}).get("name", "")
                    title = f"Новое сообщение от {sender_name}" if sender_name else "Новое сообщение"
                asyncio.create_task(send_push_to_user(recipient_id, {
                    "title": title,
                    "body": decrypted_text[:80] if decrypted_text else "Нажмите, чтобы открыть чат",
                    "chat_id": chat_id,
                    "sender_id": sender_id,
                }))

    async def _should_push(
        self, recipient_id: int, chat_id: int, db: AsyncSession | None = None
    ) -> bool:
        """Apply notification preferences before sending a push.

        Returns False when push should be suppressed: user has the chat
        currently open (within grace window), user has DND on, or the chat
        is muted.

        viewing: Redis-проверка идёт первой как самый дешёвый short-circuit.
        DND и muted читаются через read-through кэш (fail-open в loader).
        Если *db* передан — переиспользуем эту сессию (батчинг получателей),
        иначе открываем свою.
        """
        redis = get_redis()
        viewing = await get_viewing_chat(redis, recipient_id)
        if viewing is not None and viewing == chat_id:
            return False

        if db is not None:
            if await cached_get_dnd(redis, db, recipient_id):
                return False
            return chat_id not in await cached_muted_chat_ids(redis, db, recipient_id)

        async with AsyncSessionLocal() as session:
            if await cached_get_dnd(redis, session, recipient_id):
                return False
            return chat_id not in await cached_muted_chat_ids(redis, session, recipient_id)


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

    if user is None or user.is_banned:
        return None
    return user.id


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

    from messenger.backend.core.rate_limit import WS_RATE_LIMITS, ws_rate_ok

    try:
        await websocket.send_json({"type": "auth_ok", "user_id": user_id})

        while True:
            data = await websocket.receive_text()
            try:
                msg_data = json.loads(data)
            except json.JSONDecodeError:
                continue

            msg_type = msg_data.get("type")
            # Per-user, per-type rate cap — drop floods (one bot can't spam a chat).
            _ws_lim = WS_RATE_LIMITS.get(msg_type)
            if _ws_lim is not None and not await ws_rate_ok(redis, user_id, msg_type, _ws_lim):
                continue
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
                        if not await cached_is_chat_member(redis, db, read_chat_id, user_id):
                            continue
                        await MessageCRUD.mark_as_read_up_to(db, read_chat_id, user_id, last_message_id, redis=redis)
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
                        deleted = await MessageCRUD.delete_message(db, del_message_id, user_id, redis=redis)
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

            if msg_type == "react":
                react_message_id = msg_data.get("message_id")
                react_chat_id = msg_data.get("chat_id")
                react_type = msg_data.get("react_type")
                react_emoji = msg_data.get("emoji")
                if not (react_message_id and react_chat_id):
                    continue
                try:
                    react_message_id = int(react_message_id)
                    react_chat_id = int(react_chat_id)
                except (TypeError, ValueError):
                    continue
                if not ReactionCRUD.is_valid(react_type, react_emoji):
                    continue
                async with AsyncSessionLocal() as db:
                    # Reactions ARE allowed in read-only channels (audience
                    # engagement) — gated only by membership, not by posting
                    # rights. Channels auto-add every user, so members react.
                    if not await cached_is_chat_member(redis, db, react_chat_id, user_id):
                        continue
                    if await ReactionCRUD.chat_id_for_message(db, react_message_id) != react_chat_id:
                        continue
                    await ReactionCRUD.toggle(db, react_message_id, user_id, react_type, react_emoji)
                    summaries = await ReactionCRUD.summary_for_messages(
                        db, [react_message_id], user_id
                    )
                    await ReactionCRUD.attach_reactors(
                        db, summaries, getattr(websocket.app.state, "storage", None), redis
                    )
                    summary = summaries[react_message_id]
                react_payload = json.dumps({
                    "type": "reaction_update",
                    "chat_id": react_chat_id,
                    "message_id": react_message_id,
                    "emoji": summary["emoji"],
                    "aura": summary["aura"],
                    "emoji_reactors": summary.get("emoji_reactors", {}),
                    "aura_reactors": summary.get("aura_reactors", []),
                    "actor_id": user_id,
                    "actor_emoji": summary["my_emoji"],
                    "actor_aura": summary["my_aura"],
                })
                await redis.publish(REDIS_CHAT_CHANNEL + ":reactions", react_payload)
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
                # Kick a banned user off a still-open socket (cache is busted on
                # ban, so this reloads is_banned=True and drops them).
                _cu = await get_cached_user(redis, db, user_id)
                if _cu is None or _cu.is_banned:
                    await websocket.close(code=WS_AUTH_FAILED, reason="banned")
                    break
                if not await cached_is_chat_member(redis, db, chat_id, user_id):
                    continue
                chat = await db.get(Chat, chat_id)
                if chat is None:
                    continue
                # Channels are read-only over WS EXCEPT for the owner (user
                # channels). The official WSNox channel has no owner — its
                # members are role="member" — so it stays posting-via-admin only.
                if chat.chat_type == "channel":
                    if await ChatCRUD.get_member_role(db, chat_id, user_id) != "owner":
                        continue
                if chat.chat_type == "private":
                    other = await ChatCRUD.get_other_user_by_chat_id(db, chat_id, user_id)
                    if not other:
                        continue
                    recipient_id = other.user_id
                    # Blocked either way → silently drop (no delivery).
                    if await BlockCRUD.is_blocked_either(db, user_id, recipient_id):
                        continue
                else:
                    recipient_id = None
                message_id = await manager.send_personal_message(
                    chat_id=chat_id,
                    text=text,
                    recipient_id=recipient_id,
                    sender_id=user_id,
                    db=db,
                    reply_to_id=reply_to_id,
                    chat_type=chat.chat_type,
                    storage=getattr(websocket.app.state, "storage", None),
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
