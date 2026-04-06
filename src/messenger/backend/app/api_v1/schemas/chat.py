from redis import UsernamePasswordCredentialProvider
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from messenger.backend.app.api_v1.schemas.user import UserResponse

class ChatResponse(BaseModel):
    id: int
    name: str
    chat_type: str
    last_message: Optional[str] = None
    last_message_time: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class UserSearchResponse(BaseModel):
    chats: List[UserResponse]
    
class ChatCreateRequest(BaseModel):
    other_user_id: int

