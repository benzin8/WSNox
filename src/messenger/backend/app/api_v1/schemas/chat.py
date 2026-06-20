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
    # For private chats: the "other" user. NULL for group chats.
    recipient_id: Optional[int] = None
    recipient: Optional[UserResponse] = None
    # For group chats — surface enough for the list to render avatar/preview.
    member_count: Optional[int] = None
    last_sender_id: Optional[int] = None
    last_sender_display_name: Optional[str] = None
    unread_count: int = 0
    # Channels only: blurb, whether the viewer owns it (can post / sees the
    # invite link), and the invite token (exposed to the owner only).
    description: Optional[str] = None
    is_owner: bool = False
    is_official: bool = False
    invite_token: Optional[str] = None

    class Config:
        from_attributes = True

    @field_serializer("last_message_time", "updated_at", when_used="json")
    def _serialize_dt(self, value: Optional[datetime]) -> Optional[str]:
        return _utc_iso(value)


class UserSearchResponse(BaseModel):
    chats: List[UserResponse]
    channels: List[ChatResponse] = []


class ChannelCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None


class ChatCreateRequest(BaseModel):
    other_user_id: int


class GroupChatCreateRequest(BaseModel):
    name: str
    member_ids: List[int]


class ChatMemberResponse(BaseModel):
    user_id: int
    role: str
    username: str
    display_name: Optional[str] = None
    avatar: Optional[str] = None

    class Config:
        from_attributes = True


class GroupChatMembersResponse(BaseModel):
    chat_id: int
    members: List[ChatMemberResponse]


class GroupAddMembersRequest(BaseModel):
    member_ids: List[int]

