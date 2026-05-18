import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.api_v1.schemas.user import PhoneCodeVerify, PhoneRequest, ProfileUpdate, UserProfileResponse
from messenger.backend.app.crud.profile import ProfileCRUD
from messenger.backend.core.redis import get_redis
from messenger.backend.db.session import get_db_session
from messenger.backend.models.user import User

profile_router = APIRouter(prefix="/profiles", tags=["profiles"])


def _build_response(user) -> UserProfileResponse:
    """Flatten User + Profile ORM objects into a single response model."""
    p = user.profile
    return UserProfileResponse(
        user_id=user.id,
        username=user.username,
        name=user.name,
        phone_number=user.phone_number,
        display_name=p.display_name if p else None,
        bio=p.bio if p else None,
        status=p.status if p else "Offline",
        profile_photos=p.profile_photos if p else [],
    )


@profile_router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Return the authenticated user's own profile."""
    user = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _build_response(user)


@profile_router.put("/me", response_model=UserProfileResponse)
async def update_my_profile(
    data: ProfileUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Update the authenticated user's editable profile fields."""
    profile = await ProfileCRUD.update_profile(db, current_user.id, data)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    user = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    return _build_response(user)


@profile_router.post("/phone/send-code")
async def send_phone_code(
    data: PhoneRequest,
    current_user=Depends(get_current_user),
):
    redis = get_redis()
    key = f"phone_verify:{current_user.id}:{data.phone_number}"
    existing = await redis.get(key)
    if existing:
        code = existing
    else:
        code = str(secrets.randbelow(900000) + 100000)
        await redis.setex(key, 300, code)
    print(f"[DEV] Phone verification code for {data.phone_number}: {code}")
    return {"message": True}


@profile_router.post("/phone/verify", response_model=UserProfileResponse)
async def verify_phone_code(
    data: PhoneCodeVerify,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    redis = get_redis()
    key = f"phone_verify:{current_user.id}:{data.phone_number}"
    stored_code = await redis.get(key)
    if not stored_code or stored_code != data.code:
        raise HTTPException(status_code=400, detail="Invalid code")

    await redis.delete(key)

    user = await db.get(User, current_user.id)
    if user:
        user.phone_number = data.phone_number
        await db.commit()

    user_with_profile = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    return _build_response(user_with_profile)


@profile_router.get("/{user_id}", response_model=UserProfileResponse)
async def get_user_profile(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),  # require auth to view profiles
):
    """Return any user's profile (read-only for the requester)."""
    user = await ProfileCRUD.get_user_with_profile(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _build_response(user)
