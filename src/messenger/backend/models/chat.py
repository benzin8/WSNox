from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from messenger.backend.db import Base

if TYPE_CHECKING:
    from .message import Message

class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_type: Mapped[str] = mapped_column(String(20), default="private")
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # User channels only: optional blurb + a unique join token for invite links.
    description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True, default=None)
    invite_token: Mapped[Optional[str]] = mapped_column(String(32), unique=True, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    members:Mapped[list["ChatMember"]] = relationship(back_populates="chat", cascade="all, delete-orphan")
    messages:Mapped[list["Message"]] = relationship(back_populates="chat", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Chat {self.id} {self.chat_type} {self.name}>"

class ChatMember(Base):
    __tablename__ = "chat_members"

    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(20), default="member")
    joined_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    chat:Mapped["Chat"] = relationship(back_populates="members")

    def __repr__(self):
        return f"<ChatMember {self.chat_id} {self.user_id} {self.role}>"