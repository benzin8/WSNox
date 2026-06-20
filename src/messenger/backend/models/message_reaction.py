from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from messenger.backend.db import Base


class MessageReaction(Base):
    """A single user's reaction to a message.

    Two independent kinds per (message, user), enforced by the unique
    constraint on (message_id, user_id, reaction_type):
      - reaction_type="emoji": `emoji` holds the chosen emoji (one per user;
        switching = UPDATE, removing = DELETE).
      - reaction_type="aura": the "energy boost" — one charge per user; `emoji`
        is NULL and the row's mere presence is the boost.
    """

    __tablename__ = "message_reactions"
    __table_args__ = (
        UniqueConstraint(
            "message_id", "user_id", "reaction_type", name="uq_reaction_per_user_type"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    message_id: Mapped[int] = mapped_column(
        ForeignKey("message.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    reaction_type: Mapped[str] = mapped_column(String(8))  # "emoji" | "aura"
    emoji: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
