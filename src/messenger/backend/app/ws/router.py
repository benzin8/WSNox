import asyncio
import json
from typing import Dict

from fastapi import APIRouter, WebSocket
from fastapi.websockets import WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_user_from_token
from messenger.backend.app.crud.chat import ChatCRUD
from messenger.backend.app.crud.message import MessageCRUD
from messenger.backend.core.crypto import decrypt_message
from messenger.backend.core.redis import get_redis
from messenger.backend.db.session import AsyncSessionLocal

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
        payload = json.dumps({
            "recipient_id": recipient_id,
            "encrypted_text": message.encrypted_data,
            "sender_id": sender_id,
            "chat_id": chat_id,
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

                sockets = self.active_connections.get(recipient_id, set())
                if not sockets:
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

    await manager.connect(websocket, user_id)
    try:
        await websocket.send_json({"type": "auth_ok", "user_id": user_id})

        while True:
            data = await websocket.receive_text()
            try:
                msg_data = json.loads(data)
            except json.JSONDecodeError:
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
        manager.disconnect(user_id)
