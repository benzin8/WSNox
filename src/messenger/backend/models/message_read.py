from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from messenger.backend.db import Base


class MessageRead(Base):
    """Per-user read receipt. One row per (message, reader)."""
    __tablename__ = "message_read"

    message_id: Mapped[int] = mapped_column(
        ForeignKey("message.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    read_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
