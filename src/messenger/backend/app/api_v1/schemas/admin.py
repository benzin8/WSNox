"""Pydantic-схемы для /api/admin/*."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AdminMeResponse(BaseModel):
    is_admin: bool
    role: str = "user"
    permissions: list[str] = []


class AdminUserRow(BaseModel):
    id: int
    name: str
    email: str
    username: str
    is_admin: bool
    role: str = "user"
    created_at: datetime | None
    last_seen: datetime | None
    avatar_thumb_url: str | None = None


class AdminSetRoleRequest(BaseModel):
    confirm_email: str  # должен совпасть с email целевого юзера
    # Новое поле RBAC: user|moderator|admin|owner.
    role: str | None = None
    # Legacy: True -> admin, False -> user (для обратной совместимости).
    is_admin: bool | None = None


class RoleAuditEntry(BaseModel):
    id: int
    actor_id: int
    actor_email: str
    target_id: int
    target_email: str
    old_role: str
    new_role: str
    created_at: datetime


class AnnouncementRequest(BaseModel):
    text: str


class AnnouncementResponse(BaseModel):
    chat_id: int
    message_id: int


class StatItem(BaseModel):
    label: str
    value: str


class KpiUsersBlock(BaseModel):
    total: int
    deltas: dict[str, float]
    details: list[StatItem] | None = None


class KpiMsgsBlock(BaseModel):
    total: int
    deltas: dict[str, float]
    details: list[StatItem] | None = None


class KpiDauBlock(BaseModel):
    value: int
    mau: int
    stickiness: float
    deltas: dict[str, float]
    details: list[StatItem] | None = None


class KpisBlock(BaseModel):
    users: KpiUsersBlock
    msgs: KpiMsgsBlock
    dau: KpiDauBlock
    problems: None = None  # placeholder


class LiveBlock(BaseModel):
    online: int
    msgs_per_min: int
    ws_connections: int | None = None
    latency_p50: None = None
    latency_p95: None = None


class DashboardStats(BaseModel):
    regs: list[int]
    msgs: list[int]
    dau: list[int]
    labels: list[str]
    kpis: KpisBlock
    live: LiveBlock
    # wired analytics sections
    funnel: list[Any] | None = None
    feed: list[Any] | None = None
    retention: dict[str, Any] | None = None
    breakdown: dict[str, Any] | None = None
    health: dict[str, Any] | None = None
    # still placeholder (needs data we don't store)
    problems_by_severity: list[Any] | None = None
    geo: list[Any] | None = None
    details: dict[str, Any] | None = None
