from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_serializer

from messenger.backend.app.api_v1.schemas.message import _utc_iso
from messenger.backend.app.api_v1.schemas.user import UserResponse


class ChatResponse(BaseModel):
    id: int
    name: str
    chat_type: str
    last_message: Optional[str] = None
    last_message_time: Optional[datetime] = None
    updated_at: datetime | None = None
    recipient_id: Optional[int] = None
    recipient: Optional[UserResponse] = None
    unread_count: int = 0

    class Config:
        from_attributes = True

    @field_serializer("last_message_time", "updated_at", when_used="json")
    def _serialize_dt(self, value: Optional[datetime]) -> Optional[str]:
        return _utc_iso(value)

class UserSearchResponse(BaseModel):
    chats: List[UserResponse]

class ChatCreateRequest(BaseModel):
    other_user_id: int

