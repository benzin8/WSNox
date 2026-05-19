from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from messenger.backend.db import Base
from messenger.backend.models.user import User


class Profile(Base):
    __tablename__ = "profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(100))
    bio: Mapped[str] = mapped_column(Text)
    presence_preference: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    profile_photos: Mapped[list] = mapped_column(JSON, default=list)

    user: Mapped["User"] = relationship(back_populates="profile")
