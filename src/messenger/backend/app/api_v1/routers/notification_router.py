import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.api_v1.schemas.notification import (
    DndUpdate,
    MuteUpdate,
    NotificationPreferences,
    ReadReceiptsUpdate,
)
from messenger.backend.app.crud.chat import ChatCRUD, cached_is_chat_member
from messenger.backend.app.crud.notification import NotificationCRUD
from messenger.backend.app.ws.profile_events import PROFILE_EVENTS_CHANNEL
from messenger.backend.core.redis import get_redis
from messenger.backend.db import get_db_session
from messenger.backend.models.user import User

notification_router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


async def _build_prefs(db: AsyncSession, user_id: int) -> NotificationPreferences:
    return NotificationPreferences(
        dnd=await NotificationCRUD.get_dnd(db, user_id),
        muted_chats=await NotificationCRUD.list_muted_chat_ids(db, user_id),
        read_receipts_enabled=await NotificationCRUD.get_read_receipts_enabled(db, user_id),
    )


@notification_router.get("/preferences", response_model=NotificationPreferences)
async def get_preferences(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    return await _build_prefs(db, user.id)


@notification_router.put("/dnd", response_model=NotificationPreferences)
async def set_dnd(
    body: DndUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    ok = await NotificationCRUD.set_dnd(db, user.id, body.enabled, redis=get_redis())
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found"
        )
    return await _build_prefs(db, user.id)


@notification_router.put("/read-receipts", response_model=NotificationPreferences)
async def set_read_receipts(
    body: ReadReceiptsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    ok = await NotificationCRUD.set_read_receipts_enabled(db, user.id, body.enabled)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found"
        )
    # Notify chat partners so their UI updates instantly
    partner_ids = await ChatCRUD.get_chat_partners(db, user.id)
    if partner_ids:
        redis = get_redis()
        await redis.publish(PROFILE_EVENTS_CHANNEL, json.dumps({
            "user_id": user.id,
            "profile": {"read_receipts_changed": True, "read_receipts_enabled": body.enabled},
        }))
    return await _build_prefs(db, user.id)


@notification_router.put("/chats/{chat_id}/mute", response_model=NotificationPreferences)
async def set_chat_mute(
    chat_id: int,
    body: MuteUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    if not await cached_is_chat_member(get_redis(), db, chat_id, user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found"
        )
    await NotificationCRUD.set_chat_mute(db, user.id, chat_id, body.muted, redis=get_redis())
    return await _build_prefs(db, user.id)
