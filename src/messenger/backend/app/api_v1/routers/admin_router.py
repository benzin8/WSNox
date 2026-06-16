"""Founder dashboard endpoints. Gated by `users.is_admin`."""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from messenger.backend.app.api_v1.auth.dependencies import (
    get_current_admin,
    get_current_user,
)
from messenger.backend.app.api_v1.schemas.admin import (
    AdminMeResponse,
    AdminSetRoleRequest,
    AdminUserRow,
    DashboardStats,
    KpisBlock,
    LiveBlock,
)
from messenger.backend.core.cache import invalidate, user_auth
from messenger.backend.core.redis import get_redis
from messenger.backend.db import get_db_session
from messenger.backend.models.user import User
from messenger.backend.services import analytics
from messenger.backend.services.avatar_urls import resolve_avatar_urls
from messenger.backend.services.deps import get_storage_optional
from messenger.backend.services.storage import S3Storage

logger = logging.getLogger(__name__)

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


@admin_router.get("/live", response_model=LiveBlock)
async def admin_live(
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db_session),
) -> LiveBlock:
    """Лёгкий polling-endpoint для live-секции (online + msgs/min).

    Отделён от /stats чтобы клиент мог дёргать его каждые 10s без перерасчёта
    тяжёлых 90-дневных агрегатов.
    """
    redis = get_redis()
    return LiveBlock(
        online=await analytics.live_online(redis),
        msgs_per_min=await analytics.live_msgs_per_min(session),
    )


@admin_router.get("/users", response_model=list[AdminUserRow])
async def admin_list_users(
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
) -> list[AdminUserRow]:
    """Список всех юзеров для admin-панели (с presigned avatar thumb URLs)."""
    stmt = select(User).options(selectinload(User.profile)).order_by(User.created_at.desc())
    result = await session.execute(stmt)
    users = result.scalars().all()
    rows: list[AdminUserRow] = []
    for u in users:
        avatar = u.profile.avatar if u.profile else None
        urls = await resolve_avatar_urls(storage, avatar)
        rows.append(AdminUserRow(
            id=u.id, name=u.name, email=u.email, username=u.username,
            is_admin=u.is_admin, created_at=u.created_at, last_seen=u.last_seen,
            avatar_thumb_url=urls.thumb,
        ))
    return rows


@admin_router.patch("/users/{user_id}/admin", response_model=AdminUserRow)
async def admin_set_role(
    user_id: int,
    payload: AdminSetRoleRequest,
    current_admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminUserRow:
    """Выдать или снять `is_admin`. Требует подтверждения email цели.

    Защиты:
    - confirm_email должен exact match с user.email
    - запрещено снимать админку с себя (защита от lock-out)
    """
    if user_id == current_admin.id and not payload.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя снять админку с самого себя",
        )

    result = await session.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Юзер не найден")

    if payload.confirm_email.strip().lower() != target.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email подтверждения не совпадает с email юзера",
        )

    if target.is_admin == payload.is_admin:
        # no-op, но возвращаем актуальную строку — фронт переиспользует
        return AdminUserRow(
            id=target.id, name=target.name, email=target.email, username=target.username,
            is_admin=target.is_admin, created_at=target.created_at, last_seen=target.last_seen,
        )

    target.is_admin = payload.is_admin
    await session.commit()
    await session.refresh(target)
    await invalidate(get_redis(), user_auth(target.id))

    action = "granted" if payload.is_admin else "revoked"
    logger.warning(
        "admin role %s: by=%s(%s) target=%s(%s)",
        action, current_admin.id, current_admin.email,
        target.id, target.email,
    )

    return AdminUserRow(
        id=target.id, name=target.name, email=target.email, username=target.username,
        is_admin=target.is_admin, created_at=target.created_at, last_seen=target.last_seen,
    )
