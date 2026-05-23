from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.crud.push_subscription import PushSubscriptionCRUD
from messenger.backend.core.config import settings
from messenger.backend.db import get_db_session
from messenger.backend.models.user import User

push_router = APIRouter(prefix="/api/v1/push", tags=["push"])


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@push_router.get("/vapid-public-key")
async def get_vapid_public_key():
    if not settings.vapid_public_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push notifications are not configured",
        )
    return {"public_key": settings.vapid_public_key}


@push_router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe(
    body: PushSubscribeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    existing = await PushSubscriptionCRUD.get_by_endpoint(db, body.endpoint)
    if existing:
        if existing.user_id == user.id:
            return {"ok": True}
        # Endpoint transferred to a different user — delete old and re-create
        await PushSubscriptionCRUD.delete_by_endpoint(db, body.endpoint)

    await PushSubscriptionCRUD.create(
        db=db,
        user_id=user.id,
        endpoint=body.endpoint,
        p256dh=body.p256dh,
        auth=body.auth,
    )
    return {"ok": True}


@push_router.delete("/subscribe")
async def unsubscribe(
    body: PushSubscribeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    await PushSubscriptionCRUD.delete_by_endpoint(db, body.endpoint)
    return {"ok": True}
