from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from messenger.backend.db import Base


class RoleAuditLog(Base):
    """Append-only audit trail of role changes.

    Privacy-safe: records only RBAC actions (who changed whose role and when),
    never any message content or other private user data. Used to give the
    founder accountability over admin/role grants.
    """
    __tablename__ = "role_audit_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    actor_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    actor_email: Mapped[str] = mapped_column(String(255), nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    target_email: Mapped[str] = mapped_column(String(255), nullable=False)
    old_role: Mapped[str] = mapped_column(String(20), nullable=False)
    new_role: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )

    def __repr__(self) -> str:
        return f"<RoleAuditLog {self.actor_id}->{self.target_id} {self.old_role}->{self.new_role}>"
