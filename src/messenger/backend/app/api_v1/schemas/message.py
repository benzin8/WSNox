from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_serializer


def _utc_iso(value: Optional[datetime]) -> Optional[str]:
    """Serialize a datetime as ISO 8601 with explicit UTC marker.

    Postgres `timestamp without time zone` columns return naive datetimes
    that pydantic emits without any TZ designator (e.g. "2026-05-25T11:00:00").
    JavaScript then parses those as LOCAL time and the displayed time shifts
    by the user's UTC offset. We always store UTC, so we tag naive values
    as UTC and serialize with `Z` so the client parses unambiguously.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


class MessageBase(BaseModel):
    chat_id: int
    sender_id: int
    # NULL for group-chat messages — there is no single recipient.
    recipient_id: Optional[int] = None
    text: str
    is_read: bool
    created_at: datetime
    msg_type: str
    read_at: Optional[datetime] = None
    edited_at: Optional[datetime] = None
    reply_to_id: Optional[int] = None
    reply_to_text: Optional[str] = None
    reply_to_msg_type: Optional[str] = None
    # Attachment fields — None for plain text messages. URLs are presigned at
    # read-time (TTL 1h); clients should refresh by re-fetching messages.
    attachment_url: Optional[str] = None
    attachment_thumb_url: Optional[str] = None
    attachment_meta: Optional[dict] = None
    # Sender display info — populated by the server for group chats so the
    # client can render the author label/avatar next to incoming bubbles
    # without an extra round-trip. NULL on private chats (the client already
    # knows the counterpart) and when the sender has no profile/avatar.
    sender_display_name: Optional[str] = None
    sender_avatar_url: Optional[str] = None
    # Reaction summary: {emoji: {emoji: count}, aura: count, my_emoji, my_aura}.
    # Populated per-message by the messages endpoint for the requesting viewer.
    reactions: Optional[dict] = None

    @field_serializer("created_at", "read_at", "edited_at", when_used="json")
    def _serialize_dt(self, value: Optional[datetime]) -> Optional[str]:
        return _utc_iso(value)

class MessageCreate(MessageBase):
    pass

class MessageResponse(MessageBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class MessagePage(BaseModel):
    """A page of messages with an opaque cursor for "load more" (id-based)."""
    items: list[MessageResponse]
    next_before_id: Optional[int] = None
