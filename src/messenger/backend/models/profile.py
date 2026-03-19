from src.messenger.backend.db import Base
from src.messenger.backend.models.user import User
from sqlalchemy import Text, String, JSON, ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column

class Profile(Base):
    __tablename__ = "profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(100))
    bio: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="Offline")
    profile_photos: Mapped[list] = mapped_column(JSON, default=list)

    user: Mapped["User"] = relationship(back_populates="profile")