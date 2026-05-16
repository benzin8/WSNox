from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MessageBase(BaseModel):
    chat_id: int
    sender_id: int
    recipient_id: int
    text: str
    is_read: bool
    created_at: datetime
    msg_type: str

class MessageCreate(MessageBase):
    pass

class MessageResponse(MessageBase):
    model_config = ConfigDict(from_attributes=True)

    