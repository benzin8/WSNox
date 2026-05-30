from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from messenger.backend.db import Base
from messenger.backend.models.user import User


class Profile(Base):
    __tablename__ = "profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(100))
    bio: Mapped[str] = mapped_column(Text)
    presence_preference: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    notification_dnd: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    read_receipts_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    avatar: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    user: Mapped["User"] = relationship(back_populates="profile")
