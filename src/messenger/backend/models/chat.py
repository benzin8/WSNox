from datetime import datetime, timezone
from typing import TYPE_CHECKING
from messenger.backend.db import Base

from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column

if TYPE_CHECKING:
    from .message import Message
    
class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_type: Mapped[str] = mapped_column(String(20), default="private")
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    members:Mapped[list["ChatMember"]] = relationship(back_populates="chat", cascade="all, delete-orphan")
    messages:Mapped[list["Message"]] = relationship(back_populates="chat", cascade="all, delete-orphan")

class ChatMember(Base):

    __tablename__ = "chat_members"

    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(20), default="member")
    joined_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    chat:Mapped["Chat"] = relationship(back_populates="members")