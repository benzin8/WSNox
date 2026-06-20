"""Founder dashboard endpoints. Gated by `users.is_admin`."""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from messenger.backend.app.api_v1.auth.dependencies import (
    get_current_user,
    require_permission,
)
from messenger.backend.app.api_v1.schemas.admin import (
    AdminMeResponse,
    AdminSetRoleRequest,
    AdminUserRow,
    AnnouncementRequest,
    AnnouncementResponse,
    DashboardStats,
    KpisBlock,
    LiveBlock,
    RoleAuditEntry,
)
from messenger.backend.core.cache import invalidate, user_auth
from messenger.backend.core.permissions import (
    ALL_ROLES,
    PERM_MANAGE_ROLES,
    PERM_MANAGE_USERS,
    PERM_POST_ANNOUNCEMENTS,
    PERM_VIEW_DASHBOARD,
    can_assign_role,
    is_admin_role,
    normalize_role,
    permissions_for,
)
from messenger.backend.core.redis import get_redis
from messenger.backend.db import get_db_session
from messenger.backend.models.role_audit import RoleAuditLog
from messenger.backend.models.user import User
from messenger.backend.services import analytics
from messenger.backend.services.avatar_urls import resolve_avatar_urls
from messenger.backend.services.deps import get_storage_optional
from messenger.backend.services.storage import S3Storage

logger = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/api/admin", tags=["admin"])


def _ws_connection_count() -> int:
    """Live count of open WebSocket sockets across all connected users."""
    try:
        from messenger.backend.app.ws.router import manager
        return sum(len(socks) for socks in manager.active_connections.values())
    except Exception:  # noqa: BLE001
        return 0


@admin_router.get("/me", response_model=AdminMeResponse)
async def admin_me(current_user: User = Depends(get_current_user)) -> AdminMeResponse:
    """Лёгкий ping: роль и права текущего юзера. Доступно любому залогиненному."""
    return AdminMeResponse(
        is_admin=current_user.is_admin,
        role=current_user.role,
        permissions=permissions_for(current_user.role),
    )


@admin_router.get("/stats", response_model=DashboardStats)
async def admin_stats(
    _admin: User = Depends(require_permission(PERM_VIEW_DASHBOARD)),
    session: AsyncSession = Depends(get_db_session),
) -> DashboardStats:
    """Полный пакет 90-дневной аналитики. Фронт сам режет на 7/30."""
    redis = get_redis()
    from messenger.backend.services.admin_cache import (
        bucketed_utc_now,
        get_dashboard_stats_cached,
    )

    async def _build_stats() -> dict:
        now = bucketed_utc_now()
        return DashboardStats(
            regs=await analytics.reg_series(session, now=now),
            msgs=await analytics.msg_series(session, now=now),
            dau=await analytics.dau_series(session, now=now),
            labels=analytics.labels_series(now=now),
            kpis=KpisBlock(
                users=await analytics.kpi_users(session, now=now),
                msgs=await analytics.kpi_msgs(session, now=now),
                dau=await analytics.kpi_dau(session, now=now),
            ),
            funnel=await analytics.funnel(session, now=now),
            feed=await analytics.recent_signups(session),
            retention=await analytics.retention(session, now=now),
            breakdown=await analytics.breakdowns(session),
            health=await analytics.health(session, redis),
            # live считаем СВЕЖИМ (не из bucketed stats-кэша).
            live=LiveBlock(
                online=await analytics.live_online(redis),
                msgs_per_min=await analytics.live_msgs_per_min(session),
                ws_connections=_ws_connection_count(),
            ),
        ).model_dump(mode="json")

    data = await get_dashboard_stats_cached(redis, _build_stats)
    return DashboardStats.model_validate(data)


@admin_router.post("/announcements", response_model=AnnouncementResponse)
async def admin_post_announcement(
    payload: AnnouncementRequest,
    current_admin: User = Depends(require_permission(PERM_POST_ANNOUNCEMENTS)),
    session: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
) -> AnnouncementResponse:
    """Опубликовать сообщение в официальный канал WSNox (читают все юзеры).

    Канал — singleton (chat_type="channel"). Постить может только обладатель
    права post_announcements; для остальных канал read-only.
    """
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Пустое сообщение")

    from messenger.backend.app.ws.router import manager
    from messenger.backend.services.announcements import get_or_create_channel

    chat = await get_or_create_channel(session)
    await session.commit()

    message_id = await manager.send_personal_message(
        chat_id=chat.id,
        text=text,
        recipient_id=None,
        sender_id=current_admin.id,
        db=session,
        chat_type="channel",
        storage=storage,
    )
    logger.warning(
        "announcement posted by=%s(%s) chat=%s msg=%s",
        current_admin.id, current_admin.email, chat.id, message_id,
    )
    return AnnouncementResponse(chat_id=chat.id, message_id=message_id)


@admin_router.get("/live", response_model=LiveBlock)
async def admin_live(
    _admin: User = Depends(require_permission(PERM_VIEW_DASHBOARD)),
    session: AsyncSession = Depends(get_db_session),
) -> LiveBlock:
    """Лёгкий polling-endpoint для live-секции (online + msgs/min).

    Отделён от /stats чтобы клиент мог дёргать его каждые 10s без перерасчёта
    тяжёлых 90-дневных агрегатов.
    """
    redis = get_redis()
    from messenger.backend.services.admin_cache import get_live_block_cached

    async def _build_live() -> dict:
        return LiveBlock(
            online=await analytics.live_online(redis),
            msgs_per_min=await analytics.live_msgs_per_min(session),
            ws_connections=_ws_connection_count(),
        ).model_dump(mode="json")

    data = await get_live_block_cached(redis, _build_live)
    return LiveBlock.model_validate(data)


@admin_router.get("/audit", response_model=list[RoleAuditEntry])
async def admin_role_audit(
    _admin: User = Depends(require_permission(PERM_MANAGE_ROLES)),
    session: AsyncSession = Depends(get_db_session),
) -> list[RoleAuditEntry]:
    """Журнал изменений ролей (последние 100). Только метаданные RBAC-действий —
    никакого приватного контента пользователей."""
    rows = await session.execute(
        select(RoleAuditLog).order_by(RoleAuditLog.created_at.desc()).limit(100)
    )
    return [RoleAuditEntry.model_validate(r, from_attributes=True) for r in rows.scalars().all()]


def _user_row(u: User, avatar_thumb_url: str | None = None) -> AdminUserRow:
    return AdminUserRow(
        id=u.id, name=u.name, email=u.email, username=u.username,
        is_admin=u.is_admin, role=normalize_role(getattr(u, "role", None)),
        created_at=u.created_at, last_seen=u.last_seen,
        avatar_thumb_url=avatar_thumb_url,
    )


@admin_router.get("/users", response_model=list[AdminUserRow])
async def admin_list_users(
    _admin: User = Depends(require_permission(PERM_MANAGE_USERS)),
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
        urls = await resolve_avatar_urls(storage, avatar, redis=get_redis())
        rows.append(_user_row(u, urls.thumb))
    return rows


@admin_router.patch("/users/{user_id}/admin", response_model=AdminUserRow)
async def admin_set_role(
    user_id: int,
    payload: AdminSetRoleRequest,
    current_admin: User = Depends(require_permission(PERM_MANAGE_ROLES)),
    session: AsyncSession = Depends(get_db_session),
) -> AdminUserRow:
    """Изменить роль пользователя (user|moderator|admin|owner).

    Защиты:
    - confirm_email должен exact match с email цели;
    - нельзя менять собственную роль (защита от lock-out);
    - можно управлять только теми, кто строго ниже по рангу, и назначать роли
      строго ниже своей (admin не может трогать admin/owner; owner — других
      owner). См. core.permissions.can_assign_role.
    - is_admin синхронизируется с ролью (admin/owner -> True).
    """
    # Resolve the requested role (new `role` field, or legacy is_admin bool).
    new_role = payload.role
    if new_role is None and payload.is_admin is not None:
        new_role = "admin" if payload.is_admin else "user"
    if new_role is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Не указана роль")
    if new_role not in ALL_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неизвестная роль")

    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя менять собственную роль",
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

    target_role = normalize_role(getattr(target, "role", None))
    actor_role = normalize_role(getattr(current_admin, "role", None))

    if not can_assign_role(actor_role, target_role, new_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для назначения этой роли",
        )

    if target_role == new_role:
        return _user_row(target)  # no-op

    target.role = new_role
    target.is_admin = is_admin_role(new_role)
    session.add(RoleAuditLog(
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        target_id=target.id,
        target_email=target.email,
        old_role=target_role,
        new_role=new_role,
    ))
    await session.commit()
    await session.refresh(target)
    await invalidate(get_redis(), user_auth(target.id))

    logger.warning(
        "role change: %s -> %s by=%s(%s) target=%s(%s)",
        target_role, new_role, current_admin.id, current_admin.email,
        target.id, target.email,
    )

    return _user_row(target)
