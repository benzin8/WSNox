from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.api_v1.schemas.user import ProfileUpdate, UserProfileResponse
from messenger.backend.app.crud.profile import ProfileCRUD
from messenger.backend.db.session import get_db_session

profile_router = APIRouter(prefix="/profiles", tags=["profiles"])


def _build_response(user) -> UserProfileResponse:
    """Flatten User + Profile ORM objects into a single response model."""
    p = user.profile
    return UserProfileResponse(
        user_id=user.id,
        username=user.username,
        name=user.name,
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
