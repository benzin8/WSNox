from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from ..db.base import Base

from sqlalchemy import  String, DateTime
from sqlalchemy.orm import relationship, Mapped, mapped_column

if TYPE_CHECKING:
    from .message import Message
    from .profile import Profile

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False)
    sent_messages: Mapped[list["Message"]] = relationship(back_populates="sender")