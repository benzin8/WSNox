from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from messenger.backend.db import Base

if TYPE_CHECKING:
    from .message import Message
    from .profile import Profile

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    phone_number: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False)
    sent_messages: Mapped[list["Message"]] = relationship(
        "Message",
        back_populates="sender",
        foreign_keys="Message.sender_id")
    received_messages: Mapped[list["Message"]] = relationship(
        "Message",
        back_populates="recipient",
        foreign_keys="Message.recipient_id")

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', name='{self.name}')>"
