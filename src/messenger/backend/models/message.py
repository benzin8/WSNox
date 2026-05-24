from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from messenger.backend.db import Base

if TYPE_CHECKING:
    from .chat import Chat
    from .user import User

class Message(Base):
    __tablename__ = "message"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    encrypted_data: Mapped[str] = mapped_column(Text, nullable=False)
    reply_to_id: Mapped[Optional[int]] = mapped_column(ForeignKey("message.id"), nullable=True, default=None)

    msg_type: Mapped[str] = mapped_column(String(15), default="text")

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc), index=True)
    is_read: Mapped[bool] = mapped_column(default=False)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)

    chat: Mapped["Chat"] = relationship(
        "Chat",
        back_populates="messages"
        )
    sender: Mapped["User"] = relationship(
        "User",
        back_populates="sent_messages",
        foreign_keys="Message.sender_id"
        )
    recipient: Mapped["User"] = relationship(
        "User",
        back_populates="received_messages",
        foreign_keys="Message.recipient_id"
        )