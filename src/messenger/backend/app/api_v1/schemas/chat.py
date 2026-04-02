from redis import UsernamePasswordCredentialProvider
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class ChatResponse(BaseModel):
    id: int
    name: str
    last_message: Optional[str]
    last_message_time: Optional[datetime]
    
    class Config:
        from_attributes = True

class UserSearchResponse(BaseModel):
    chats: List[ChatResponse]
    
class ChatCreateRequest(BaseModel):
    user_id: int
    other_user_id: int

