from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.api_v1.schemas.notification import (
    DndUpdate,
    MuteUpdate,
    NotificationPreferences,
)
from messenger.backend.app.crud.chat import ChatCRUD
from messenger.backend.app.crud.notification import NotificationCRUD
from messenger.backend.db import get_db_session
from messenger.backend.models.user import User

notification_router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


async def _build_prefs(db: AsyncSession, user_id: int) -> NotificationPreferences:
    return NotificationPreferences(
        dnd=await NotificationCRUD.get_dnd(db, user_id),
        muted_chats=await NotificationCRUD.list_muted_chat_ids(db, user_id),
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
    ok = await NotificationCRUD.set_dnd(db, user.id, body.enabled)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found"
        )
    return await _build_prefs(db, user.id)


@notification_router.put("/chats/{chat_id}/mute", response_model=NotificationPreferences)
async def set_chat_mute(
    chat_id: int,
    body: MuteUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    if not await ChatCRUD.is_chat_member(db, chat_id, user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found"
        )
    await NotificationCRUD.set_chat_mute(db, user.id, chat_id, body.muted)
    return await _build_prefs(db, user.id)
