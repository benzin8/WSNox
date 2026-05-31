"""Pydantic-схемы для /api/admin/*."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AdminMeResponse(BaseModel):
    is_admin: bool


class AdminUserRow(BaseModel):
    id: int
    name: str
    email: str
    username: str
    is_admin: bool
    created_at: datetime | None
    last_seen: datetime | None


class AdminSetRoleRequest(BaseModel):
    is_admin: bool
    confirm_email: str  # должен совпасть с email целевого юзера


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
    ws_connections: None = None
    latency_p50: None = None
    latency_p95: None = None


class DashboardStats(BaseModel):
    regs: list[int]
    msgs: list[int]
    dau: list[int]
    labels: list[str]
    kpis: KpisBlock
    live: LiveBlock
    # placeholder-секции
    funnel: list[Any] | None = None
    problems_by_severity: list[Any] | None = None
    geo: list[Any] | None = None
    feed: list[Any] | None = None
    retention: dict[str, Any] | None = None
    details: dict[str, Any] | None = None
