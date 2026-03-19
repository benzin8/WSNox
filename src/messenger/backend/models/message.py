from datetime import datetime, timezone
from typing import TYPE_CHECKING
from src.messenger.backend.db import Base

from sqlalchemy import Text, String, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship, Mapped, mapped_column

if TYPE_CHECKING:
    from .user import User
    from .chat import Chat

class Message(Base):
    __tablename__ = "message"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    encrypted_data: Mapped[str] = mapped_column(Text, nullable=False)

    msg_type: Mapped[str] = mapped_column(String(15), default="text")

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc), index=True)
    is_read: Mapped[bool] = mapped_column(default=False)

    chat: Mapped["Chat"] = relationship(back_populates="messages")
    sender: Mapped["User"] = relationship(back_populates="sent_messages")