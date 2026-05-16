from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

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
    
    class Config:
        from_attributes = True

class UserSearchResponse(BaseModel):
    chats: List[UserResponse]
    
class ChatCreateRequest(BaseModel):
    other_user_id: int

