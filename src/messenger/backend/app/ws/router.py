from fastapi import WebSocket, APIRouter
from fastapi.websockets import WebSocketDisconnect
from typing import Dict
import json
import asyncio

from messenger.backend.core.redis import get_redis
from messenger.backend.core.crypto import encrypt_message, decrypt_message

REDIS_CHAT_CHANNEL = "chat_messages"

class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int) -> None:
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: int) -> None:
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: str, recipient_id: int, sender_id: int) -> None:
        encrypted_message = encrypt_message(message)
        redis = get_redis()
        payload = json.dumps({
            "recipient_id": recipient_id,
            "message": encrypted_message,
            "sender_id": sender_id
        })
        print(payload)
        await redis.publish(REDIS_CHAT_CHANNEL, payload)

    async def pubsub_listener(self) -> None:
        redis = get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(REDIS_CHAT_CHANNEL)
        
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    recipient_id = data.get("recipient_id")
                    text_message = data.get("message")
                    sender_id = data.get("sender_id")
                    
                    if recipient_id in self.active_connections:
                        try:
                            decrypted_text = decrypt_message(text_message)
                            payload = {
                                "message": decrypted_text,
                                "sender_id": sender_id,
                                "recipient_id": recipient_id,
                            }
                            await self.active_connections[recipient_id].send_json(payload)
                        except Exception:
                            # if socket is dead, remove it
                            del self.active_connections[recipient_id]
        except asyncio.CancelledError:
            await pubsub.unsubscribe(REDIS_CHAT_CHANNEL)

manager = ConnectionManager()
ws_router = APIRouter()

@ws_router.websocket("/chat/{user_id}")
async def websocket_chat(websocket: WebSocket, user_id: int) -> None:
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            msg_data = json.loads(data)
            recipient_id = msg_data.get('recipient_id')
            text = msg_data.get("message")

            if recipient_id and text:
                await manager.send_personal_message(text, recipient_id, user_id)


    except WebSocketDisconnect:
        manager.disconnect(int(user_id))
