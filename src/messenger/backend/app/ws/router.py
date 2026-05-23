import asyncio
import json
from typing import Dict

from fastapi import APIRouter, WebSocket
from fastapi.websockets import WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_user_from_token
from messenger.backend.app.crud.chat import ChatCRUD
from messenger.backend.app.crud.message import MessageCRUD
from messenger.backend.app.ws.push import send_push_to_user
from messenger.backend.core.crypto import decrypt_message
from messenger.backend.core.redis import get_redis
from messenger.backend.db.session import AsyncSessionLocal
from messenger.backend.models.user import User

REDIS_CHAT_CHANNEL = "chat_messages"
AUTH_TIMEOUT_SECONDS = 10

# WebSocket close codes
WS_AUTH_FAILED = 4401  # custom 4xxx code, equivalent to HTTP 401


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
    ) -> None:
        message = await MessageCRUD.create_text_message(
            db=db,
            chat_id=chat_id,
            sender_id=sender_id,
            recipient_id=recipient_id,
            text=text,
        )
        sender = await db.get(User, sender_id)
        payload = json.dumps({
            "recipient_id": recipient_id,
            "encrypted_text": message.encrypted_data,
            "sender_id": sender_id,
            "chat_id": chat_id,
            "chat_info": {
                "id": chat_id,
                "name": f"private_{min(sender_id, recipient_id)}_{max(sender_id, recipient_id)}",
                "chat_type": "private",
                "recipient_id": sender_id,
                "recipient": {
                    "id": sender.id,
                    "name": sender.name,
                    "username": sender.username,
                },
            },
        })
        redis = get_redis()
        await redis.publish(REDIS_CHAT_CHANNEL, payload)

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
                    # No active WebSocket — send push notification
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

            chat_id = msg_data.get("chat_id")
            text = msg_data.get("text")
            if not (chat_id and text):
                continue

            async with AsyncSessionLocal() as db:
                if not await ChatCRUD.is_chat_member(db, chat_id, user_id):
                    continue
                other = await ChatCRUD.get_other_user_by_chat_id(db, chat_id, user_id)
                if not other:
                    continue
                await manager.send_personal_message(
                    chat_id=chat_id,
                    text=text,
                    recipient_id=other.user_id,
                    sender_id=user_id,
                    db=db,
                )

    except WebSocketDisconnect:
        pass
    finally:
        last_socket = await manager.disconnect(websocket, user_id)
        if last_socket:
            await clear_presence(redis, user_id)
            await publish_presence_event(redis, user_id, online=False)
