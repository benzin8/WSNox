"""Founder dashboard endpoints. Gated by `users.is_admin`."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import (
    get_current_admin,
    get_current_user,
)
from messenger.backend.app.api_v1.schemas.admin import (
    AdminMeResponse,
    DashboardStats,
    KpisBlock,
    LiveBlock,
)
from messenger.backend.core.redis import get_redis
from messenger.backend.db import get_db_session
from messenger.backend.models.user import User
from messenger.backend.services import analytics

admin_router = APIRouter(prefix="/api/admin", tags=["admin"])


@admin_router.get("/me", response_model=AdminMeResponse)
async def admin_me(current_user: User = Depends(get_current_user)) -> AdminMeResponse:
    """Лёгкий ping: показывать ли UI кнопку «Дашборд». Доступно любому залогиненному."""
    return AdminMeResponse(is_admin=current_user.is_admin)


@admin_router.get("/stats", response_model=DashboardStats)
async def admin_stats(
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db_session),
) -> DashboardStats:
    """Полный пакет 90-дневной аналитики. Фронт сам режет на 7/30."""
    redis = get_redis()
    return DashboardStats(
        regs=await analytics.reg_series(session),
        msgs=await analytics.msg_series(session),
        dau=await analytics.dau_series(session),
        labels=analytics.labels_series(),
        kpis=KpisBlock(
            users=await analytics.kpi_users(session),
            msgs=await analytics.kpi_msgs(session),
            dau=await analytics.kpi_dau(session),
        ),
        live=LiveBlock(
            online=await analytics.live_online(redis),
            msgs_per_min=await analytics.live_msgs_per_min(session),
        ),
    )
