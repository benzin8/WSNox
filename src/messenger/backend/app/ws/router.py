from fastapi import WebSocket, APIRouter
from fastapi.websockets import WebSocketDisconnect
from typing import Dict
import json

class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int) -> None:
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: int) -> None:
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_message(self, message: str, sender_id: int) -> None:
        for uid, connection in self.active_connections.items():
            if uid != sender_id:
                await connection.send_text(message)
    
    async def send_personal_message(self,
                                    message: str,
                                    recipient_id: int) -> None:
        if recipient_id in self.active_connections:
            try:
                await self.active_connections[recipient_id].send_text(message)
            except Exception:
                del self.active_connections[recipient_id]
        else:
            print(f"Пользователь {recipient_id} не в сети!")

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
            text = msg_data["message"]

            await manager.send_personal_message(
                text,
                recipient_id
            )

    except WebSocketDisconnect:
        manager.disconnect(int(user_id))
