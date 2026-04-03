from redis import UsernamePasswordCredentialProvider
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from messenger.backend.app.api_v1.schemas.user import UserResponse

class ChatResponse(BaseModel):
    id: int
    name: str
    last_message: Optional[str]
    last_message_time: Optional[datetime]
    
    class Config:
        from_attributes = True

class UserSearchResponse(BaseModel):
    chats: List[UserResponse]
    
class ChatCreateRequest(BaseModel):
    user_id: int
    other_user_id: int

